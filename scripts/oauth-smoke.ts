// End-to-end smoke test for the MCP OAuth 2.1 flow: register -> authorize
// (session-gated) -> approve (same-origin-checked) -> code -> token (PKCE)
// -> /api/mcp works -> negatives (code replay, wrong verifier) -> cleanup.
//
// Session cookies: constructing the @supabase/ssr server-client cookie by
// hand rather than driving a browser. @supabase/ssr's createServerClient
// (see node_modules/@supabase/ssr/dist/main/cookies.js) stores the session
// under a single cookie name derived by supabase-js itself
// (dist/index.cjs: `sb-${new URL(url).hostname.split(".")[0]}-auth-token`,
// so "127" for http://127.0.0.1:54321) with value `base64-` +
// base64url(JSON.stringify(session)) (cookieEncoding defaults to
// "base64url" for server clients). Chunking (`<name>.0`, `<name>.1`, ...)
// only kicks in past ~3180 chars (node_modules/@supabase/ssr/dist/main/utils/chunker.js,
// MAX_CHUNK_SIZE) — local dev sessions are short-lived HS256 JWTs that stay
// well under that, but chunking is implemented below anyway so the script
// keeps working if that ever changes. This worked on the first attempt
// (verified: GET /oauth/authorize returned the 200 consent page, not a
// login redirect), so the Playwright fallback sanctioned by the plan was
// not needed.
//
// Dev-server strategy: same spawn/reuse/taskkill pattern as scripts/mcp-smoke.ts.

import { readFileSync, existsSync } from "node:fs";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { hashToken } from "../src/lib/api-tokens";

function loadDotEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadDotEnvLocal();

function createAdminClient(url: string, serviceKey: string) {
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
type Admin = ReturnType<typeof createAdminClient>;

const BASE_URL = "http://localhost:3000";
const MCP_URL = `${BASE_URL}/api/mcp`;
const USER_EMAIL = "mag@saf.com";
const USER_PASSWORD = "localdev123";
const SMOKE_REDIRECT_URI = "http://localhost:9999/cb";

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
].sort();

function fail(msg: string): never {
  throw new Error(msg);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) fail(msg);
}

// ---------------- dev server lifecycle (verbatim pattern from mcp-smoke.ts) ----------------

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
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch {
    // best-effort: process may already be gone
  }
}

let globalDevServer: ChildProcess | null = null;

// ---------------- @supabase/ssr cookie construction ----------------

const MAX_CHUNK_SIZE = 3180;

// Mirrors createChunks() in node_modules/@supabase/ssr/dist/main/utils/chunker.js.
// Simplified because our value is always pure base64url + a literal "base64-"
// prefix — no character in that alphabet needs percent-encoding, so
// encodeURIComponent(value).length === value.length here, unlike the general
// case the real chunker has to handle.
function buildSessionCookies(name: string, value: string): { name: string; value: string }[] {
  if (value.length <= MAX_CHUNK_SIZE) return [{ name, value }];
  const chunks: { name: string; value: string }[] = [];
  for (let i = 0, offset = 0; offset < value.length; i++, offset += MAX_CHUNK_SIZE) {
    chunks.push({ name: `${name}.${i}`, value: value.slice(offset, offset + MAX_CHUNK_SIZE) });
  }
  return chunks;
}

function cookieHeaderFor(session: unknown, supabaseUrl: string): string {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${ref}-auth-token`;
  const encoded = "base64-" + Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const cookies = buildSessionCookies(cookieName, encoded);
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

// ---------------- PKCE ----------------

function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ---------------- MCP Streamable HTTP client (same shape as mcp-smoke.ts) ----------------

let sessionId: string | undefined;
let nextId = 1;

async function sendMcp(token: string, body: Record<string, unknown>, expectResult: boolean): Promise<unknown> {
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
    if (!res.ok) fail(`notification ${JSON.stringify(body)} failed: ${res.status} ${await res.text()}`);
    return null;
  }

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!res.ok) fail(`MCP request ${JSON.stringify(body)} failed: ${res.status} ${text}`);

  if (contentType.includes("text/event-stream")) {
    const dataLines = text.split(/\r?\n/).filter((l) => l.startsWith("data:"));
    assert(dataLines.length > 0, `no "data:" lines in SSE response for ${body.method}: ${text}`);
    return JSON.parse(dataLines[dataLines.length - 1].slice("data:".length).trim());
  }
  return JSON.parse(text);
}

type JsonRpcResponse = { result?: unknown; error?: { code: number; message: string } };

async function rpcRequest(token: string, method: string, params?: unknown): Promise<unknown> {
  const id = nextId++;
  const payload = (await sendMcp(token, { jsonrpc: "2.0", id, method, params: params ?? {} }, true)) as JsonRpcResponse;
  if (payload?.error) fail(`${method} returned JSON-RPC error ${payload.error.code}: ${payload.error.message}`);
  return payload.result;
}

async function rpcNotify(token: string, method: string, params?: unknown): Promise<void> {
  await sendMcp(token, { jsonrpc: "2.0", method, params: params ?? {} }, false);
}

// ---------------- OAuth flow helpers ----------------

async function registerClient(): Promise<string> {
  const res = await fetch(`${BASE_URL}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "smoke", redirect_uris: [SMOKE_REDIRECT_URI] }),
  });
  const text = await res.text();
  assert(res.status === 201, `POST /oauth/register expected 201, got ${res.status}: ${text}`);
  const body = JSON.parse(text) as { client_id?: string; client_name?: string };
  assert(typeof body.client_id === "string" && body.client_id.length > 0, `register response missing client_id: ${text}`);
  assert(body.client_name === "smoke", `register response client_name mismatch: ${text}`);
  return body.client_id;
}

// GET /oauth/authorize with session cookies + a PKCE challenge, then POST the
// approve form with the same cookies + Origin header. Returns the minted code
// (and the verifier so the caller can exchange or deliberately mismatch it).
async function authorizeAndApprove(
  cookieHeader: string,
  clientId: string,
  state: string,
): Promise<{ code: string; verifier: string; challenge: string }> {
  const { verifier, challenge } = newPkcePair();

  const authorizeUrl = new URL(`${BASE_URL}/oauth/authorize`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", SMOKE_REDIRECT_URI);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);

  const getRes = await fetch(authorizeUrl, {
    headers: { Cookie: cookieHeader },
    redirect: "manual",
  });
  assert(
    getRes.status === 200,
    `GET /oauth/authorize expected 200 (consent page), got ${getRes.status}` +
      (getRes.status >= 300 && getRes.status < 400 ? ` -> Location: ${getRes.headers.get("location")}` : ""),
  );
  const html = await getRes.text();
  assert(html.includes("smoke"), `consent page did not mention client_name "smoke": ${html.slice(0, 300)}`);
  assert(html.includes(challenge), `consent page missing hidden code_challenge field: ${html.slice(0, 300)}`);

  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("redirect_uri", SMOKE_REDIRECT_URI);
  form.set("code_challenge", challenge);
  form.set("state", state);

  const approveRes = await fetch(`${BASE_URL}/oauth/authorize/approve`, {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      Origin: "http://localhost:3000",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
    redirect: "manual",
  });
  assert(approveRes.status === 303, `POST approve expected 303, got ${approveRes.status}: ${await approveRes.text()}`);
  const location = approveRes.headers.get("location");
  assert(location, "approve 303 response missing Location header");
  const redirectUrl = new URL(location);
  assert(
    redirectUrl.origin + redirectUrl.pathname === SMOKE_REDIRECT_URI,
    `approve redirected to unexpected URL: ${location}`,
  );
  const code = redirectUrl.searchParams.get("code");
  assert(code, `approve redirect missing code param: ${location}`);
  assert(redirectUrl.searchParams.get("state") === state, `approve redirect state mismatch: ${location}`);

  return { code, verifier, challenge };
}

async function exchangeToken(
  code: string,
  clientId: string,
  verifier: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: SMOKE_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    fail(`/oauth/token response was not JSON: ${res.status} ${text}`);
  }
  return { status: res.status, body };
}

// ---------------- main ----------------

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceKey) {
    fail(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY must be set (check .env.local)",
    );
  }
  // Refuses to run against anything that isn't obviously a local instance —
  // this script mints real api_tokens/oauth rows for mag@saf.com and deletes
  // them again; same guard rationale as e2e/global-setup.ts.
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(supabaseUrl)) {
    fail(`oauth-smoke refuses to run against non-local Supabase: ${supabaseUrl}`);
  }

  const admin = createAdminClient(supabaseUrl, serviceKey);

  // Ensure the dev user exists (idempotent — same tolerant pattern as
  // e2e/global-setup.ts), in case this script runs standalone before any
  // Playwright global setup has.
  const { error: createErr } = await admin.auth.admin.createUser({
    email: USER_EMAIL,
    password: USER_PASSWORD,
    email_confirm: true,
  });
  if (createErr && !/already.*registered|already.*exists/i.test(createErr.message)) {
    fail(`failed to ensure dev user exists: ${createErr.message}`);
  }

  let devServer: ChildProcess | null = null;
  let clientId: string | null = null;
  let mintedAccessToken: string | null = null;
  let allChecksPassed = false;

  try {
    // --- dev server: reuse if already up, else spawn it ourselves ---
    if (await probe(`${BASE_URL}/login`)) {
      console.log("dev server already running on :3000, reusing it");
    } else {
      console.log("spawning `npm run dev`...");
      devServer = spawn("npm run dev", { shell: true, stdio: ["ignore", "pipe", "pipe"] });
      globalDevServer = devServer;
      devServer.stderr?.on("data", (d) => process.stderr.write(`[dev] ${d}`));
      await waitForServer(`${BASE_URL}/login`);
      console.log("dev server ready");
    }

    // --- sign in as the dev user via supabase-js, build the @supabase/ssr cookie ---
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: signInData, error: signInErr } = await anon.auth.signInWithPassword({
      email: USER_EMAIL,
      password: USER_PASSWORD,
    });
    if (signInErr || !signInData.session) fail(`password sign-in failed: ${signInErr?.message}`);
    const cookieHeader = cookieHeaderFor(signInData.session, supabaseUrl);
    console.log(`signed in as ${USER_EMAIL}, constructed session cookie (${cookieHeader.length} chars)`);

    // --- (1) register ---
    clientId = await registerClient();
    console.log(`register OK (client_id=${clientId})`);

    // --- (2)-(4) authorize -> approve -> code ---
    const first = await authorizeAndApprove(cookieHeader, clientId, "state-1");
    console.log(`authorize+approve OK (code minted)`);

    // --- (5) token exchange with the correct verifier ---
    const tokenRes = await exchangeToken(first.code, clientId, first.verifier);
    assert(tokenRes.status === 200, `token exchange expected 200, got ${tokenRes.status}: ${JSON.stringify(tokenRes.body)}`);
    const accessToken = tokenRes.body.access_token;
    assert(
      typeof accessToken === "string" && accessToken.startsWith("fpt_"),
      `token exchange did not return an fpt_ access_token: ${JSON.stringify(tokenRes.body)}`,
    );
    mintedAccessToken = accessToken;
    console.log(`token exchange OK (access_token fpt_...)`);

    // --- (6) /api/mcp works ---
    const initResult = (await rpcRequest(mintedAccessToken, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "oauth-smoke", version: "1.0.0" },
    })) as { serverInfo?: { name?: string } };
    assert(
      initResult?.serverInfo?.name === "farsi-tracker",
      `unexpected initialize result: ${JSON.stringify(initResult)}`,
    );
    await rpcNotify(mintedAccessToken, "notifications/initialized");

    const listResult = (await rpcRequest(mintedAccessToken, "tools/list")) as { tools?: { name: string }[] };
    const names = (listResult?.tools ?? []).map((t) => t.name).sort();
    assert(
      JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
      `tools/list mismatch:\n  got:      ${JSON.stringify(names)}\n  expected: ${JSON.stringify(EXPECTED_TOOLS)}`,
    );
    console.log(`/api/mcp OK (initialize + tools/list, ${names.length} tools)`);

    // --- (7a) negative: replay the same code ---
    const replayRes = await exchangeToken(first.code, clientId, first.verifier);
    assert(replayRes.status === 400, `code replay expected 400, got ${replayRes.status}: ${JSON.stringify(replayRes.body)}`);
    assert(
      replayRes.body.error === "invalid_grant",
      `code replay expected error=invalid_grant, got ${JSON.stringify(replayRes.body)}`,
    );
    console.log("negative (code replay) OK -> invalid_grant");

    // --- (7b) negative: wrong verifier on a fresh code ---
    const second = await authorizeAndApprove(cookieHeader, clientId, "state-2");
    const { verifier: wrongVerifier } = newPkcePair();
    assert(wrongVerifier !== second.verifier, "generated wrong verifier collided with the real one");
    const wrongVerifierRes = await exchangeToken(second.code, clientId, wrongVerifier);
    assert(
      wrongVerifierRes.status === 400,
      `wrong-verifier exchange expected 400, got ${wrongVerifierRes.status}: ${JSON.stringify(wrongVerifierRes.body)}`,
    );
    assert(
      wrongVerifierRes.body.error === "invalid_grant",
      `wrong-verifier exchange expected error=invalid_grant, got ${JSON.stringify(wrongVerifierRes.body)}`,
    );
    console.log("negative (wrong verifier) OK -> invalid_grant");

    allChecksPassed = true;
  } catch (e) {
    console.error(`\nOAUTH SMOKE FAILED: ${(e as Error).message}`);
    process.exitCode = 1;
  } finally {
    let cleanupErr: Error | null = null;
    try {
      await cleanup(admin, { clientId, mintedAccessToken });
    } catch (e) {
      cleanupErr = e as Error;
      process.exitCode = 1;
    } finally {
      if (devServer) {
        console.log("stopping dev server...");
        killDevServer(devServer);
      }
      if (allChecksPassed && !cleanupErr && (process.exitCode === 0 || process.exitCode === undefined)) {
        console.log("OAUTH SMOKE OK");
      }
    }
  }
}

async function cleanup(admin: Admin, ctx: { clientId: string | null; mintedAccessToken: string | null }) {
  const errors: string[] = [];

  // Deleting the client cascades to oauth_codes (FK on delete cascade).
  if (ctx.clientId) {
    const { error } = await admin.from("oauth_clients").delete().eq("id", ctx.clientId);
    if (error) errors.push(`delete oauth_clients: ${error.message}`);
  }

  // Delete the minted api_tokens row by its exact hash.
  if (ctx.mintedAccessToken) {
    const hash = hashToken(ctx.mintedAccessToken);
    const { error } = await admin.from("api_tokens").delete().eq("token_hash", hash);
    if (error) errors.push(`delete api_tokens: ${error.message}`);
  }

  // Backstop: catch any stray "smoke (OAuth)" tokens left behind by a failed
  // run (e.g. a run that died between minting the token and this cleanup
  // running with the token variable populated).
  const { error: strayErr } = await admin.from("api_tokens").delete().like("name", "smoke (OAuth)%");
  if (strayErr) errors.push(`delete stray smoke api_tokens: ${strayErr.message}`);

  if (errors.length) {
    console.error(`cleanup had errors (manual check needed):\n  ${errors.join("\n  ")}`);
    throw new Error(`cleanup failed with ${errors.length} error(s)`);
  } else {
    console.log("cleanup OK — no oauth_clients/oauth_codes/api_tokens residue");
  }
}

process.on("SIGINT", () => {
  console.error("\nSIGINT received");
  if (globalDevServer) killDevServer(globalDevServer);
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.error("SIGTERM received");
  if (globalDevServer) killDevServer(globalDevServer);
  process.exit(143);
});

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
