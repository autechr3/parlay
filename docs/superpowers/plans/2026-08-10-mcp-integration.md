# MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the tracker to LLM apps (Claude Desktop / claude.ai / Claude Code) as an authenticated MCP server with 11 tools, replacing the copy-paste loop and finally giving `practice_sessions` an ingestion path.

**Architecture:** Streamable-HTTP MCP endpoint at `/api/mcp` (`mcp-handler` adapter, per-request handler capturing the authenticated user). Personal API tokens (sha256-hashed, `/settings`-managed). Token calls run through `security definer` `_for(p_user)` SQL variants (SRS) and a scoped data layer over the admin client (everything else), reusing `importContentPackage` and the completion semantics unchanged. Spec: `docs/superpowers/specs/2026-08-09-farsi-progress-tracker-design.md` §MCP integration.

**Tech Stack:** mcp-handler, @modelcontextprotocol/sdk (transitive), zod, node:crypto, existing Supabase local stack.

## Global Constraints

- Tokens: format `fpt_` + 32 random bytes base64url; stored ONLY as sha256 hex; displayed once at creation; `last_used_at` updated on successful auth; revocation = row delete, effective immediately.
- `/api/mcp` self-authenticates: middleware exemption uses a boundary-safe pattern (`/^\/api\/mcp(\/|$)/`) — do NOT repeat the loose-prefix mistake tracked from Task 8.
- `_for` SQL variants: bodies identical to the originals except `auth.uid()` → `p_user`; execute revoked from public/anon/authenticated, granted to service_role; pgTAP proves math parity and privilege boundaries.
- MCP tool handlers NEVER touch progress tables outside the existing engines: `import_content_package` → `importContentPackage`; `complete_lesson` → duplicate-tolerant insert + `bump_study_day_for` only on first completion; `grade_card` → `grade_card_for`.
- Zod-invalid tool input returns a readable MCP tool error (issue list "path: message"), not a thrown 500.
- Migration numbering continues at `20260810000011_*` (0010 exists).
- ZWNJ/Persian invariants unchanged: no trim/normalize on stored Persian text anywhere in the data layer.
- zod v4 is installed. `mcp-handler`/MCP SDK may pin zod v3 for tool shapes — if types/runtime clash, alias-install `npm i zod3@npm:zod@^3.23` and use `zod3` ONLY inside the MCP route's tool schemas (document it); the shared `ContentPackageSchema` stays zod v4 and is invoked inside handlers, not passed to the SDK.
- All commands Git Bash on Windows; local Supabase running (`npx supabase start`); dev user mag@saf.com/localdev123; psql via `docker exec supabase_db_farsi-progress-tracker psql -U postgres -d postgres -c "..."`.

## File Structure

```
supabase/migrations/20260810000011_api_tokens_and_for_variants.sql
supabase/tests/005_for_variants.sql
src/lib/api-tokens.ts               # generate/hash/verify + authenticateToken(req header) -> user
src/lib/mcp/data.ts                 # scoped data layer (admin client + p_user)
src/app/api/mcp/route.ts            # bearer auth + createMcpHandler + 11 tools
src/app/settings/token-actions.ts   # createToken/revokeToken server actions
src/components/TokenManager.tsx     # settings UI section (client)
scripts/mcp-smoke.ts                # e2e: mint token -> initialize -> tools/list -> tools/call
tests/api-tokens.test.ts  tests/mcp-data.test.ts
```

---

### Task 1: Migration — `api_tokens` + `_for` SQL variants

**Files:**
- Create: `supabase/migrations/20260810000011_api_tokens_and_for_variants.sql`, `supabase/tests/005_for_variants.sql`

**Interfaces:**
- Produces: table `api_tokens` per spec §MCP (with owner RLS + grants to authenticated AND service_role — this stack has no default privileges); `grade_card_for(p_user uuid, p_vocab_id uuid, p_grade smallint, p_direction text default 'fa_to_en', p_ms_taken int default null) returns vocab_reviews` and `get_review_queue_for(p_user uuid) returns table(...same 10 columns...)` — `security definer`, `set search_path = public`, bodies copied from migration 0010's versions with every `auth.uid()` → `p_user` (and grade_card's `v_uid := auth.uid()` → `v_uid := p_user`; drop the null-auth exception in favor of `if p_user is null then raise exception 'p_user required'; end if;`); `bump_study_day_for(p_user uuid) returns void` (same substitution on 0007's body). Execute on all three: revoked from public/anon/authenticated, granted to service_role.

- [ ] **Step 1: Write failing pgTAP test**

`supabase/tests/005_for_variants.sql`:

```sql
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000bb', 'mcp@example.com');
insert into courses (id, owner_id, name) values
  ('c0000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000bb', 'Farsi');
insert into lessons (course_id, number, title, slug) values
  ('c0000000-0000-0000-0000-0000000000bb', 1, 'L1', 'l1');
insert into vocab_items (id, course_id, farsi, transliteration, english, lesson_id) values
  ('20000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000bb', 'کتاب', 'ketâb', 'book',
   (select id from lessons where slug = 'l1'));

select has_table('api_tokens');

-- definer variant works WITHOUT any auth context (superuser here stands in for service_role caller)
select is( (grade_card_for('00000000-0000-0000-0000-0000000000bb',
                           '20000000-0000-0000-0000-000000000001', 4::smallint)).repetitions,
           1, 'grade_card_for first pass reps=1');
select is( (select interval_days from vocab_reviews
            where user_id='00000000-0000-0000-0000-0000000000bb'), 1, 'interval 1');
select is( (select count(*)::int from review_log
            where user_id='00000000-0000-0000-0000-0000000000bb'), 1, 'review logged');
select is( (select cards_reviewed from study_days
            where user_id='00000000-0000-0000-0000-0000000000bb'), 1::smallint, 'study day bumped');

-- queue variant sees the user's course content and excludes the just-graded card from new
select is( (select count(*)::int from get_review_queue_for('00000000-0000-0000-0000-0000000000bb')),
           0, 'queue empty: only card was just graded (due tomorrow), none new');

-- privilege boundary: authenticated role may NOT execute the definer variants
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000bb', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$select grade_card_for('00000000-0000-0000-0000-0000000000bb',
                          '20000000-0000-0000-0000-000000000001', 4::smallint)$$,
  '42501', null, 'authenticated cannot execute grade_card_for');
select throws_ok(
  $$select * from get_review_queue_for('00000000-0000-0000-0000-0000000000bb')$$,
  '42501', null, 'authenticated cannot execute get_review_queue_for');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify failure** — `npx supabase test db` → 005 FAILs (api_tokens missing).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260810000011_api_tokens_and_for_variants.sql`:

```sql
-- ============ api_tokens ============
create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table api_tokens enable row level security;
create policy "own rows" on api_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on api_tokens to authenticated, service_role;

-- ============ definer variants for token-authenticated (MCP) calls ============
-- Bodies: copy from 20260809000010 (grade_card, get_review_queue) and 20260809000007
-- (bump_study_day), substituting auth.uid() with p_user throughout.
-- [IMPLEMENTER: paste the three function bodies here with the substitutions described
--  in Interfaces — they are 'create or replace function grade_card_for(...)',
--  'get_review_queue_for(p_user uuid)', 'bump_study_day_for(p_user uuid)'.
--  grade_card_for: security definer, set search_path = public, plpgsql;
--  get_review_queue_for: security definer, set search_path = public, language sql stable;
--  bump_study_day_for: security definer, set search_path = public, language sql.]

revoke execute on function grade_card_for(uuid, uuid, smallint, text, int) from public, anon, authenticated;
revoke execute on function get_review_queue_for(uuid) from public, anon, authenticated;
revoke execute on function bump_study_day_for(uuid) from public, anon, authenticated;
grant execute on function grade_card_for(uuid, uuid, smallint, text, int) to service_role;
grant execute on function get_review_queue_for(uuid) to service_role;
grant execute on function bump_study_day_for(uuid) to service_role;
```

(The bracketed note is a real instruction: the bodies must be verbatim copies with only the identity substitution — that is what pgTAP 005 asserts via math parity.)

- [ ] **Step 4: Apply + verify** — `npx supabase db reset && npx supabase test db` → 001–005 all ok. Then recreate dev user + `npm run seed`.

- [ ] **Step 5: Commit** — `git add supabase && git commit -m "feat: api_tokens table and security-definer SRS variants for MCP"`

---

### Task 2: Token library + `/settings` token manager

**Files:**
- Create: `src/lib/api-tokens.ts`, `src/app/settings/token-actions.ts`, `src/components/TokenManager.tsx`, `tests/api-tokens.test.ts`
- Modify: `src/app/settings/page.tsx` (render TokenManager below the form), `src/lib/supabase/middleware.ts` (exempt `/api/mcp`)

**Interfaces:**
- Produces (from `src/lib/api-tokens.ts`):
  - `generateToken(): { token: string; hash: string }` — `token = "fpt_" + base64url(32 random bytes)` (node:crypto randomBytes), `hash = sha256 hex of token`.
  - `hashToken(token: string): string` — sha256 hex.
  - `authenticateToken(authHeader: string | null): Promise<{ userId: string } | null>` — extracts `Bearer fpt_…`, hashes, looks up via admin client, fire-and-forget updates `last_used_at`, returns null on any miss.
- Server actions: `createToken(formData)` (name required; inserts via the user's own client — RLS; returns the plaintext token ONCE via a returned value rendered by the client component), `revokeToken(id)` (delete own row).
- Middleware: add `/^\/api\/mcp(\/|$)/` to PUBLIC_PATHS.

- [ ] **Step 1: Failing tests**

`tests/api-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "../src/lib/api-tokens";

describe("api tokens", () => {
  it("generates fpt_ prefixed url-safe tokens with sha256 hash", () => {
    const { token, hash } = generateToken();
    expect(token).toMatch(/^fpt_[A-Za-z0-9_-]{43}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("tokens are unique", () => {
    expect(generateToken().token).not.toBe(generateToken().token);
  });
  it("hash is deterministic and one-way-ish", () => {
    expect(hashToken("fpt_abc")).toBe(hashToken("fpt_abc"));
    expect(hashToken("fpt_abc")).not.toContain("abc");
  });
});
```

- [ ] **Step 2: RED** — `npm test` fails (module missing).

- [ ] **Step 3: Implement**

`src/lib/api-tokens.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "./supabase/admin";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): { token: string; hash: string } {
  const token = `fpt_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

export async function authenticateToken(
  authHeader: string | null,
): Promise<{ userId: string } | null> {
  const m = authHeader?.match(/^Bearer (fpt_[A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("api_tokens")
    .select("id, user_id").eq("token_hash", hashToken(m[1])).maybeSingle();
  if (!data) return null;
  admin.from("api_tokens").update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id).then(() => {});
  return { userId: data.user_id };
}
```

`src/app/settings/token-actions.ts` — `"use server"`; `createToken`: auth check, validate `name` non-empty ≤ 60 chars, `generateToken()`, insert `{ user_id, name, token_hash: hash }` with the user's client, return `{ token }` (plaintext returned to the caller ONLY — never stored); `revokeToken(id)`: delete `.eq("id", id)` (RLS scopes to owner). Both throw on Supabase error.

`src/components/TokenManager.tsx` — `"use client"`, props `{ tokens: { id: string; name: string; created_at: string; last_used_at: string | null }[] }`; name input + Create button calling `createToken` (useTransition), on success shows the plaintext once in a copyable `<code>` block with a "copy" button and a "shown once — store it now" warning; list with name/created/last-used + revoke buttons; below, a collapsed `<details>` "Connect your AI app" with the three snippets (fill `<URL>` from `window.location.origin`):

```
claude.ai / Claude Desktop → Settings → Connectors → Add custom connector:
  URL: <URL>/api/mcp        Header: Authorization: Bearer <token>
Claude Code:
  claude mcp add --transport http farsi-tracker <URL>/api/mcp --header "Authorization: Bearer <token>"
```

`src/app/settings/page.tsx` — fetch `api_tokens` (id, name, created_at, last_used_at) for the user; render `<TokenManager tokens={...} />` under the existing form.

Middleware — in `src/lib/supabase/middleware.ts` PUBLIC_PATHS add `/^\/api\/mcp(\/|$)/`.

- [ ] **Step 4: GREEN + build** — `npm test` all green; `npm run build` compiles.
- [ ] **Step 5: Commit** — `git add ... && git commit -m "feat: personal API tokens with settings manager and mcp route exemption"`

---

### Task 3: MCP data layer

**Files:**
- Create: `src/lib/mcp/data.ts`, `tests/mcp-data.test.ts`

**Interfaces:**
- Produces (all take `userId: string` first; all use `createAdminClient()`; every query explicitly scoped by `user_id` or course-ownership via `courses.owner_id`):
  - `getStudyState(userId)` → `{ streak, cardsDue, nextLesson: {number,title,slug}|null, lessonsThisWeek, weeklyTarget, weakSkills: {skill,rating}[], topErrors: {error,count}[] }` — streak via rpc `current_streak` `{p_user}`; nextLesson via rpc `next_lesson_for` `{p_user, p_limit:1}` (check 0009 for exact arg names/signature and match); weakSkills = latest rating per skill ≤ 3 (fetch skill_ratings ordered desc, first-per-skill in JS); topErrors = aggregate `practice_sessions.errors` last 30 days in JS (same approach as /progress).
  - `getLesson(userId, lessonNumber, includeBody)` → lesson row (course-scoped via owner join: fetch user's course ids first) or null.
  - `getDueVocab(userId, limit)` → join vocab_reviews(due, not suspended)→vocab_items.
  - `getStrugglingVocab(userId, limit)` → vocab_reviews where lapses ≥ 2 or ease ≤ 1.6, order lapses desc/ease asc, join items.
  - `searchVocab(userId, query, limit)` → same branch logic as /vocab (Persian → `farsi_normalized` ilike with `faNormalize`; else english/translit `.or()` with the `[,()"]` sanitizer), scoped to owned courses.
  - `logPracticeSession(userId, input)` → resolve optional lesson_number→lesson_id (owned courses), insert practice_sessions; returns inserted id.
  - `completeLesson(userId, input)` → same semantics as `src/app/lessons/actions.ts` (23505-tolerant; `bump_study_day_for` rpc ONLY on fresh insert; skill ratings validated int 1–5, insert errors thrown); input uses lesson_number.
  - `addVocab(userId, item)` → active_course_id check (error "no active course") then insert.
  - `importPackage(userId, pkg)` → second-course guard (same message as /import) then `importContentPackage(admin, userId, pkg)`.
  - `getReviewQueue(userId)` → rpc `get_review_queue_for` `{p_user}`.
  - `gradeCard(userId, vocabId, grade, direction, msTaken)` → rpc `grade_card_for`; validate grade 0–5 int and direction in the 4-value set BEFORE the rpc.
- Pure helpers exported for tests: `pickWeakSkills(ratings: {skill,rating,rated_at}[]): {skill,rating}[]` (latest per skill, ≤3, sorted ascending by rating) and `rankErrors(sessions: {errors:string[]|null}[], top?: number)`.

- [ ] **Step 1: Failing tests** (pure helpers only — DB paths are covered by the Task 5 smoke)

`tests/mcp-data.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickWeakSkills, rankErrors } from "../src/lib/mcp/data";

describe("pickWeakSkills", () => {
  it("keeps only the LATEST rating per skill, filters > 3", () => {
    const out = pickWeakSkills([
      { skill: "ezafe", rating: 2, rated_at: "2026-01-01" },
      { skill: "ezafe", rating: 4, rated_at: "2026-06-01" },   // latest, strong → excluded
      { skill: "ra", rating: 5, rated_at: "2026-01-01" },
      { skill: "ra", rating: 3, rated_at: "2026-06-01" },      // latest, weak → included
      { skill: "stems", rating: 1, rated_at: "2026-03-01" },
    ]);
    expect(out).toEqual([{ skill: "stems", rating: 1 }, { skill: "ra", rating: 3 }]);
  });
});

describe("rankErrors", () => {
  it("counts, ranks, caps", () => {
    const out = rankErrors([
      { errors: ["verb not final", "dropped را"] },
      { errors: ["verb not final"] },
      { errors: null },
    ], 1);
    expect(out).toEqual([{ error: "verb not final", count: 2 }]);
  });
});
```

- [ ] **Step 2: RED** → **Step 3: implement `data.ts`** (helpers pure; DB functions per Interfaces; import `"server-only"` at top) → **Step 4: GREEN + build**.
- [ ] **Step 5: Commit** — `"feat: scoped MCP data layer over admin client"`

---

### Task 4: `/api/mcp` route with 11 tools

**Files:**
- Create: `src/app/api/mcp/route.ts`
- Modify: `package.json` (`npm i mcp-handler`; plus `zod3@npm:zod@^3.23` alias ONLY if needed per Global Constraints — try plain zod v4 first)

**Interfaces:**
- Produces: `GET`/`POST`/`DELETE` exports. Request flow: `authenticateToken(req.headers.get("authorization"))` → null → `401 {"error":"invalid or missing API token"}`; else `createMcpHandler((server) => registerTools(server, userId), {}, { basePath: "/api" })(req)` built per-request. Server name "farsi-tracker", version "1.0.0".
- 11 tools registered exactly as spec §MCP's table, each `server.tool(name, description, zodShape, handler)`:
  - Shapes (zod): `get_study_state` {}; `get_lesson` { lesson_number: z.number().int().positive(), include_body: z.boolean().default(false) }; `get_due_vocab`/`get_struggling_vocab` { limit: z.number().int().min(1).max(100).default(20) }; `search_vocab` { query: z.string().min(1), limit: … default 20 }; `log_practice_session` { mode: z.enum(["lesson","quiz","conversation","negar"]).default("lesson"), duration_minutes: z.number().int().positive().optional(), lesson_number: optional int, errors: z.array(z.string()).default([]), strengths: z.array(z.string()).default([]), raw_log: z.string().optional() }; `complete_lesson` { lesson_number: int, minutes_spent/confidence(1–5)/homework_done/negar_drill_done/notes optional, skill_ratings: z.record(z.string(), z.number().int().min(1).max(5)).optional() }; `add_vocab` { farsi/transliteration/english required strings, part_of_speech/present_stem/past_stem/colloquial optional }; `import_content_package` { package: z.unknown() } — handler runs `ContentPackageSchema.safeParse` itself and returns issue list on failure; `get_review_queue` {}; `grade_card` { vocab_id: z.string().uuid(), grade: z.number().int().min(0).max(5), direction: z.enum(["fa_to_en","en_to_fa","stem"]).default("fa_to_en"), ms_taken: optional int }.
  - Every handler: `try { const out = await dataFn(...); return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] }; } catch (e) { return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true }; }`
  - Descriptions must tell the LLM when to use each tool (one sentence each, e.g. get_study_state: "Call at the start of a tutoring session: streak, due cards, next lesson, weak skills and frequent errors.").

- [ ] **Step 1: Install + implement** per Interfaces (no unit test file — the Task 5 smoke is the executable verification; this task must still compile + keep suites green).
- [ ] **Step 2: Verify** — `npm test` green; `npm run build` compiles; `npm run dev` then:
  - `curl -s -X POST localhost:3000/api/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'` with NO auth header → 401.
  - Same with a bogus `Authorization: Bearer fpt_x` → 401.
  (Authenticated calls come in Task 5's script.) Kill the dev server.
- [ ] **Step 3: Commit** — `"feat: /api/mcp streamable-http server with 11 tools"`

---

### Task 5: End-to-end smoke script + report

**Files:**
- Create: `scripts/mcp-smoke.ts`
- Modify: `package.json` (script `"mcp:smoke": "tsx scripts/mcp-smoke.ts"`)

**Interfaces:**
- Produces a self-contained verification: (1) service-role mints a token row directly for mag@saf.com's user id (generateToken + insert — bypasses the UI deliberately); (2) speaks Streamable HTTP to `http://localhost:3000/api/mcp` with `Authorization: Bearer <token>` + `Accept: application/json, text/event-stream`: `initialize` → `notifications/initialized` → `tools/list` (assert exactly the 11 names) → `tools/call get_study_state` (assert streak/cardsDue keys) → `tools/call log_practice_session` (mode "conversation", errors ["dropped را"]) → assert a `practice_sessions` row exists via admin client → `tools/call get_review_queue` (assert ≤ 20 new cards) → `tools/call grade_card` on the first queue item (grade 4) → assert `review_log` row; (3) cleanup: delete the practice session, the review row+log (restore zero-progress state), and the token. Parse SSE-or-JSON responses (helper: if content-type is text/event-stream, take the last `data:` line).
- Requires dev server running: script starts `npm run dev` itself as a child process (wait for :3000) OR documents "start dev first" and fails fast with a clear message — implementer's choice, state it.

- [ ] **Step 1: Write + run** until output ends `MCP SMOKE OK (11 tools, state/log/queue/grade verified, cleaned up)`.
- [ ] **Step 2: Full suites** — `npm test`, `npx supabase test db`, `npm run build`, `npx playwright test` all green.
- [ ] **Step 3: Commit** — `"test: mcp end-to-end smoke script"`

---

## Self-Review Notes

- Spec coverage: §MCP table ↔ Task 4 tool list is 1:1 (11 tools); token lifecycle (mint/show-once/list/revoke/last_used) ↔ Task 2; `_for` variants + privileges ↔ Task 1; practice_sessions ingestion ↔ Tasks 3–5; connect instructions ↔ Task 2 TokenManager.
- Deliberate scope cuts (YAGNI, spec-consistent): no rate limiting (deferred to deploy), no OAuth (personal tokens are the spec), no stdio wrapper.
- Type consistency: `authenticateToken` → `{userId}` consumed by Task 4; data-layer names in Task 4's handler wiring match Task 3's Interfaces; `bump_study_day_for` used by data layer's completeLesson, defined in Task 1.
- Known risk, mitigated in text: zod v3/v4 clash on tool shapes (Global Constraints has the alias fallback); `next_lesson_for` signature must be read from migration 0009 rather than assumed.