import { createMcpHandler } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { authenticateToken } from "@/lib/api-tokens-server";
import { ContentPackageSchema } from "@/lib/content-package";
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
} from "@/lib/mcp/data";

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
        "Search the learner's vocabulary by Farsi, transliteration, or English text, to look up a specific word during a conversation or lesson.",
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
        "Add a new vocabulary item to the learner's active course, when a new word comes up that isn't tracked yet.",
      inputSchema: z.object({
        farsi: z.string().min(1),
        farsi_vocalized: z.string().optional(),
        transliteration: z.string().min(1),
        english: z.string().min(1),
        part_of_speech: z.string().optional(),
        present_stem: z.string().optional(),
        past_stem: z.string().optional(),
        colloquial: z.string().optional(),
      }),
    },
    (input) => toolResult(() => addVocab(userId, input)),
  );

  server.registerTool(
    "import_content_package",
    {
      description:
        "Import or update a course's units, lessons, vocab, and exercises from a farsi-tracker content package, when generating or loading new course content.",
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
        const parsed = ContentPackageSchema.safeParse(raw);
        if (!parsed.success) {
          return { valid: false, issues: parsed.error.issues };
        }
        return importPackage(userId, parsed.data);
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
    { serverInfo: { name: "farsi-tracker", version: "1.0.0" } },
  );
  return handler(req);
}

export { handleMcpRequest as GET, handleMcpRequest as POST, handleMcpRequest as DELETE };
