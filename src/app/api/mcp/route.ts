import { createMcpHandler } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { authenticateToken } from "@/lib/api-tokens-server";
import { parseAnyPackage } from "@/lib/content-package";
import {
  getStudyState,
  getLesson,
  getDueVocab,
  getStrugglingVocab,
  searchVocab,
  logPracticeSession,
  completeLesson,
  addVocab,
  importPackage,
  getReviewQueue,
  gradeCard,
  getTutorInstructions,
  createDrill,
  recordAttempt,
  getDrillResults,
} from "@/lib/mcp/data";
import { drillSchema } from "@/lib/exercises/schema";
import { DRILL_WIDGET_HTML } from "@/widgets/generated/drill-widget-html";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Every tool handler funnels through here: on success the data-layer's return
// value is the tool result, on throw it becomes an isError text result — same
// shape the brief specifies for all 11 tools, factored once instead of repeated
// try/catch per tool.
async function toolResult(fn: () => Promise<unknown>) {
  try {
    const out = await fn();
    return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
  } catch (e) {
    return {
      content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
      isError: true,
    };
  }
}

// For tools whose data-layer function returns freeform instruction PROSE, never
// data (currently only get_tutor_instructions): the string goes on the wire
// untouched, no JSON.stringify. Several other tools also happen to return a
// bare string at runtime (log_practice_session and add_vocab both resolve to a
// row id), but those are DATA — an opaque id the caller JSON.parses like every
// other tool result — so they must keep using toolResult above. This wrapper is
// selected per tool by identity/registration, not by the runtime type of the
// value, to avoid re-introducing that mix-up.
async function toolResultVerbatim(fn: () => Promise<string>) {
  try {
    const text = await fn();
    return { content: [{ type: "text" as const, text }] };
  } catch (e) {
    return {
      content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
      isError: true,
    };
  }
}

// For tools whose result must reach an MCP Apps widget as structured data
// (currently only present_drill): content carries the model-facing text,
// structuredContent carries the machine payload the widget reads via
// ontoolresult. Every other tool keeps toolResult's stringify contract —
// log_practice_session and add_vocab in particular MUST stay stringified.
async function toolResultStructured(
  fn: () => Promise<{ text: string; structured: Record<string, unknown> }>,
) {
  try {
    const { text, structured } = await fn();
    return { content: [{ type: "text" as const, text }], structuredContent: structured };
  } catch (e) {
    return {
      content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }],
      isError: true,
    };
  }
}

const limitShape = { limit: z.number().int().min(1).max(100).default(20) };

function registerTools(server: McpServer, userId: string) {
  server.registerTool(
    "get_study_state",
    {
      description:
        "Call at the start of a tutoring session: streak, due cards, next lesson, weak skills and frequent errors.",
      inputSchema: z.object({}),
    },
    () => toolResult(() => getStudyState(userId)),
  );

  server.registerTool(
    "get_lesson",
    {
      description:
        "Fetch a single lesson by its number, optionally including its full body markdown, to plan or review a specific lesson's content.",
      inputSchema: z.object({
        lesson_number: z.number().int().positive(),
        include_body: z.boolean().default(false),
      }),
    },
    ({ lesson_number, include_body }) =>
      toolResult(() => getLesson(userId, lesson_number, include_body)),
  );

  server.registerTool(
    "get_due_vocab",
    {
      description:
        "List vocabulary cards currently due for spaced-repetition review, to build or start a review session.",
      inputSchema: z.object(limitShape),
    },
    ({ limit }) => toolResult(() => getDueVocab(userId, limit)),
  );

  server.registerTool(
    "get_struggling_vocab",
    {
      description:
        "List vocabulary cards with the most lapses or lowest ease, to target extra practice at the words the learner finds hardest.",
      inputSchema: z.object(limitShape),
    },
    ({ limit }) => toolResult(() => getStrugglingVocab(userId, limit)),
  );

  server.registerTool(
    "search_vocab",
    {
      description:
        "Search the learner's vocabulary by term, transliteration, or translation text, to look up a specific word during a conversation or lesson.",
      inputSchema: z.object({
        query: z.string().min(1),
        ...limitShape,
      }),
    },
    ({ query, limit }) => toolResult(() => searchVocab(userId, query, limit)),
  );

  server.registerTool(
    "log_practice_session",
    {
      description:
        "Record a free-form practice session (quiz, conversation, or negar drill) with its errors and strengths, after a tutoring interaction wraps up.",
      inputSchema: z.object({
        mode: z.enum(["lesson", "quiz", "conversation", "negar"]).default("lesson"),
        duration_minutes: z.number().int().positive().optional(),
        lesson_number: z.number().int().positive().optional(),
        errors: z.array(z.string()).default([]),
        strengths: z.array(z.string()).default([]),
        raw_log: z.string().optional(),
      }),
    },
    (input) => toolResult(() => logPracticeSession(userId, input)),
  );

  server.registerTool(
    "complete_lesson",
    {
      description:
        "Mark a lesson as completed with optional confidence, homework, and per-skill ratings, once the learner has finished working through it.",
      inputSchema: z.object({
        lesson_number: z.number().int().positive(),
        minutes_spent: z.number().int().positive().optional(),
        confidence: z.number().int().min(1).max(5).optional(),
        homework_done: z.boolean().optional(),
        negar_drill_done: z.boolean().optional(),
        notes: z.string().optional(),
        skill_ratings: z.record(z.string(), z.number().int().min(1).max(5)).optional(),
      }),
    },
    ({ lesson_number, skill_ratings, ...rest }) =>
      toolResult(() =>
        completeLesson(userId, { lesson_number, skills: skill_ratings, ...rest }),
      ),
  );

  server.registerTool(
    "add_vocab",
    {
      description:
        "Add a new vocabulary item to the learner's active curriculum, when a new word comes up that isn't tracked yet.",
      inputSchema: z.object({
        term: z.string().min(1),
        term_vocalized: z.string().optional(),
        transliteration: z.string().min(1),
        translation: z.string().min(1),
        part_of_speech: z.string().optional(),
        morphology: z.record(z.string(), z.string()).optional(),
        colloquial: z.string().optional(),
      }),
    },
    (input) => toolResult(() => addVocab(userId, input)),
  );

  server.registerTool(
    "import_content_package",
    {
      description:
        "Import or update a curriculum's units, lessons, vocab, and exercises from a Parlay content package, when generating or loading new curriculum content.",
      inputSchema: z.object({ package: z.unknown() }),
    },
    ({ package: pkg }) =>
      toolResult(async () => {
        let raw = pkg;
        if (typeof raw === "string") {
          try {
            raw = JSON.parse(raw);
          } catch (e) {
            throw new Error(`package is not valid JSON: ${(e as Error).message}`);
          }
        }
        // parseAnyPackage upconverts a v1 payload (course{...}) to v2 (curriculum{...})
        // before validating, so both legacy and current generator prompts work here.
        try {
          const parsed = parseAnyPackage(raw);
          return importPackage(userId, parsed);
        } catch (e) {
          if (e instanceof z.ZodError) {
            return { valid: false, issues: e.issues };
          }
          throw e;
        }
      }),
  );

  server.registerTool(
    "get_review_queue",
    {
      description:
        "Get the learner's full spaced-repetition review queue ordered by priority, to drive an interactive review session.",
      inputSchema: z.object({}),
    },
    () => toolResult(() => getReviewQueue(userId)),
  );

  server.registerTool(
    "grade_card",
    {
      description:
        "Submit a spaced-repetition grade (0-5) for a vocab card after the learner answers it, to update its scheduling.",
      inputSchema: z.object({
        vocab_id: z.string().uuid(),
        grade: z.number().int().min(0).max(5),
        direction: z.enum(["fa_to_en", "en_to_fa", "stem"]).default("fa_to_en"),
        ms_taken: z.number().int().optional(),
      }),
    },
    ({ vocab_id, grade, direction, ms_taken }) =>
      toolResult(() => gradeCard(userId, vocab_id, grade, direction, ms_taken)),
  );

  server.registerTool(
    "get_tutor_instructions",
    {
      description:
        "Call this before tutoring: returns the tutoring workflow, content-authoring rules, and first-session guidance for this learner's target language. New connections should call this first.",
      inputSchema: z.object({ language: z.string().min(1).default("fa") }),
    },
    ({ language }) => toolResultVerbatim(() => getTutorInstructions(userId, language)),
  );

  const DRILL_WIDGET_URI = "ui://parlay/drill.html";

  server.registerTool(
    "present_drill",
    {
      description:
        "Present an interactive drill (1-10 exercises: choice, typed, cloze, match) to the learner. In hosts that support MCP Apps the drill renders as an interactive card in the chat and attempts are recorded automatically; when it completes, call get_drill_results. If the learner reports no card appeared, run the exercises conversationally and grade with grade_card instead.",
      inputSchema: z.object({ drill: z.unknown() }),
      _meta: {
        ui: { resourceUri: DRILL_WIDGET_URI },
        "ui/resourceUri": DRILL_WIDGET_URI, // legacy MCP Apps alias
        "openai/outputTemplate": DRILL_WIDGET_URI, // ChatGPT Apps SDK alias
      },
    },
    ({ drill }) =>
      toolResultStructured(async () => {
        let raw: unknown = drill;
        if (typeof raw === "string") {
          try {
            raw = JSON.parse(raw);
          } catch (e) {
            throw new Error(`drill is not valid JSON: ${(e as Error).message}`);
          }
        }
        const parsed = drillSchema.safeParse(raw);
        if (!parsed.success) {
          throw new Error(`invalid drill: ${JSON.stringify(parsed.error.issues)}`);
        }
        const { drillId, exerciseCount } = await createDrill(userId, parsed.data);
        return {
          text: `Drill ${drillId} presented (${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}). Wait for the learner to finish it in the interactive card, then call get_drill_results. If no card is visible to the learner, run the exercises conversationally instead.`,
          structured: { drill_id: drillId, drill: parsed.data },
        };
      }),
  );

  server.registerTool(
    "record_attempt",
    {
      description:
        "Record one answered exercise of a presented drill (normally called by the drill widget itself). Applies an SRS grade automatically when the exercise is linked to a vocab item.",
      inputSchema: z.object({
        drill_id: z.string().uuid(),
        exercise_id: z.string().min(1),
        correct: z.boolean(),
        answer_given: z.string().optional(),
        ms_taken: z.number().int().nonnegative().optional(),
      }),
    },
    (input) => toolResult(() => recordAttempt(userId, input)),
  );

  server.registerTool(
    "get_drill_results",
    {
      description:
        "Fetch the recorded results of a presented drill (per-exercise correctness, timing, totals) to review performance and adapt the session.",
      inputSchema: z.object({ drill_id: z.string().uuid() }),
    },
    ({ drill_id }) => toolResult(() => getDrillResults(userId, drill_id)),
  );

  server.registerResource(
    "parlay-drill-widget",
    DRILL_WIDGET_URI,
    {
      description: "Parlay interactive drill player",
      mimeType: "text/html;profile=mcp-app",
    },
    async () => ({
      contents: [
        {
          uri: DRILL_WIDGET_URI,
          mimeType: "text/html;profile=mcp-app",
          // SITE substitution keeps the widget URL-free at build time; the CSP
          // declaration lets the iframe load the Estedad font from our origin.
          text: DRILL_WIDGET_HTML.replaceAll("__PARLAY_SITE__", SITE),
          _meta: { ui: { csp: { resourceDomains: [SITE] } } },
        },
      ],
    }),
  );
}

// mcp-handler 2.x's createMcpHandler(initializeServer, options) has no basePath
// or route-config options (removed vs. 1.x — see node_modules/mcp-handler/README.md
// migration notes); the handler is mounted directly at this route's path instead,
// and is built fresh per request so it can close over the authenticated userId.
async function handleMcpRequest(req: Request): Promise<Response> {
  const auth = await authenticateToken(req.headers.get("authorization"));
  if (!auth) {
    return new Response(JSON.stringify({ error: "invalid or missing API token" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        // Points OAuth-aware clients (claude.ai's connector UI) at the
        // protected-resource metadata doc so they can discover the
        // authorization server and start the OAuth flow instead of just
        // failing silently.
        "WWW-Authenticate": `Bearer resource_metadata="${SITE}/.well-known/oauth-protected-resource"`,
      },
    });
  }
  const handler = createMcpHandler(
    (server) => registerTools(server, auth.userId),
    { serverInfo: { name: "parlay", version: "1.0.0" } },
  );
  return handler(req);
}

export { handleMcpRequest as GET, handleMcpRequest as POST, handleMcpRequest as DELETE };
