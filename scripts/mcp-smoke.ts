// End-to-end smoke test for /api/mcp: mints a real token, speaks Streamable HTTP
// (initialize -> notifications/initialized -> tools/list -> tools/call ...) against
// a live dev server, verifies side effects via the admin client, then deletes
// everything it created so the dev user (mag@saf.com) is left at zero progress —
// exactly as it was before the run.
//
// Dev-server strategy: this script spawns `npm run dev` itself (unless something
// is already answering on :3000/login) and waits for it to come up, so
// `npm run mcp:smoke` is a single command. It tears the spawned server back down
// (process-tree kill on Windows) in the `finally` block, whether the run passed
// or failed.

import { readFileSync, existsSync } from "node:fs";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { generateToken } from "../src/lib/api-tokens";

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotEnvLocal();

// Non-generic wrapper so `ReturnType<typeof createAdminClient>` below resolves to a
// concrete monomorphized type, matching src/lib/supabase/admin.ts's own pattern —
// `ReturnType<typeof createClient>` directly would pick up createClient's generic
// defaults instead of the inferred columns/types from this specific call.
function createAdminClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
type Admin = ReturnType<typeof createAdminClient>;

const BASE_URL = "http://localhost:3000";
const MCP_URL = `${BASE_URL}/api/mcp`;
const USER_EMAIL = "mag@saf.com";

const EXPECTED_TOOLS = [
  "get_study_state",
  "get_lesson",
  "get_due_vocab",
  "get_struggling_vocab",
  "search_vocab",
  "log_practice_session",
  "complete_lesson",
  "add_vocab",
  "import_content_package",
  "get_review_queue",
  "grade_card",
  "get_tutor_instructions",
  "present_drill",
  "record_attempt",
  "get_drill_results",
].sort();

function fail(msg: string): never {
  throw new Error(msg);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

// ---------------- dev server lifecycle ----------------

async function probe(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await probe(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`dev server did not become ready at ${url} within ${timeoutMs}ms`);
}

function killDevServer(child: ChildProcess) {
  if (child.pid == null) return;
  try {
    if (process.platform === "win32") {
      // spawn() with shell:true on Windows launches cmd.exe, which in turn
      // launches npm.cmd -> node (next dev) -> further worker processes;
      // child.kill() only kills the cmd.exe shell, not the tree. /T kills
      // the whole tree, /F forces it.
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    // best-effort: process may already be gone
  }
}

// ---------------- MCP Streamable HTTP client ----------------

let sessionId: string | undefined;
let nextId = 1;

// Global reference for signal handlers to ensure dev server is killed
let globalDevServer: ChildProcess | null = null;

async function sendMcp(
  token: string,
  body: Record<string, unknown>,
  expectResult: boolean,
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;

  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const sid = res.headers.get("mcp-session-id");
  if (sid) sessionId = sid;

  if (!expectResult) {
    // Notifications get a bare 202 with no body.
    if (!res.ok) fail(`notification ${JSON.stringify(body)} failed: ${res.status} ${await res.text()}`);
    return null;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!res.ok) fail(`MCP request ${JSON.stringify(body)} failed: ${res.status} ${text}`);

  // mcp-handler 2.1.0 (SDK v2) answers with SSE by default (no enableJsonResponse
  // set on the route) — take the last `data:` line, per the plan's parsing helper.
  if (contentType.includes("text/event-stream")) {
    const dataLines = text.split(/\r?\n/).filter((l) => l.startsWith("data:"));
    assert(dataLines.length > 0, `no "data:" lines in SSE response for ${body.method}: ${text}`);
    return JSON.parse(dataLines[dataLines.length - 1].slice("data:".length).trim());
  }
  return JSON.parse(text);
}

type JsonRpcResponse = {
  result?: unknown;
  error?: { code: number; message: string };
};

async function rpcRequest(token: string, method: string, params?: unknown): Promise<unknown> {
  const id = nextId++;
  const payload = (await sendMcp(
    token,
    { jsonrpc: "2.0", id, method, params: params ?? {} },
    true,
  )) as JsonRpcResponse;
  if (payload?.error) {
    fail(`${method} returned JSON-RPC error ${payload.error.code}: ${payload.error.message}`);
  }
  return payload.result;
}

async function rpcNotify(token: string, method: string, params?: unknown): Promise<void> {
  await sendMcp(token, { jsonrpc: "2.0", method, params: params ?? {} }, false);
}

async function callToolRaw(
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<string> {
  const result = (await rpcRequest(token, "tools/call", { name, arguments: args })) as {
    content?: { text?: string }[];
    isError?: boolean;
  };
  const text = result?.content?.[0]?.text;
  assert(typeof text === "string", `${name} tool result missing content[0].text: ${JSON.stringify(result)}`);
  if (result.isError) fail(`${name} returned isError: ${text}`);
  return text;
}

async function callTool(token: string, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const text = await callToolRaw(token, name, args);
  return JSON.parse(text);
}

// ---------------- main ----------------

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set (check .env.local)");
  }
  const admin = createAdminClient(supabaseUrl, serviceKey);

  const { data: profile, error: profErr } = await admin
    .from("profiles").select("id").eq("email", USER_EMAIL).single();
  if (profErr || !profile) fail(`no profile for ${USER_EMAIL} (seed the DB first): ${profErr?.message}`);
  const userId = profile.id as string;

  // Mint the token directly (service role, deliberately bypassing the TokenManager UI —
  // generateToken is the pure helper Task 2's UI also uses under the hood).
  const { token, hash } = generateToken();
  const { data: tokenRow, error: tokenErr } = await admin
    .from("api_tokens")
    .insert({ user_id: userId, name: "mcp-smoke (auto-deleted)", token_hash: hash })
    .select("id")
    .single();
  if (tokenErr || !tokenRow) fail(`failed to mint token: ${tokenErr?.message}`);
  const tokenId = tokenRow.id as string;

  let devServer: ChildProcess | null = null;
  let createdPracticeSessionId: string | null = null;
  let gradedVocabId: string | null = null;
  let preExistingVocabReview: Record<string, unknown> | null = null;
  const studyDaysBefore = new Map<string, number>();
  const reviewLogIdsBefore = new Set<string | number>();
  let allChecksPassed = false;

  try {
    // --- dev server: reuse if already up, else spawn it ourselves ---
    if (await probe(`${BASE_URL}/login`)) {
      console.log("dev server already running on :3000, reusing it");
    } else {
      console.log("spawning `npm run dev`...");
      // shell:true is required on Windows to resolve "npm" (npm.cmd, not a direct
      // executable) — spawning npm.cmd directly with shell:false throws EINVAL there.
      // Pass the whole invocation as one string (not an args array) so Node doesn't
      // emit the DEP0190 unescaped-arg-concatenation deprecation warning; there's no
      // untrusted input in this fixed command.
      devServer = spawn("npm run dev", {
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      globalDevServer = devServer;
      devServer.stderr?.on("data", (d) => process.stderr.write(`[dev] ${d}`));
      await waitForServer(`${BASE_URL}/login`);
      console.log("dev server ready");
    }

    // --- initialize / notifications/initialized ---
    const initResult = (await rpcRequest(token, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "mcp-smoke", version: "1.0.0" },
    })) as { serverInfo?: { name?: string } };
    assert(
      initResult?.serverInfo?.name === "parlay",
      `unexpected initialize result: ${JSON.stringify(initResult)}`,
    );
    await rpcNotify(token, "notifications/initialized");

    // --- tools/list: assert exactly the 15 names ---
    const listResult = (await rpcRequest(token, "tools/list")) as {
      tools?: { name: string; _meta?: Record<string, unknown> }[];
    };
    const toolsListed = listResult?.tools ?? [];
    const names = toolsListed.map((t) => t.name).sort();
    assert(
      JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
      `tools/list mismatch:\n  got:      ${JSON.stringify(names)}\n  expected: ${JSON.stringify(EXPECTED_TOOLS)}`,
    );
    console.log(`tools/list OK (${names.length} tools)`);

    // --- MCP Apps assertions: present_drill's _meta wiring + the widget resource ---
    const presentDrill = toolsListed.find((t) => t.name === "present_drill");
    assert(presentDrill, "present_drill missing from tools/list");
    const uiMeta = (presentDrill?._meta ?? {}) as Record<string, unknown>;
    assert(
      (uiMeta.ui as { resourceUri?: string } | undefined)?.resourceUri === "ui://parlay/drill.html",
      "present_drill _meta.ui.resourceUri wrong",
    );
    assert(uiMeta["openai/outputTemplate"] === "ui://parlay/drill.html", "openai/outputTemplate alias missing");

    const resList = (await rpcRequest(token, "resources/list", {})) as { resources?: { uri: string }[] };
    const uris = (resList.resources ?? []).map((r) => r.uri);
    assert(uris.includes("ui://parlay/drill.html"), `widget resource not listed (got: ${uris.join(", ")})`);

    const resRead = (await rpcRequest(token, "resources/read", { uri: "ui://parlay/drill.html" })) as {
      contents?: { mimeType?: string; text?: string }[];
    };
    const widgetContents = resRead.contents?.[0];
    assert(widgetContents?.mimeType === "text/html;profile=mcp-app", "widget resource mimeType wrong");
    assert(
      typeof widgetContents?.text === "string" && /<!doctype html/i.test(widgetContents.text),
      "widget resource is not an HTML doc",
    );
    assert(widgetContents!.text!.includes("parlay-drill"), "widget HTML missing marker");
    assert(!widgetContents!.text!.includes("__PARLAY_SITE__"), "SITE placeholder not substituted");
    console.log("MCP Apps assertions OK (present_drill _meta, widget resource listed + read)");

    // --- get_study_state ---
    const state = (await callTool(token, "get_study_state")) as Record<string, unknown>;
    assert(
      "streak" in state && "cardsDue" in state,
      `get_study_state missing streak/cardsDue keys: ${JSON.stringify(state)}`,
    );
    const cardsDue = state.cardsDue as number;

    // Cross-check: cardsDue must equal the admin count of due, unsuspended vocab_reviews
    // (due_on <= today and not suspended)
    const todayIso = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const { data: dueCards, error: dueErr } = await admin
      .from("vocab_reviews").select("id", { count: "exact" })
      .eq("user_id", userId)
      .eq("suspended", false)
      .lte("due_on", todayIso);
    if (dueErr) fail(`failed to cross-check cardsDue: ${dueErr.message}`);
    const adminDueCount = dueCards?.length ?? 0;
    assert(
      cardsDue === adminDueCount,
      `cardsDue mismatch: tool returned ${cardsDue}, admin count = ${adminDueCount}`,
    );

    console.log(`get_study_state OK (streak=${state.streak}, cardsDue=${state.cardsDue})`);

    // --- log_practice_session ---
    const practiceSessionId = await callTool(token, "log_practice_session", {
      mode: "conversation",
      errors: ["dropped را"],
    });
    assert(typeof practiceSessionId === "string", `log_practice_session did not return an id string: ${JSON.stringify(practiceSessionId)}`);
    createdPracticeSessionId = practiceSessionId;

    const { data: psRow, error: psErr } = await admin
      .from("practice_sessions").select("id, mode, errors").eq("id", practiceSessionId).maybeSingle();
    if (psErr || !psRow) fail(`practice_sessions row not found after log_practice_session: ${psErr?.message}`);
    assert(psRow.mode === "conversation", `practice_sessions.mode mismatch: ${JSON.stringify(psRow)}`);
    console.log(`log_practice_session OK (practice_sessions row ${practiceSessionId} verified)`);

    // --- get_review_queue ---
    const queueResult = await callTool(token, "get_review_queue");
    assert(Array.isArray(queueResult) && queueResult.length > 0, `get_review_queue returned no items: ${JSON.stringify(queueResult)}`);
    const queue = queueResult as { vocab_id: string; term: string; translation: string }[];
    assert(queue.length <= 20, `get_review_queue returned ${queue.length} items, expected <= 20`);
    const firstItem = queue[0];
    assert(typeof firstItem.vocab_id === "string", `queue item missing vocab_id: ${JSON.stringify(firstItem)}`);
    assert(typeof firstItem.term === "string" && firstItem.term.length > 0,
      `queue item missing term field: ${JSON.stringify(firstItem)}`);
    assert(typeof firstItem.translation === "string" && firstItem.translation.length > 0,
      `queue item missing translation field: ${JSON.stringify(firstItem)}`);
    gradedVocabId = firstItem.vocab_id;

    // Cross-check: each vocab_id in the queue must exist in vocab_items owned by the user's curriculums
    const queueVocabIds = queue.map((item) => item.vocab_id);

    // Get the user's owned curriculums
    const { data: userCurriculums, error: curriculumsErr } = await admin
      .from("curriculums").select("id").eq("owner_id", userId);
    if (curriculumsErr) fail(`failed to get user curriculums: ${curriculumsErr?.message}`);
    const curriculumIds = (userCurriculums ?? []).map((c) => c.id as string);

    if (curriculumIds.length > 0 && queueVocabIds.length > 0) {
      const { data: vocabCheck, error: vocabErr } = await admin
        .from("vocab_items").select("id", { count: "exact" })
        .in("id", queueVocabIds)
        .in("curriculum_id", curriculumIds);
      if (vocabErr) fail(`failed to cross-check queue vocab_ids: ${vocabErr.message}`);
      const vocabCheckCount = vocabCheck?.length ?? 0;
      assert(
        vocabCheckCount === queueVocabIds.length,
        `queue vocab_id mismatch: found ${vocabCheckCount}/${queueVocabIds.length} in user's curriculums`,
      );
    }

    console.log(`get_review_queue OK (${queue.length} items, grading vocab_id=${gradedVocabId})`);

    // Snapshot what grade_card is about to touch, so cleanup can restore the
    // exact pre-run state rather than assuming it started empty.
    const { data: existingReview } = await admin
      .from("vocab_reviews").select("*").eq("user_id", userId).eq("vocab_id", gradedVocabId).maybeSingle();
    preExistingVocabReview = existingReview ?? null;

    const { data: rlBefore, error: rlBeforeErr } = await admin
      .from("review_log").select("id").eq("user_id", userId);
    if (rlBeforeErr) fail(`failed to snapshot review_log: ${rlBeforeErr.message}`);
    for (const r of rlBefore ?? []) reviewLogIdsBefore.add(r.id as string | number);

    const { data: sdBefore, error: sdBeforeErr } = await admin
      .from("study_days").select("day, cards_reviewed").eq("user_id", userId);
    if (sdBeforeErr) fail(`failed to snapshot study_days: ${sdBeforeErr.message}`);
    for (const row of sdBefore ?? []) studyDaysBefore.set(row.day as string, row.cards_reviewed as number);

    // --- grade_card ---
    const graded = await callTool(token, "grade_card", { vocab_id: gradedVocabId, grade: 4 });
    assert(graded && typeof graded === "object", `grade_card returned unexpected result: ${JSON.stringify(graded)}`);

    const { data: rlRows, error: rlErr } = await admin
      .from("review_log").select("id").eq("user_id", userId).eq("vocab_id", gradedVocabId)
      .order("reviewed_at", { ascending: false }).limit(1);
    if (rlErr || !rlRows?.length) fail(`review_log row not found after grade_card: ${rlErr?.message}`);
    console.log(`grade_card OK (review_log row ${rlRows[0].id} verified)`);

    // --- get_tutor_instructions (default language: fa) ---
    // Read the RAW wire text (no JSON.parse) — this tool returns plain instruction
    // prose, not a JSON value, so the raw bytes on the wire must be the unquoted,
    // un-escaped string itself (see toolResult's string branch in route.ts).
    const instructionsText = await callToolRaw(token, "get_tutor_instructions");
    assert(
      instructionsText.startsWith("You are a "),
      `get_tutor_instructions raw text does not start with unquoted "You are a ": ${instructionsText.slice(0, 50)}`,
    );
    assert(
      instructionsText.includes("\n# Role"),
      `get_tutor_instructions raw text missing a real newline before "# Role" (looks JSON-escaped): ${instructionsText.slice(0, 200)}`,
    );
    assert(
      instructionsText.includes("import_content_package"),
      `get_tutor_instructions missing "import_content_package": ${instructionsText.slice(0, 200)}`,
    );
    assert(
      instructionsText.includes("ZWNJ"),
      `get_tutor_instructions missing "ZWNJ" (fa language rules): ${instructionsText.slice(0, 200)}`,
    );
    assert(
      instructionsText.includes("no curriculum yet"),
      `get_tutor_instructions missing "no curriculum yet": ${instructionsText.slice(0, 200)}`,
    );
    // TODO(Task 9): enable once get_tutor_instructions documents present_drill
    // assert(instructionsText.includes("present_drill"), "tutor instructions missing drill guidance");
    console.log("get_tutor_instructions OK (raw text unescaped, import_content_package, ZWNJ, no curriculum yet all present)");

    // --- drill round-trip: present_drill -> record_attempt -> get_drill_results ---
    // Reuses gradedVocabId (a real vocab_id already owned by the smoke user, surfaced by
    // get_review_queue above) as the exercise's vocab_id — there's no add_vocab flow in this
    // script to mint a fresh id from, and reusing gradedVocabId means the existing
    // preExistingVocabReview/review_log/study_days cleanup below already restores whatever
    // record_attempt's SRS side-effect touches, with no extra drill-specific vocab cleanup.
    //
    // Snapshot repetitions BEFORE this round-trip (the earlier grade_card call above already
    // pushed it to >= 1, so a bare ">= 1" check after record_attempt can't tell its SRS
    // side-effect apart from that prior call). drillGrade(true) is a fixed 4 (> 2), which
    // grade_card_for's SM-2 branch always turns into exactly repetitions += 1, so a strict
    // "+1" is a reliable, non-flaky assertion here — not just "some grade happened".
    const { data: reviewRowBefore } = await admin.from("vocab_reviews").select("repetitions")
      .eq("user_id", userId).eq("vocab_id", gradedVocabId).maybeSingle();
    const repetitionsBefore = reviewRowBefore?.repetitions ?? 0;

    const drillCallResult = (await rpcRequest(token, "tools/call", {
      name: "present_drill",
      arguments: {
        drill: {
          language: "fa",
          title: "smoke drill",
          exercises: [
            {
              id: "s1", type: "choice", prompt: { text: "pick" }, vocab_id: gradedVocabId,
              options: [{ id: "a", text: "آب", script: true }, { id: "b", text: "نان", script: true }],
              correct_id: "a",
            },
          ],
        },
      },
    })) as { isError?: boolean; content?: unknown; structuredContent?: unknown };
    assert(!drillCallResult.isError, `present_drill errored: ${JSON.stringify(drillCallResult.content)}`);
    const sc = drillCallResult.structuredContent as { drill_id: string; drill: { exercises: unknown[] } };
    assert(typeof sc?.drill_id === "string" && sc.drill_id.length === 36, "present_drill structuredContent.drill_id missing");
    assert(sc.drill.exercises.length === 1, "structuredContent.drill roundtrip failed");

    const rec = (await callTool(token, "record_attempt", {
      drill_id: sc.drill_id, exercise_id: "s1", correct: true, answer_given: "a", ms_taken: 1200,
    })) as { recorded: boolean; srs_applied: boolean };
    assert(rec.recorded === true, "record_attempt failed");
    assert(rec.srs_applied === true, "record_attempt did not apply SRS grade");

    const drillResults = (await callTool(token, "get_drill_results", { drill_id: sc.drill_id })) as {
      total: number; answered: number; correct: number;
    };
    assert(
      drillResults.total === 1 && drillResults.answered === 1 && drillResults.correct === 1,
      `bad drill results: ${JSON.stringify(drillResults)}`,
    );

    // cross-check SRS side-effect with the admin client: vocab_reviews row advanced by
    // exactly this call's grade (strict +1 over the pre-round-trip snapshot), not just
    // "some grade happened at some point in this run" (rec.srs_applied is self-reported
    // by the function under test, so this needs independent discriminating power).
    const { data: reviewRow } = await admin.from("vocab_reviews").select("repetitions")
      .eq("user_id", userId).eq("vocab_id", gradedVocabId).maybeSingle();
    assert(
      reviewRow && reviewRow.repetitions === repetitionsBefore + 1,
      `grade_card_for side-effect missing or wrong: before=${repetitionsBefore}, after=${reviewRow?.repetitions}`,
    );
    console.log(`drill round-trip OK (drill ${sc.drill_id}, record_attempt + get_drill_results + SRS verified)`);

    // Mark that all checks passed; cleanup will be exception-safe
    allChecksPassed = true;
  } catch (e) {
    console.error(`\nMCP SMOKE FAILED: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    // --- cleanup: restore mag@saf.com to zero progress, whatever happened above ---
    let cleanupErr: Error | null = null;
    try {
      await cleanup(admin, {
        userId,
        tokenId,
        practiceSessionId: createdPracticeSessionId,
        gradedVocabId,
        preExistingVocabReview,
        reviewLogIdsBefore,
        studyDaysBefore,
      });
    } catch (e) {
      cleanupErr = e as Error;
      process.exitCode = 1;
    } finally {
      // Always kill dev server, even if cleanup fails
      if (devServer) {
        console.log("stopping dev server...");
        killDevServer(devServer);
      }

      // Print success line only if all checks passed AND cleanup succeeded
      if (allChecksPassed && !cleanupErr && (process.exitCode === 0 || process.exitCode === undefined)) {
        console.log("MCP SMOKE OK (15 tools, state/log/queue/grade/tutor-instructions/drill round-trip verified, cleaned up)");
      }
    }
  }
}

async function cleanup(
  admin: Admin,
  ctx: {
    userId: string;
    tokenId: string;
    practiceSessionId: string | null;
    gradedVocabId: string | null;
    preExistingVocabReview: Record<string, unknown> | null;
    reviewLogIdsBefore: Set<string | number>;
    studyDaysBefore: Map<string, number>;
  },
) {
  const errors: string[] = [];

  // Delete drills created by present_drill (drill_attempts cascade via FK)
  try {
    const { error } = await admin.from("drills").delete().eq("user_id", ctx.userId);
    if (error) errors.push(`delete drills: ${error.message}`);
  } catch (e) {
    errors.push(`delete drills exception: ${(e as Error).message}`);
  }

  // Delete practice_sessions
  if (ctx.practiceSessionId) {
    try {
      const { error } = await admin.from("practice_sessions").delete().eq("id", ctx.practiceSessionId);
      if (error) errors.push(`delete practice_sessions: ${error.message}`);
    } catch (e) {
      errors.push(`delete practice_sessions exception: ${(e as Error).message}`);
    }
  }

  // Delete/restore review_log
  if (ctx.gradedVocabId) {
    try {
      const { data: rlNow, error: rlErr } = await admin
        .from("review_log").select("id").eq("user_id", ctx.userId).eq("vocab_id", ctx.gradedVocabId);
      if (rlErr) {
        errors.push(`snapshot review_log for cleanup: ${rlErr.message}`);
      } else {
        const newIds = (rlNow ?? []).map((r) => r.id as string | number)
          .filter((id) => !ctx.reviewLogIdsBefore.has(id));
        if (newIds.length) {
          const { error } = await admin.from("review_log").delete().in("id", newIds);
          if (error) errors.push(`delete review_log: ${error.message}`);
        }
      }
    } catch (e) {
      errors.push(`review_log cleanup exception: ${(e as Error).message}`);
    }
  }

  // Delete/restore vocab_reviews
  if (ctx.gradedVocabId) {
    try {
      // vocab_reviews: restore the pre-grade snapshot exactly (delete if grade_card
      // created it fresh, restore prior columns if a row already existed).
      if (ctx.preExistingVocabReview) {
        const rest = { ...ctx.preExistingVocabReview };
        delete rest.id;
        const { error } = await admin.from("vocab_reviews").update(rest)
          .eq("user_id", ctx.userId).eq("vocab_id", ctx.gradedVocabId);
        if (error) errors.push(`restore vocab_reviews: ${error.message}`);
      } else {
        const { error } = await admin.from("vocab_reviews").delete()
          .eq("user_id", ctx.userId).eq("vocab_id", ctx.gradedVocabId);
        if (error) errors.push(`delete vocab_reviews: ${error.message}`);
      }
    } catch (e) {
      errors.push(`vocab_reviews cleanup exception: ${(e as Error).message}`);
    }
  }

  // Restore study_days
  if (ctx.gradedVocabId) {
    try {
      // study_days: restore the pre-grade snapshot (delete rows grade_card created,
      // restore cards_reviewed on rows it merely bumped).
      const { data: sdNow, error: sdErr } = await admin
        .from("study_days").select("day, cards_reviewed").eq("user_id", ctx.userId);
      if (sdErr) {
        errors.push(`snapshot study_days for cleanup: ${sdErr.message}`);
      } else {
        for (const row of sdNow ?? []) {
          const day = row.day as string;
          const before = ctx.studyDaysBefore.get(day);
          if (before === undefined) {
            const { error } = await admin.from("study_days").delete()
              .eq("user_id", ctx.userId).eq("day", day);
            if (error) errors.push(`delete study_days ${day}: ${error.message}`);
          } else if (before !== row.cards_reviewed) {
            const { error } = await admin.from("study_days").update({ cards_reviewed: before })
              .eq("user_id", ctx.userId).eq("day", day);
            if (error) errors.push(`restore study_days ${day}: ${error.message}`);
          }
        }
      }
    } catch (e) {
      errors.push(`study_days cleanup exception: ${(e as Error).message}`);
    }
  }

  // Delete api_tokens
  try {
    const { error: tokenDelErr } = await admin.from("api_tokens").delete().eq("id", ctx.tokenId);
    if (tokenDelErr) errors.push(`delete api_tokens: ${tokenDelErr.message}`);
  } catch (e) {
    errors.push(`delete api_tokens exception: ${(e as Error).message}`);
  }

  if (errors.length) {
    console.error(`cleanup had errors (manual check needed):\n  ${errors.join("\n  ")}`);
    throw new Error(`cleanup failed with ${errors.length} error(s)`);
  } else {
    console.log("cleanup OK — mag@saf.com restored to zero progress");
  }
}

// Signal handlers for graceful shutdown
process.on("SIGINT", () => {
  console.error("\nSIGINT received");
  if (globalDevServer) {
    killDevServer(globalDevServer);
  }
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.error("SIGTERM received");
  if (globalDevServer) {
    killDevServer(globalDevServer);
  }
  process.exit(143);
});

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
