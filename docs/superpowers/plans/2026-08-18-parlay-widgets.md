# Parlay In-Chat Exercise Widgets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product to Parlay and add MCP Apps interactive drill widgets so the tutor AI presents tap/type/match exercises inline in the chat (ChatGPT first-class; graceful text fallback elsewhere), with attempts recorded server-side and wired into the existing SRS.

**Architecture:** The existing `mcp-handler` route exposes three new tools (`present_drill`, `record_attempt`, `get_drill_results`) plus a `ui://parlay/drill.html` resource whose content is a single-file Vite-built React widget. The widget receives the drill via the ext-apps `App` class (`ontoolresult.structuredContent`), records each answer via `callServerTool("record_attempt")`, and reports completion via `updateModelContext`. New `drills` + `drill_attempts` tables persist everything; SRS grading reuses the `grade_card_for` definer RPC.

**Tech Stack:** Next.js 16.3.0 / React 19 / zod 4 / mcp-handler 2.1.0 (SDK v2 `@modelcontextprotocol/server@2.0.0` underneath) / `@modelcontextprotocol/ext-apps` (widget side only) / Vite + `vite-plugin-singlefile` / Supabase (hosted project `wbgxabdllukiofokqczc`) / vitest + Testing Library / pgTAP / Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-parlay-widgets-design.md`

## Global Constraints

- **Wire contracts are frozen:** `toolResultVerbatim` is used ONLY by `get_tutor_instructions`; `log_practice_session` and `add_vocab` return bare UUID strings that MUST stay `JSON.stringify`-ed by `toolResult`. The new `toolResultStructured` helper is used ONLY by `present_drill`.
- **No hardcoded site URLs** in any generated content or widget: always interpolate `NEXT_PUBLIC_SITE_URL` (server) or the `__PARLAY_SITE__` placeholder (widget HTML, substituted at resource-read time).
- **Test suite order (unchanged from prior cycles):** `npx supabase db reset` → `npx supabase test db` (pgTAP MUST run on the empty just-reset DB, BEFORE seeding) → recreate dev user `mag@saf.com`/`localdev123` via admin API → `npm run seed -- --user mag@saf.com` → `npm run test` → `npx tsc --noEmit` → `npm run build` → `npm run mcp:smoke` → `npm run oauth:smoke` → `npx playwright test`.
- `npm run widgets:build` must run before `tsc --noEmit`, `next build`, or `next dev` (the route imports a generated module). `predev`/`prebuild` npm hooks handle this automatically; only standalone `tsc --noEmit` needs it run manually first.
- **Brand rename rule:** "Farsi Progress Tracker"/"Farsi Tracker"/"farsi-tracker" as *brand* become "Parlay"/"parlay". References to the Farsi *language* (curriculum copy, language rules, `fa` codes, `fa_to_en` directions, `fa_normalize`) are NOT brand and stay.
- Content-package format literal: emit `"parlay/content-package"`, accept `"farsi-tracker/content-package"` forever (zero-cost compat).
- Every commit ends with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Rzf6KG6VBNqQf798QsMNmL`
- zod v4 syntax (`z.discriminatedUnion`, `.safeParse`); Node >= 20; TypeScript strict.
- Dev commands run from repo root `C:\Users\mgrog\github\autechr3\farsi-progress-tracker`. PowerShell quirks: use `-LiteralPath` for file copies; `docker exec supabase_db_farsi-progress-tracker psql ...` for any direct cloud psql.

---

### Task 1: Rename to Parlay

**Files:**
- Modify: `package.json` (`"name": "parlay"`)
- Modify: `src/app/layout.tsx:16` (metadata title → `"Parlay"`)
- Modify: `src/app/login/page.tsx:37` (h1 → `Parlay`)
- Modify: `src/app/oauth/authorize/page.tsx:69,72` (h1 → `Parlay`; "your Farsi tracker" → "your Parlay data")
- Modify: `src/components/TokenManager.tsx:111` (CLI snippet server name `farsi-tracker` → `parlay`)
- Modify: `src/components/ImportForm.tsx:24` (placeholder format string → `parlay/content-package`)
- Modify: `src/app/api/export/route.ts:51` (filename prefix → `parlay-export-`)
- Modify: `src/app/api/mcp/route.ts:264` (`serverInfo.name` → `"parlay"`), `:179` ("a farsi-tracker content package" → "a Parlay content package")
- Modify: `src/lib/tutor-skill.ts` (lines 29, 47, 105, 121, 156, 160, 162 — brand strings and format references)
- Modify: `src/lib/agent-prompts.ts` (lines 5, 8, 38 — format literal; leave "Farsi A1" example name and language-specific prompt copy)
- Modify: `src/lib/content-package.ts:46` (format literal accepts both)
- Modify: `scripts/mcp-smoke.ts:248` (serverInfo assertion → `"parlay"`)
- Modify: tests asserting old strings — `tests/tutor-skill.test.ts`, `tests/content-package.test.ts`, `tests/agent-prompts.test.ts` (adjust after grep)
- Test: existing suites (this task changes copy, not behavior — tests are updated, not added)

**Interfaces:**
- Consumes: nothing new.
- Produces: MCP `serverInfo.name === "parlay"` (Task 6's smoke edits assume it); content-package `format` union (Task 9's instructions reference `parlay/content-package`).

- [ ] **Step 1: Update the format literal with backward compat, test-first**

In `tests/content-package.test.ts` add:

```ts
it("accepts both parlay and legacy farsi-tracker format literals", () => {
  const base = JSON.parse(JSON.stringify(validPackage)); // reuse the file's existing valid v2 fixture
  base.format = "parlay/content-package";
  expect(() => parseAnyPackage(base)).not.toThrow();
  base.format = "farsi-tracker/content-package";
  expect(() => parseAnyPackage(base)).not.toThrow();
});
```

(If the file's valid fixture has a different variable name, use that name — do not invent a new fixture.)

- [ ] **Step 2: Run it to see the new-literal half fail**

Run: `npm run test -- content-package`
Expected: FAIL (`parlay/content-package` rejected by `z.literal`).

- [ ] **Step 3: Implement the union**

In `src/lib/content-package.ts:46` replace the single literal:

```ts
format: z.union([
  z.literal("parlay/content-package"),
  // accepted forever: packages generated before the 2026-08 rename
  z.literal("farsi-tracker/content-package"),
]),
```

- [ ] **Step 4: Run the test again** — `npm run test -- content-package` → PASS.

- [ ] **Step 5: Sweep every brand string**

Run: `Grep pattern "(?i)farsi[- ]?(progress[- ]?)?track" across src/ scripts/ tests/ e2e/ package.json README.md` and fix every *brand* hit per the Global Constraints rename rule (the Files list above is the known inventory; the grep catches stragglers). In `src/lib/agent-prompts.ts` change emitted `"farsi-tracker/content-package"` doc/example strings to `"parlay/content-package"`. In `src/lib/tutor-skill.ts` replace the four "Farsi Progress Tracker" occurrences with "Parlay" and the two `farsi-tracker` format references with `parlay/content-package`; the CLI line in `buildBootstrapPrompt` becomes `claude mcp add --transport http parlay <siteUrl>/api/mcp`. Do NOT touch: `src/lib/import-parsers.ts` internal `farsi` field names, `src/lib/text.ts` comment, `fa_normalize`/`fa.ts`/`fa_to_en`, the `fpt_` token prefix, or v1-upconverter literals in `src/lib/package-v1.ts`.

- [ ] **Step 6: Update string-asserting tests**

Run `npm run test` — fix any test that asserted the old brand strings (expected: `tutor-skill`, `agent-prompts`, possibly `wizard-steps`). Assertions should now expect `Parlay` / `parlay` / `parlay/content-package`.

- [ ] **Step 7: Full local check**

Run: `npm run test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: rename product to Parlay (brand surfaces, server name, format literal with legacy compat)"
```

---

### Task 2: Exercise and drill schema + answer checking

**Files:**
- Create: `src/lib/exercises/schema.ts`
- Create: `src/lib/exercises/check.ts`
- Test: `tests/exercise-schema.test.ts`, `tests/exercise-check.test.ts`

**Interfaces:**
- Consumes: `getLanguage(code)` from `src/lib/languages` (`LanguageModule.normalize`, optional `.stripDiacritics`), `genericLanguage`.
- Produces (used by Tasks 4, 6, 7, 8):
  - `drillSchema` (zod), `exerciseSchema` (zod)
  - `type Drill = z.infer<typeof drillSchema>`, `type Exercise = z.infer<typeof exerciseSchema>`
  - `checkAnswer(languageCode: string, ex: Exercise, answer: AnswerValue): { correct: boolean }`
  - `type AnswerValue = string | string[]` (choice → option id; typed → string; cloze → one string per blank in blank order; match is self-scoring in the widget and never calls `checkAnswer`)

- [ ] **Step 1: Write failing schema tests** — `tests/exercise-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { drillSchema } from "../src/lib/exercises/schema";

const choice = {
  id: "e1", type: "choice",
  prompt: { text: "Which means 'water'?" },
  options: [{ id: "a", text: "آب", script: true }, { id: "b", text: "نان", script: true }],
  correct_id: "a",
};

describe("drillSchema", () => {
  it("accepts a minimal valid drill and applies defaults", () => {
    const d = drillSchema.parse({ language: "fa", exercises: [choice] });
    expect(d.srs_default).toBe(true);
    expect(d.exercises).toHaveLength(1);
  });
  it("rejects a drill with zero or >10 exercises", () => {
    expect(drillSchema.safeParse({ language: "fa", exercises: [] }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ ...choice, id: `e${i}` }));
    expect(drillSchema.safeParse({ language: "fa", exercises: eleven }).success).toBe(false);
  });
  it("rejects choice whose correct_id is not among options", () => {
    const bad = { ...choice, correct_id: "zzz" };
    expect(drillSchema.safeParse({ language: "fa", exercises: [bad] }).success).toBe(false);
  });
  it("rejects cloze whose blank index is out of range", () => {
    const bad = {
      id: "c1", type: "cloze", prompt: { text: "fill" },
      tokens: ["من", "___"], blanks: [{ index: 5, expected: ["آب"] }], mode: "type",
    };
    expect(drillSchema.safeParse({ language: "fa", exercises: [bad] }).success).toBe(false);
  });
  it("rejects duplicate exercise ids", () => {
    expect(drillSchema.safeParse({ language: "fa", exercises: [choice, { ...choice }] }).success).toBe(false);
  });
  it("accepts all four types together", () => {
    const d = drillSchema.parse({
      language: "fa",
      exercises: [
        choice,
        { id: "t1", type: "typed", prompt: { term: "آب" }, expected: ["water"], input: "translation" },
        { id: "c1", type: "cloze", prompt: { text: "fill" }, tokens: ["من", "___", "می‌خورم"],
          blanks: [{ index: 1, expected: ["آب"] }], mode: "tiles", tiles: ["آب", "نان"] },
        { id: "m1", type: "match", prompt: { text: "match" },
          pairs: [{ left: "آب", right: "water" }, { left: "نان", right: "bread" }] },
      ],
    });
    expect(d.exercises.map((e) => e.type)).toEqual(["choice", "typed", "cloze", "match"]);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test -- exercise-schema` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/exercises/schema.ts`**

```ts
import { z } from "zod";

// Shared envelope for every exercise in a drill. `srs` overrides the drill's
// srs_default for one exercise; grading only ever applies when vocab_id is set.
const promptSchema = z.object({
  text: z.string().optional(),
  term: z.string().optional(),
  term_vocalized: z.string().optional(),
  transliteration: z.string().optional(),
});

const base = {
  id: z.string().min(1),
  prompt: promptSchema,
  vocab_id: z.string().uuid().optional(),
  srs: z.boolean().optional(),
  difficulty: z.number().int().min(1).max(5).optional(),
  skill: z.string().optional(),
};

const choiceExercise = z.object({
  ...base,
  type: z.literal("choice"),
  options: z.array(z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    script: z.boolean().optional(),
  })).min(2).max(6),
  correct_id: z.string().min(1),
});

const typedExercise = z.object({
  ...base,
  type: z.literal("typed"),
  expected: z.array(z.string().min(1)).min(1),
  input: z.enum(["script", "translit", "translation"]),
  keyboard: z.boolean().optional(),
});

const clozeExercise = z.object({
  ...base,
  type: z.literal("cloze"),
  tokens: z.array(z.string()).min(1),
  blanks: z.array(z.object({
    index: z.number().int().min(0),
    expected: z.array(z.string().min(1)).min(1),
  })).min(1),
  mode: z.enum(["type", "tiles"]),
  tiles: z.array(z.string()).optional(),
});

const matchExercise = z.object({
  ...base,
  type: z.literal("match"),
  pairs: z.array(z.object({ left: z.string().min(1), right: z.string().min(1) })).min(2).max(8),
});

export const exerciseSchema = z.discriminatedUnion("type", [
  choiceExercise, typedExercise, clozeExercise, matchExercise,
]);
export type Exercise = z.infer<typeof exerciseSchema>;

export const drillSchema = z.object({
  title: z.string().optional(),
  language: z.string().min(1).default("fa"),
  srs_default: z.boolean().default(true),
  exercises: z.array(exerciseSchema).min(1).max(10),
}).superRefine((drill, ctx) => {
  const seen = new Set<string>();
  drill.exercises.forEach((ex, i) => {
    if (seen.has(ex.id)) {
      ctx.addIssue({ code: "custom", path: ["exercises", i, "id"], message: `duplicate exercise id "${ex.id}"` });
    }
    seen.add(ex.id);
    if (ex.type === "choice" && !ex.options.some((o) => o.id === ex.correct_id)) {
      ctx.addIssue({ code: "custom", path: ["exercises", i, "correct_id"], message: "correct_id not among options" });
    }
    if (ex.type === "cloze") {
      for (const b of ex.blanks) {
        if (b.index >= ex.tokens.length) {
          ctx.addIssue({ code: "custom", path: ["exercises", i, "blanks"], message: `blank index ${b.index} out of range` });
        }
      }
    }
  });
});
export type Drill = z.infer<typeof drillSchema>;
```

- [ ] **Step 4: Run** — `npm run test -- exercise-schema` → PASS.

- [ ] **Step 5: Write failing checker tests** — `tests/exercise-check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkAnswer } from "../src/lib/exercises/check";
import type { Exercise } from "../src/lib/exercises/schema";

const typedScript: Exercise = {
  id: "t1", type: "typed", prompt: { text: "Type 'water' in Farsi" },
  expected: ["آب"], input: "script",
};

describe("checkAnswer", () => {
  it("choice: matches by option id", () => {
    const ex: Exercise = { id: "e1", type: "choice", prompt: {},
      options: [{ id: "a", text: "آب" }, { id: "b", text: "نان" }], correct_id: "a" };
    expect(checkAnswer("fa", ex, "a").correct).toBe(true);
    expect(checkAnswer("fa", ex, "b").correct).toBe(false);
  });
  it("typed script: normalizes with the language module (diacritics stripped)", () => {
    // fa stripDiacritics removes fatha etc.; faNormalize unifies ي→ی and friends
    expect(checkAnswer("fa", typedScript, "آب").correct).toBe(true);
    expect(checkAnswer("fa", typedScript, "آَب").correct).toBe(true); // stray fatha
    expect(checkAnswer("fa", typedScript, "نان").correct).toBe(false);
  });
  it("typed translation: case/whitespace-insensitive generic normalize", () => {
    const ex: Exercise = { id: "t2", type: "typed", prompt: { term: "آب" },
      expected: ["water"], input: "translation" };
    expect(checkAnswer("fa", ex, "  Water ").correct).toBe(true);
    expect(checkAnswer("fa", ex, "bread").correct).toBe(false);
  });
  it("cloze: one answer per blank, all must match", () => {
    const ex: Exercise = { id: "c1", type: "cloze", prompt: {},
      tokens: ["من", "___", "می‌خورم"], blanks: [{ index: 1, expected: ["آب"] }], mode: "type" };
    expect(checkAnswer("fa", ex, ["آب"]).correct).toBe(true);
    expect(checkAnswer("fa", ex, ["نان"]).correct).toBe(false);
  });
  it("match: throws (widget scores matching itself)", () => {
    const ex: Exercise = { id: "m1", type: "match", prompt: {},
      pairs: [{ left: "آب", right: "water" }, { left: "نان", right: "bread" }] };
    expect(() => checkAnswer("fa", ex, "x")).toThrow();
  });
});
```

- [ ] **Step 6: Run to verify failure** — `npm run test -- exercise-check` → FAIL.

- [ ] **Step 7: Implement `src/lib/exercises/check.ts`**

```ts
import { getLanguage, genericLanguage } from "../languages";
import type { Exercise } from "./schema";

export type AnswerValue = string | string[];

// Normalizes for comparison: script answers go through the target language's
// normalize (+ diacritic stripping when available); translit/translation answers
// are language-neutral text and use the generic lower/trim/collapse.
function norm(languageCode: string, script: boolean, s: string): string {
  if (!script) return genericLanguage.normalize(s);
  const lang = getLanguage(languageCode);
  const stripped = lang.stripDiacritics ? lang.stripDiacritics(s) : s;
  return lang.normalize(stripped);
}

export function checkAnswer(
  languageCode: string,
  ex: Exercise,
  answer: AnswerValue,
): { correct: boolean } {
  switch (ex.type) {
    case "choice":
      return { correct: answer === ex.correct_id };
    case "typed": {
      if (typeof answer !== "string") return { correct: false };
      const script = ex.input === "script";
      const got = norm(languageCode, script, answer);
      return { correct: ex.expected.some((e) => norm(languageCode, script, e) === got) };
    }
    case "cloze": {
      const answers = Array.isArray(answer) ? answer : [answer];
      if (answers.length !== ex.blanks.length) return { correct: false };
      return {
        correct: ex.blanks.every((b, i) =>
          b.expected.some((e) => norm(languageCode, true, e) === norm(languageCode, true, answers[i] ?? "")),
        ),
      };
    }
    case "match":
      throw new Error("match exercises are scored in the widget, not via checkAnswer");
  }
}
```

- [ ] **Step 8: Run** — `npm run test -- exercise-check exercise-schema` → PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/exercises tests/exercise-schema.test.ts tests/exercise-check.test.ts
git commit -m "feat: drill/exercise schema and language-aware answer checking"
```

---

### Task 3: `drills` + `drill_attempts` migration and pgTAP

**Files:**
- Create: `supabase/migrations/20260818100001_drills.sql`
- Create: `supabase/tests/005_drills.sql`

**Interfaces:**
- Consumes: existing tables `profiles`, `curriculums`, `languages`; RLS/grant conventions from `20260813100003_rls_grants.sql`.
- Produces (Task 4 depends on exact columns): `drills(id uuid pk, user_id uuid, curriculum_id uuid null, language_code text, title text null, payload jsonb, created_at timestamptz)`; `drill_attempts(id bigserial pk, drill_id uuid, user_id uuid, exercise_id text, correct boolean, answer_given text null, ms_taken int null, attempted_at timestamptz)`.

- [ ] **Step 1: Write the migration** — `supabase/migrations/20260818100001_drills.sql`:

```sql
-- Drills: tutor-authored interactive exercise sets presented as MCP Apps
-- widgets. payload holds the validated Drill JSON (schema owned by the app;
-- the DB stores it opaquely). Attempts reference exercises by their id inside
-- the payload (exercise_id text), NOT the lesson-authoring `exercises` table.

create table drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  curriculum_id uuid references curriculums(id) on delete set null,
  language_code text not null references languages(code),
  title text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index drills_user_created_idx on drills (user_id, created_at desc);

create table drill_attempts (
  id bigserial primary key,
  drill_id uuid not null references drills(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  exercise_id text not null,
  correct boolean not null,
  answer_given text,
  ms_taken int,
  attempted_at timestamptz not null default now()
);
create index drill_attempts_drill_idx on drill_attempts (drill_id, attempted_at);

alter table drills enable row level security;
alter table drill_attempts enable row level security;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $pol$create policy "own drills" on drills for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id)$pol$;
    execute $pol$create policy "own drill attempts" on drill_attempts for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id)$pol$;
  else
    raise notice 'skipping drills policies: auth schema not present (bare scratch DB)';
  end if;
end $$;

grant select, insert, update, delete on drills to authenticated;
grant select, insert, update, delete on drills to service_role;
grant select, insert, update, delete on drill_attempts to authenticated;
grant select, insert, update, delete on drill_attempts to service_role;
grant usage, select on sequence drill_attempts_id_seq to authenticated, service_role;
```

- [ ] **Step 2: Write pgTAP** — `supabase/tests/005_drills.sql`:

```sql
begin;
create extension if not exists pgtap;
select plan(10);

select has_table('drills');
select has_table('drill_attempts');
select col_is_pk('drills', 'id');
select col_not_null('drills', 'payload');
select col_not_null('drills', 'language_code');
select has_column('drill_attempts', 'exercise_id');
select has_column('drill_attempts', 'ms_taken');
select ok((select relrowsecurity from pg_class where relname = 'drills'), 'drills has RLS enabled');
select ok((select relrowsecurity from pg_class where relname = 'drill_attempts'), 'drill_attempts has RLS enabled');
select fk_ok('drill_attempts', 'drill_id', 'drills', 'id');

select * from finish();
rollback;
```

- [ ] **Step 3: Apply and test on a fresh local DB (empty-DB-first order!)**

```bash
npx supabase db reset --local
npx supabase test db
```

Expected: all pgTAP files pass including 005 (10/10). If `fk_ok` signature complains, use the 4-arg form shown (schema-less); adjust only that assertion.

- [ ] **Step 4: Re-seed local dev state** (reset wiped it)

Recreate the dev user and seed exactly as prior cycles: create `mag@saf.com` / `localdev123` via the Supabase admin API (see `scripts/` for the existing helper used before; if none exists as a script, use a short `tsx` one-liner with `createSbClient(url, service_role).auth.admin.createUser({ email, password, email_confirm: true })`), then `npm run seed -- --user mag@saf.com`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260818100001_drills.sql supabase/tests/005_drills.sql
git commit -m "feat: drills and drill_attempts tables with RLS and pgTAP"
```

---

### Task 4: Data layer — createDrill / recordAttempt / getDrillResults

**Files:**
- Modify: `src/lib/mcp/data.ts` (append three exports + types)
- Modify: `src/lib/mcp/helpers.ts` (two pure helpers)
- Test: `tests/mcp-data.test.ts` (pure helpers only — `data.ts` is `server-only` and not importable from vitest; DB paths are covered by Task 6's smoke additions)

**Interfaces:**
- Consumes: `drillSchema`, `type Drill`, `type Exercise` from `src/lib/exercises/schema`; existing `createAdminClient`, `ownedCurriculumIds`, `DIRECTIONS`/`GradeDirection`, RPC `grade_card_for(p_user, p_vocab_id, p_grade, p_direction, p_ms_taken)`.
- Produces (Task 6 registers these):
  - `createDrill(userId: string, drill: Drill): Promise<{ drillId: string; exerciseCount: number }>`
  - `recordAttempt(userId: string, input: RecordAttemptInput): Promise<{ recorded: true; srs_applied: boolean }>` where `RecordAttemptInput = { drill_id: string; exercise_id: string; correct: boolean; answer_given?: string; ms_taken?: number }`
  - `getDrillResults(userId: string, drillId: string): Promise<DrillResults>` where `DrillResults = { drill_id: string; title: string | null; total: number; answered: number; correct: number; attempts: { exercise_id: string; correct: boolean; answer_given: string | null; ms_taken: number | null }[] }`
  - Pure (in helpers.ts): `drillGrade(correct: boolean): number` (4 or 1), `drillDirection(ex: Exercise): GradeDirection` (`"en_to_fa"` when `ex.type === "typed" && ex.input === "script"`, else `"fa_to_en"`)

- [ ] **Step 1: Failing tests for the pure helpers** — append to `tests/mcp-data.test.ts`:

```ts
import { drillGrade, drillDirection } from "../src/lib/mcp/helpers";

describe("drill grading helpers", () => {
  it("maps correctness to SM-2 grades 4/1", () => {
    expect(drillGrade(true)).toBe(4);
    expect(drillGrade(false)).toBe(1);
  });
  it("derives direction: producing script = en_to_fa, everything else fa_to_en", () => {
    const typedScript = { id: "t", type: "typed", prompt: {}, expected: ["آب"], input: "script" } as const;
    const typedTranslation = { ...typedScript, input: "translation" } as const;
    const choice = { id: "c", type: "choice", prompt: {}, options: [{ id: "a", text: "x" }, { id: "b", text: "y" }], correct_id: "a" } as const;
    expect(drillDirection(typedScript as never)).toBe("en_to_fa");
    expect(drillDirection(typedTranslation as never)).toBe("fa_to_en");
    expect(drillDirection(choice as never)).toBe("fa_to_en");
  });
});
```

- [ ] **Step 2: Run to fail** — `npm run test -- mcp-data` → FAIL.

- [ ] **Step 3: Implement helpers** — append to `src/lib/mcp/helpers.ts`:

```ts
import type { Exercise } from "../exercises/schema";
import type { GradeDirection } from "./data-types"; // if GradeDirection lives in data.ts, re-declare the union here instead of importing from a server-only module

export function drillGrade(correct: boolean): number {
  return correct ? 4 : 1;
}

export function drillDirection(ex: Exercise): GradeDirection {
  return ex.type === "typed" && ex.input === "script" ? "en_to_fa" : "fa_to_en";
}
```

**Note:** `GradeDirection` is currently exported from `src/lib/mcp/data.ts`, which is `server-only`. Check whether `helpers.ts` already imports from it (it must not). If needed, move the `DIRECTIONS` const + `GradeDirection` type into `helpers.ts` and re-export from `data.ts` (keeping `data.ts`'s public surface identical).

- [ ] **Step 4: Run** — `npm run test -- mcp-data` → PASS.

- [ ] **Step 5: Implement the three data functions** — append to `src/lib/mcp/data.ts`:

```ts
import { drillGrade, drillDirection } from "./helpers";
import type { Drill } from "../exercises/schema";

export type RecordAttemptInput = {
  drill_id: string;
  exercise_id: string;
  correct: boolean;
  answer_given?: string;
  ms_taken?: number;
};

export type DrillResults = {
  drill_id: string;
  title: string | null;
  total: number;
  answered: number;
  correct: number;
  attempts: { exercise_id: string; correct: boolean; answer_given: string | null; ms_taken: number | null }[];
};

export async function createDrill(
  userId: string,
  drill: Drill,
): Promise<{ drillId: string; exerciseCount: number }> {
  const admin = createAdminClient();

  const { data: lang } = await admin
    .from("languages").select("code").eq("code", drill.language).maybeSingle();
  if (!lang) throw new Error(`unsupported language "${drill.language}"`);

  // Tenant check: every referenced vocab item must live in one of the caller's
  // curriculums (the admin client bypasses RLS, so this is mandatory).
  const vocabIds = [...new Set(drill.exercises.flatMap((e) => (e.vocab_id ? [e.vocab_id] : [])))];
  let curriculumId: string | null = null;
  if (vocabIds.length > 0) {
    const owned = await ownedCurriculumIds(admin, userId);
    const { data: items, error } = await admin
      .from("vocab_items").select("id, curriculum_id")
      .in("id", vocabIds).in("curriculum_id", owned.length ? owned : ["00000000-0000-0000-0000-000000000000"]);
    if (error) throw new Error(error.message);
    if ((items ?? []).length !== vocabIds.length) {
      throw new Error("one or more vocab_id values were not found in your curriculums");
    }
    curriculumId = items![0].curriculum_id;
  }

  const { data, error } = await admin
    .from("drills")
    .insert({
      user_id: userId,
      curriculum_id: curriculumId,
      language_code: drill.language,
      title: drill.title ?? null,
      payload: drill,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { drillId: data.id, exerciseCount: drill.exercises.length };
}

export async function recordAttempt(
  userId: string,
  input: RecordAttemptInput,
): Promise<{ recorded: true; srs_applied: boolean }> {
  const admin = createAdminClient();

  const { data: row, error: dErr } = await admin
    .from("drills").select("id, payload")
    .eq("id", input.drill_id).eq("user_id", userId).maybeSingle();
  if (dErr) throw new Error(dErr.message);
  if (!row) throw new Error("drill not found");

  const drill = row.payload as Drill;
  const ex = drill.exercises.find((e) => e.id === input.exercise_id);
  if (!ex) throw new Error(`exercise "${input.exercise_id}" not in drill`);

  const { error: aErr } = await admin.from("drill_attempts").insert({
    drill_id: input.drill_id,
    user_id: userId,
    exercise_id: input.exercise_id,
    correct: input.correct,
    answer_given: input.answer_given ?? null,
    ms_taken: input.ms_taken ?? null,
  });
  if (aErr) throw new Error(aErr.message);

  let srsApplied = false;
  const srsEnabled = ex.srs ?? drill.srs_default;
  if (srsEnabled && ex.vocab_id) {
    const { error: gErr } = await admin.rpc("grade_card_for", {
      p_user: userId,
      p_vocab_id: ex.vocab_id,
      p_grade: drillGrade(input.correct),
      p_direction: drillDirection(ex),
      p_ms_taken: input.ms_taken ?? null,
    });
    // A grading failure (e.g. vocab deleted mid-drill) must not lose the attempt.
    srsApplied = !gErr;
  }
  return { recorded: true, srs_applied: srsApplied };
}

export async function getDrillResults(userId: string, drillId: string): Promise<DrillResults> {
  const admin = createAdminClient();
  const { data: row, error: dErr } = await admin
    .from("drills").select("id, title, payload")
    .eq("id", drillId).eq("user_id", userId).maybeSingle();
  if (dErr) throw new Error(dErr.message);
  if (!row) throw new Error("drill not found");

  const { data: attempts, error: aErr } = await admin
    .from("drill_attempts")
    .select("exercise_id, correct, answer_given, ms_taken, attempted_at")
    .eq("drill_id", drillId).eq("user_id", userId)
    .order("attempted_at", { ascending: true });
  if (aErr) throw new Error(aErr.message);

  // Latest attempt per exercise wins (drill can be replayed).
  const latest = new Map<string, (typeof attempts extends (infer T)[] | null ? T : never)>();
  for (const a of attempts ?? []) latest.set(a.exercise_id, a);
  const list = [...latest.values()].map((a) => ({
    exercise_id: a.exercise_id, correct: a.correct,
    answer_given: a.answer_given, ms_taken: a.ms_taken,
  }));
  return {
    drill_id: row.id,
    title: row.title,
    total: (row.payload as Drill).exercises.length,
    answered: list.length,
    correct: list.filter((a) => a.correct).length,
    attempts: list,
  };
}
```

(If the `latest` Map's conditional type annotation fights tsc, use an explicit local type `{ exercise_id: string; correct: boolean; answer_given: string | null; ms_taken: number | null; attempted_at: string }` — behavior over cleverness.)

- [ ] **Step 6: Typecheck** — `npx tsc --noEmit` (widgets module not imported yet, so no build needed). Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/data.ts src/lib/mcp/helpers.ts tests/mcp-data.test.ts
git commit -m "feat: drill persistence, attempt recording with SRS grading, results aggregation"
```

---

### Task 5: Design tokens + widget scaffold + single-file build pipeline

**Files:**
- Create: `src/lib/design/tokens.ts`
- Create: `src/widgets/drill/index.html`, `src/widgets/drill/main.tsx`, `src/widgets/drill/ui.tsx`, `src/widgets/drill/vite.config.ts`
- Create: `scripts/wrap-widget-html.ts`
- Modify: `package.json` (deps + scripts), `.gitignore`, `tsconfig.json` (exclude `src/widgets/dist`)
- Copy: `src/fonts/EstedadVariable.woff2` → `public/fonts/EstedadVariable.woff2`
- Test: `tests/design-tokens.test.ts` (+ build-output verification by command)

**Interfaces:**
- Consumes: nothing from other tasks (scaffold ships a placeholder shell; Task 7 fills in the player).
- Produces:
  - `themes: Record<"light" | "dark", Theme>` where `type Theme = { bg: string; surface: string; text: string; muted: string; border: string; primary: string; onPrimary: string; correct: string; incorrect: string; accent: string }` plus `radius = { sm: 8, md: 12, lg: 16, pill: 999 }`, `space(n: number): number` (n×4), `font = { body: string; display: string; script: string }` — from `src/lib/design/tokens.ts`.
  - `src/widgets/drill/ui.tsx` primitives (Task 7 builds on these): `View`, `Text`, `Pressable`, `TextInputBox` — prop shapes defined in Step 5.
  - Generated module `src/widgets/generated/drill-widget-html.ts` exporting `DRILL_WIDGET_HTML: string` (Task 6 imports it).
  - npm scripts: `widgets:build`, `predev`, `prebuild`.

- [ ] **Step 1: Install deps**

```bash
npm install @modelcontextprotocol/ext-apps @modelcontextprotocol/sdk
npm install -D vite vite-plugin-singlefile
```

(`@modelcontextprotocol/sdk` is ext-apps' peer — the 1.x package line, a *different npm name* from the `@modelcontextprotocol/server` 2.x line mcp-handler uses; they coexist. ext-apps peers: react ^19 ✓, zod ^4 ✓, node ≥20 ✓.)

- [ ] **Step 2: Failing token test** — `tests/design-tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { themes, radius, space, font } from "../src/lib/design/tokens";

describe("design tokens", () => {
  it("defines complete light and dark themes with identical key sets", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(themes.light)).toEqual(keys(themes.dark));
    for (const t of [themes.light, themes.dark]) {
      for (const v of Object.values(t)) expect(v).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
  it("spacing is a 4px scale", () => {
    expect(space(0)).toBe(0);
    expect(space(4)).toBe(16);
  });
  it("script font stack leads with Estedad", () => {
    expect(font.script.startsWith("'Estedad'")).toBe(true);
    expect(radius.pill).toBe(999);
  });
});
```

- [ ] **Step 3: Run to fail** — `npm run test -- design-tokens` → FAIL.

- [ ] **Step 4: Implement `src/lib/design/tokens.ts`**

```ts
// Parlay design tokens — the single source both the chat widgets (now) and the
// RN app (later) style from. Playful-but-grown-up: saturated teal/cobalt core,
// warm reward colors, big radii. Per-language accenting comes later via the
// languages config; these are the neutral core.

export type ThemeName = "light" | "dark";

export type Theme = {
  bg: string; surface: string; text: string; muted: string; border: string;
  primary: string; onPrimary: string; correct: string; incorrect: string; accent: string;
};

export const themes: Record<ThemeName, Theme> = {
  light: {
    bg: "#FBF7F0", surface: "#FFFFFF", text: "#1B2140", muted: "#6B7194", border: "#E4DFD4",
    primary: "#12B5AE", onPrimary: "#FFFFFF", correct: "#2FA36B", incorrect: "#E03A57", accent: "#F2A93B",
  },
  dark: {
    bg: "#10173A", surface: "#1A2350", text: "#F2EFE9", muted: "#9BA3C7", border: "#2C376B",
    primary: "#17C9C1", onPrimary: "#0B1030", correct: "#3FBF80", incorrect: "#F06078", accent: "#F5B95C",
  },
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const space = (n: number): number => n * 4;

export const font = {
  body: "'Figtree', 'Segoe UI', system-ui, sans-serif",
  display: "'Baloo 2', 'Figtree', 'Segoe UI', system-ui, sans-serif",
  script: "'Estedad', 'Vazirmatn', 'Segoe UI', Tahoma, sans-serif",
} as const;
```

- [ ] **Step 5: Scaffold the widget**

`src/widgets/drill/ui.tsx` — the RN-portable primitives layer (plain React now; the future RN app swaps this one module, not the components):

```tsx
import type { CSSProperties, ReactNode } from "react";

// RN-shaped primitives. Components written against these port to React Native
// by reimplementing this module with View/Text/Pressable/TextInput.
type BaseProps = { style?: CSSProperties; children?: ReactNode };

export function View({ style, children, dir }: BaseProps & { dir?: "rtl" | "ltr" }) {
  return <div dir={dir} style={style}>{children}</div>;
}

export function Text({ style, children, lang, dir }: BaseProps & { lang?: string; dir?: "rtl" | "ltr" }) {
  return <span lang={lang} dir={dir} style={style}>{children}</span>;
}

export function Pressable({ style, children, onPress, disabled, ariaLabel }: BaseProps & {
  onPress: () => void; disabled?: boolean; ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onPress}
      style={{ cursor: disabled ? "default" : "pointer", border: "none", background: "none", padding: 0, font: "inherit", ...style }}
    >
      {children}
    </button>
  );
}

export function TextInputBox({ value, onChange, onSubmit, dir, style, ariaLabel }: {
  value: string; onChange: (v: string) => void; onSubmit?: () => void;
  dir?: "rtl" | "ltr"; style?: CSSProperties; ariaLabel?: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      dir={dir}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter" && onSubmit) onSubmit(); }}
      style={style}
    />
  );
}
```

`src/widgets/drill/index.html` (note the `__PARLAY_SITE__` placeholder — substituted server-side at resource-read time; never hardcode a URL):

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Parlay drill</title>
    <style>
      @font-face {
        font-family: "Estedad";
        src: url("__PARLAY_SITE__/fonts/EstedadVariable.woff2") format("woff2");
        font-weight: 100 900;
        font-display: swap;
      }
      html, body { margin: 0; padding: 0; }
    </style>
  </head>
  <body>
    <div id="root" data-testid="parlay-drill"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`src/widgets/drill/main.tsx` — placeholder shell for this task (Task 8 replaces the body with real host wiring; keep the module-level `App` + handlers-before-connect shape):

```tsx
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import { themes } from "../../lib/design/tokens";

const app = new App({ name: "parlay-drill", version: "1.0.0" });

// Handlers MUST be registered before connect() or the initial
// tool-input/tool-result notifications are missed.
app.ontoolresult = (result) => {
  console.log("[parlay-drill] tool result", result);
};

const theme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? themes.dark : themes.light;
const root = createRoot(document.getElementById("root")!);
root.render(<div style={{ background: theme.bg, color: theme.text, padding: 16 }}>Parlay drill widget shell</div>);

app.connect().catch((e) => console.error("[parlay-drill] connect failed", e));
```

`src/widgets/drill/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  plugins: [react(), viteSingleFile()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: { outDir: path.resolve(__dirname, "../dist"), emptyOutDir: true },
});
```

`scripts/wrap-widget-html.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const dist = path.join("src", "widgets", "dist", "index.html");
const outDir = path.join("src", "widgets", "generated");
const html = readFileSync(dist, "utf8");
if (!html.includes("__PARLAY_SITE__")) {
  throw new Error("wrap-widget-html: __PARLAY_SITE__ placeholder missing from built widget");
}
mkdirSync(outDir, { recursive: true });
writeFileSync(
  path.join(outDir, "drill-widget-html.ts"),
  `// GENERATED by scripts/wrap-widget-html.ts — do not edit, do not commit.\n` +
  `export const DRILL_WIDGET_HTML: string = ${JSON.stringify(html)};\n`,
);
console.log(`wrap-widget-html: wrote ${outDir}/drill-widget-html.ts (${html.length} bytes)`);
```

- [ ] **Step 6: Wire scripts, gitignore, tsconfig**

In `package.json` scripts add:

```json
"widgets:build": "vite build --config src/widgets/drill/vite.config.ts && tsx scripts/wrap-widget-html.ts",
"predev": "npm run widgets:build",
"prebuild": "npm run widgets:build"
```

In `.gitignore` add:

```
src/widgets/dist/
src/widgets/generated/
```

In `tsconfig.json` `exclude`, add `"src/widgets/dist"`.

Copy the font (PowerShell — `-LiteralPath` per prior bracket-glob incident, harmless here but consistent):

```powershell
New-Item -ItemType Directory -Force public\fonts; Copy-Item -LiteralPath "src\fonts\EstedadVariable.woff2" -Destination "public\fonts\EstedadVariable.woff2"
```

- [ ] **Step 7: Build and verify output**

Run: `npm run widgets:build`
Expected: `src/widgets/dist/index.html` exists, single file (no separate .js assets in dist besides the html), contains `__PARLAY_SITE__` and `parlay-drill`; `src/widgets/generated/drill-widget-html.ts` exists. Then `npm run test -- design-tokens` → PASS, and `npx tsc --noEmit` → clean.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: design tokens, drill widget scaffold, single-file build pipeline"
```

---

### Task 6: MCP registrations — present_drill, record_attempt, get_drill_results, widget resource + smoke coverage

**Files:**
- Modify: `src/app/api/mcp/route.ts`
- Modify: `scripts/mcp-smoke.ts`
- Test: `npm run mcp:smoke` (live wire test — this task's test IS the smoke run)

**Interfaces:**
- Consumes: `createDrill`, `recordAttempt`, `getDrillResults` (Task 4 signatures), `drillSchema` (Task 2), `DRILL_WIDGET_HTML` (Task 5).
- Produces: tools `present_drill` (input `{ drill: unknown }`, result text + `structuredContent: { drill_id, drill }`, `_meta.ui.resourceUri = "ui://parlay/drill.html"`), `record_attempt` (input `{ drill_id: uuid, exercise_id: string, correct: boolean, answer_given?: string, ms_taken?: int }`), `get_drill_results` (input `{ drill_id: uuid }`); resource `ui://parlay/drill.html` with mimeType `text/html;profile=mcp-app`. Tool count: **15**.

- [ ] **Step 1: Extend the smoke test FIRST (it's the failing test)**

In `scripts/mcp-smoke.ts`:

1. Add `"present_drill", "record_attempt", "get_drill_results"` to `EXPECTED_TOOLS` (array stays `.sort()`-ed by the existing code).
2. After the existing `tools/list` equality check, add `_meta` + resource assertions:

```ts
// --- MCP Apps assertions ---
const toolsListed = /* the parsed tools array already in scope from the tools/list step */;
const presentDrill = toolsListed.find((t: { name: string }) => t.name === "present_drill");
assert(presentDrill, "present_drill missing from tools/list");
const uiMeta = (presentDrill._meta ?? {}) as Record<string, unknown>;
assert(
  (uiMeta.ui as { resourceUri?: string } | undefined)?.resourceUri === "ui://parlay/drill.html",
  "present_drill _meta.ui.resourceUri wrong",
);
assert(uiMeta["openai/outputTemplate"] === "ui://parlay/drill.html", "openai/outputTemplate alias missing");

const resList = await rpcRequest(token, "resources/list", {});
const uris = (resList.resources ?? []).map((r: { uri: string }) => r.uri);
assert(uris.includes("ui://parlay/drill.html"), `widget resource not listed (got: ${uris.join(", ")})`);

const resRead = await rpcRequest(token, "resources/read", { uri: "ui://parlay/drill.html" });
const contents = resRead.contents?.[0];
assert(contents?.mimeType === "text/html;profile=mcp-app", "widget resource mimeType wrong");
assert(typeof contents.text === "string" && /<!doctype html/i.test(contents.text), "widget resource is not an HTML doc");
assert(contents.text.includes("parlay-drill"), "widget HTML missing marker");
assert(!contents.text.includes("__PARLAY_SITE__"), "SITE placeholder not substituted");
```

(`rpcRequest` already exists and returns the parsed `result`. If `resources/list` needs a `params` of `{}` vs `undefined`, follow how `tools/list` is called in this file.)

3. After the existing `add_vocab` flow (which yields a vocab id — reuse the id variable the script already tracks), add the drill round-trip:

```ts
// --- drill round-trip ---
const drillCallResult = await rpcRequest(token, "tools/call", {
  name: "present_drill",
  arguments: {
    drill: {
      language: "fa",
      title: "smoke drill",
      exercises: [
        { id: "s1", type: "choice", prompt: { text: "pick" }, vocab_id: smokeVocabId,
          options: [{ id: "a", text: "آب", script: true }, { id: "b", text: "نان", script: true }],
          correct_id: "a" },
      ],
    },
  },
});
assert(!drillCallResult.isError, `present_drill errored: ${JSON.stringify(drillCallResult.content)}`);
const sc = drillCallResult.structuredContent as { drill_id: string; drill: { exercises: unknown[] } };
assert(typeof sc?.drill_id === "string" && sc.drill_id.length === 36, "present_drill structuredContent.drill_id missing");
assert(sc.drill.exercises.length === 1, "structuredContent.drill roundtrip failed");

const rec = await callTool(token, "record_attempt", {
  drill_id: sc.drill_id, exercise_id: "s1", correct: true, answer_given: "a", ms_taken: 1200,
}) as { recorded: boolean; srs_applied: boolean };
assert(rec.recorded === true, "record_attempt failed");
assert(rec.srs_applied === true, "record_attempt did not apply SRS grade");

const results = await callTool(token, "get_drill_results", { drill_id: sc.drill_id }) as {
  total: number; answered: number; correct: number;
};
assert(results.total === 1 && results.answered === 1 && results.correct === 1, `bad drill results: ${JSON.stringify(results)}`);

// cross-check SRS side-effect with the admin client: vocab_reviews row advanced
const { data: reviewRow } = await admin.from("vocab_reviews").select("repetitions").eq("vocab_id", smokeVocabId).maybeSingle();
assert(reviewRow && reviewRow.repetitions >= 1, "grade_card_for side-effect missing");
```

(Use the actual variable names for the admin client and the smoke-created vocab id already present in the file. If `vocab_reviews` is keyed differently — e.g. includes `direction` — select with the same filters `grade_card_for` writes; adapt from what pgTAP/`004_definers.sql` asserts.)

4. In `cleanup()`, delete created drills: `await admin.from("drills").delete().eq("user_id", userId)` (attempts cascade). Follow the file's existing cleanup style.

5. `get_tutor_instructions` raw assertions: ADD `assert(raw.includes("present_drill"), "tutor instructions missing drill guidance")` — but expect this specific assertion to fail until Task 9; add it commented out with `// TODO(Task 9): enable` and a matching note in Task 9. Every other assertion in this step must pass by the end of THIS task.

- [ ] **Step 2: Run smoke to see it fail** — `npm run mcp:smoke` → FAIL at tools/list (12 ≠ 15).

- [ ] **Step 3: Implement registrations in `src/app/api/mcp/route.ts`**

Add imports:

```ts
import { createDrill, recordAttempt, getDrillResults } from "@/lib/mcp/data";
import { drillSchema } from "@/lib/exercises/schema";
import { DRILL_WIDGET_HTML } from "@/widgets/generated/drill-widget-html";
```

(Confirm the `@/` alias maps to `src/` — it does for `@/lib/...`; widgets resolve as `@/widgets/...`.)

Add the structured-result helper next to `toolResult`/`toolResultVerbatim` (with the guard comment):

```ts
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
```

Inside `registerTools`, after `get_tutor_instructions`, register the three tools and the resource:

```ts
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
      ms_taken: z.number().int().positive().optional(),
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
```

- [ ] **Step 4: Run the smoke** — `npm run mcp:smoke`
Expected: PASS end-to-end (15 tools, `_meta` assertions, resource read, drill round-trip, SRS cross-check, cleanup). Debug failures here, not in later tasks — this is the wire-contract gate. If `registerResource`'s read callback signature complains (SDK v2 passes `(uri, ctx)`), accept the params and ignore them.

- [ ] **Step 5: Run remaining local checks** — `npm run test && npx tsc --noEmit` → green (`predev` built the widget for the smoke's dev server automatically).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mcp/route.ts scripts/mcp-smoke.ts
git commit -m "feat: present_drill/record_attempt/get_drill_results tools and MCP Apps widget resource"
```

---

### Task 7: Drill player UI — four exercise components + theming

**Files:**
- Create: `src/widgets/drill/theme.tsx`, `src/widgets/drill/components/DrillPlayer.tsx`, `.../ChoiceCard.tsx`, `.../TypedCard.tsx`, `.../ClozeCard.tsx`, `.../MatchCard.tsx`, `.../ScriptKeys.tsx`, `.../Summary.tsx`, `.../Progress.tsx`
- Test: `tests/widget-drill-player.test.tsx`, `tests/widget-cards.test.tsx`

**Interfaces:**
- Consumes: primitives from `../ui` (Task 5), `themes/radius/space/font` tokens, `checkAnswer` + types from `src/lib/exercises` (Task 2), `KEYBOARD_LAYOUT` + `ZWNJ` from `src/lib/languages/fa`.
- Produces (Task 8 mounts this):
  - `<DrillPlayer drill={Drill} languageCode={string} theme={Theme} onAttempt={(a: AttemptEvent) => void} onComplete={(s: DrillSummary) => void} />`
  - `type AttemptEvent = { exercise_id: string; correct: boolean; answer_given: string; ms_taken: number }`
  - `type DrillSummary = { total: number; correct: number; missed: string[] }` (`missed` = prompt term or first expected/pair text of each wrong exercise)
  - `ThemeProvider`/`useTheme` from `theme.tsx` (context carrying `Theme`).

**Component behaviors (all cards):** show the prompt (`prompt.term` in script styling — `font.script`, `dir="rtl"` for fa, 1.6em size — with `prompt.text` as instruction line); one attempt per exercise per run; after answering show correct/incorrect state (`theme.correct`/`theme.incorrect` border + a "Continue" button); `ms_taken` measured from card mount to answer via `Date.now()` diff; auto-advance only via the Continue press. Per-card specifics:
- **ChoiceCard:** option buttons (script-styled when `option.script`); tap = answer; `answer_given` = chosen option id; correctness = `checkAnswer`.
- **TypedCard:** `TextInputBox` (rtl + script font when `input === "script"`); when `input === "script"` and `keyboard !== false`, render `ScriptKeys` (port of the existing `ScriptKeyboard` onto the primitives: rows from `KEYBOARD_LAYOUT`, ZWNJ key `نیم‌فاصله`, space, backspace); submit button + Enter submits; correctness via `checkAnswer`.
- **ClozeCard:** `mode: "type"` = one `TextInputBox` per blank inline in the token row; `mode: "tiles"` = tile buttons from `tiles ?? blanks' expected[0]s (shuffled)` — tapping a tile fills the next open blank, tapping a filled blank clears it; submit when all blanks filled; correctness via `checkAnswer` with per-blank answers array.
- **MatchCard:** two shuffled columns (left/right); tap left then right = pair attempt; matched pairs lock (primary tint), wrong pairing flashes incorrect and increments a `misses` counter; complete when all matched; `correct = misses === 0`, `answer_given = JSON.stringify({ misses })`. Shuffle with a seeded deterministic shuffle (seed = exercise id hashed) so tests are stable: implement `seededShuffle<T>(items: T[], seed: string): T[]` inside MatchCard's module and export it for the test.
- **DrillPlayer:** renders `Progress` (answered/total pill bar), current card, then `Summary` (score headline: "۸/۱۰" no — plain "8/10", encouraging line, missed list in script styling) and fires `onComplete` exactly once.

- [ ] **Step 1: Write failing card tests** — `tests/widget-cards.test.tsx` (Testing Library style matching `tests/term-text.test.tsx`; relative imports):

```tsx
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ThemeProvider } from "../src/widgets/drill/theme";
import { ChoiceCard } from "../src/widgets/drill/components/ChoiceCard";
import { TypedCard } from "../src/widgets/drill/components/TypedCard";
import { MatchCard, seededShuffle } from "../src/widgets/drill/components/MatchCard";
import { themes } from "../src/lib/design/tokens";
import type { Exercise } from "../src/lib/exercises/schema";

const wrap = (ui: React.ReactNode) => render(<ThemeProvider theme={themes.light}>{ui}</ThemeProvider>);

describe("ChoiceCard", () => {
  const ex = { id: "e1", type: "choice", prompt: { text: "Which means water?" },
    options: [{ id: "a", text: "آب", script: true }, { id: "b", text: "نان", script: true }],
    correct_id: "a" } as Extract<Exercise, { type: "choice" }>;
  it("reports a correct answer and locks further taps", () => {
    const onAnswer = vi.fn();
    const { getByText } = wrap(<ChoiceCard exercise={ex} languageCode="fa" onAnswer={onAnswer} />);
    fireEvent.click(getByText("آب"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: true, answer_given: "a" }));
    fireEvent.click(getByText("نان"));
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });
});

describe("TypedCard", () => {
  const ex = { id: "t1", type: "typed", prompt: { text: "Type water in Farsi" },
    expected: ["آب"], input: "script" } as Extract<Exercise, { type: "typed" }>;
  it("normalizes the typed script answer", () => {
    const onAnswer = vi.fn();
    const { getByLabelText, getByText } = wrap(<TypedCard exercise={ex} languageCode="fa" onAnswer={onAnswer} />);
    fireEvent.change(getByLabelText("answer"), { target: { value: "آَب" } }); // stray fatha still correct
    fireEvent.click(getByText("Check"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
  it("renders the script keyboard for script input", () => {
    const { getByLabelText } = wrap(<TypedCard exercise={ex} languageCode="fa" onAnswer={vi.fn()} />);
    expect(getByLabelText("backspace")).toBeTruthy();
  });
});

describe("MatchCard", () => {
  const ex = { id: "m1", type: "match", prompt: { text: "Match" },
    pairs: [{ left: "آب", right: "water" }, { left: "نان", right: "bread" }] } as Extract<Exercise, { type: "match" }>;
  it("seededShuffle is deterministic", () => {
    expect(seededShuffle([1, 2, 3, 4], "m1")).toEqual(seededShuffle([1, 2, 3, 4], "m1"));
  });
  it("completes with correct=true when no misses", () => {
    const onAnswer = vi.fn();
    const { getByText } = wrap(<MatchCard exercise={ex} languageCode="fa" onAnswer={onAnswer} />);
    fireEvent.click(getByText("آب")); fireEvent.click(getByText("water"));
    fireEvent.click(getByText("نان")); fireEvent.click(getByText("bread"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
  it("counts a miss and reports correct=false", () => {
    const onAnswer = vi.fn();
    const { getByText } = wrap(<MatchCard exercise={ex} languageCode="fa" onAnswer={onAnswer} />);
    fireEvent.click(getByText("آب")); fireEvent.click(getByText("bread")); // miss
    fireEvent.click(getByText("آب")); fireEvent.click(getByText("water"));
    fireEvent.click(getByText("نان")); fireEvent.click(getByText("bread"));
    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ correct: false, answer_given: JSON.stringify({ misses: 1 }) }));
  });
});
```

`onAnswer` prop contract for every card: `(a: { correct: boolean; answer_given: string; ms_taken: number }) => void`, fired exactly once. (Cloze is covered in the player test to keep this file focused; add a ClozeCard tiles-mode test mirroring ChoiceCard if time allows — same pattern.)

- [ ] **Step 2: Run to fail** — `npm run test -- widget-cards` → FAIL (modules missing).

- [ ] **Step 3: Implement `theme.tsx`, `Progress.tsx`, `ScriptKeys.tsx`, and the four cards**

`theme.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from "react";
import { themes, type Theme } from "../../lib/design/tokens";

const ThemeCtx = createContext<Theme>(themes.light);
export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  return <ThemeCtx.Provider value={theme}>{children}</ThemeCtx.Provider>;
}
export function useTheme(): Theme {
  return useContext(ThemeCtx);
}
```

Implement the cards per the behavior spec above, using ONLY the `ui.tsx` primitives + tokens (no raw div/span/button in components — that's the portability rule; extend `ui.tsx` if a primitive is missing). Styling guide: cards are `surface` background, `radius.lg`, `space(4)` padding, 1px `border`; script text `font.script` at `1.6em`, `dir="rtl"` when `languageCode === "fa"` (pass `rtl = languageCode === "fa"` down — do not hardcode); primary action button `primary` bg / `onPrimary` text / `radius.pill` / bold; feedback states swap the card border to `correct`/`incorrect` and show "Continue". Keep each card under ~150 lines; shared bits (feedback footer, prompt header) go in a `CardShell.tsx` if repetition appears.

`ScriptKeys.tsx` is a port of `src/components/ScriptKeyboard.tsx` onto the primitives (same layout data from `KEYBOARD_LAYOUT`, same ZWNJ/space/backspace extra row, same `aria-label`s "space"/"backspace", `onMouseDown` preventDefault equivalent handled inside `Pressable` — add an optional `onPressIn` to `Pressable` if focus-stealing shows up in tests; otherwise omit).

- [ ] **Step 4: Run** — `npm run test -- widget-cards` → PASS.

- [ ] **Step 5: Write failing player test** — `tests/widget-drill-player.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ThemeProvider } from "../src/widgets/drill/theme";
import { DrillPlayer } from "../src/widgets/drill/components/DrillPlayer";
import { themes } from "../src/lib/design/tokens";
import type { Drill } from "../src/lib/exercises/schema";

const drill: Drill = {
  language: "fa", srs_default: true, title: "test",
  exercises: [
    { id: "e1", type: "choice", prompt: { text: "water?" },
      options: [{ id: "a", text: "آب" }, { id: "b", text: "نان" }], correct_id: "a" },
    { id: "c1", type: "cloze", prompt: { text: "fill" }, tokens: ["من", "___"],
      blanks: [{ index: 1, expected: ["آب"] }], mode: "tiles", tiles: ["آب", "نان"] },
  ],
};

describe("DrillPlayer", () => {
  it("advances through exercises, emits one attempt each, then completes once", () => {
    const onAttempt = vi.fn();
    const onComplete = vi.fn();
    const { getByText } = render(
      <ThemeProvider theme={themes.light}>
        <DrillPlayer drill={drill} languageCode="fa" theme={themes.light}
          onAttempt={onAttempt} onComplete={onComplete} />
      </ThemeProvider>,
    );
    fireEvent.click(getByText("آب"));                    // choice: correct
    fireEvent.click(getByText("Continue"));
    fireEvent.click(getByText("نان"));                   // cloze tile: wrong fill
    fireEvent.click(getByText("Check"));
    fireEvent.click(getByText("Continue"));
    expect(onAttempt).toHaveBeenCalledTimes(2);
    expect(onAttempt.mock.calls[0][0]).toMatchObject({ exercise_id: "e1", correct: true });
    expect(onAttempt.mock.calls[1][0]).toMatchObject({ exercise_id: "c1", correct: false });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0][0]).toMatchObject({ total: 2, correct: 1 });
    expect(getByText("1/2")).toBeTruthy();               // summary score
  });
});
```

- [ ] **Step 6: Run to fail, implement `DrillPlayer.tsx` + `ClozeCard.tsx` + `Summary.tsx`, run to pass**

`npm run test -- widget-drill-player` → FAIL → implement → PASS. DrillPlayer holds `index` + `attempts[]` state; passes each card `key={exercise.id}` (state reset per card); `missed` collects `prompt.term ?? prompt.text ?? exercise.id` of wrong answers; Summary shows `${correct}/${total}`, an encouraging line by ratio (≥0.8 "Excellent!", ≥0.5 "Good work — review the misses.", else "Tough one — let's review these."), and the missed list.

- [ ] **Step 7: Full test file pass + rebuild widget** — `npm run test && npm run widgets:build && npx tsc --noEmit` → green.

- [ ] **Step 8: Commit**

```bash
git add src/widgets/drill tests/widget-cards.test.tsx tests/widget-drill-player.test.tsx
git commit -m "feat: drill player widget UI - choice/typed/cloze/match cards with theming"
```

---

### Task 8: Widget ↔ host wiring (App class integration)

**Files:**
- Modify: `src/widgets/drill/main.tsx` (replace the Task 5 shell)
- Create: `src/widgets/drill/host.ts`
- Test: `tests/widget-host.test.ts`

**Interfaces:**
- Consumes: `DrillPlayer` + types (Task 7), ext-apps `App` (`ontoolresult`, `onhostcontextchanged`, `callServerTool`, `updateModelContext`, `getHostContext`, `connect`), tokens.
- Produces: the final widget behavior — drill in via `structuredContent`, attempts out via `record_attempt`, completion via `updateModelContext`; theme = host `theme` ?? `prefers-color-scheme`.

- [ ] **Step 1: Write failing store tests** — `tests/widget-host.test.ts` (test the store logic, not the App class):

```ts
import { describe, it, expect, vi } from "vitest";
import { createWidgetStore, buildCompletionUpdate } from "../src/widgets/drill/host";

describe("widget store", () => {
  it("captures the drill payload from a tool result and notifies subscribers", () => {
    const store = createWidgetStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.handleToolResult({
      content: [{ type: "text", text: "ok" }],
      structuredContent: { drill_id: "d1", drill: { language: "fa", srs_default: true, exercises: [] } },
    });
    expect(store.getState().payload?.drill_id).toBe("d1");
    expect(listener).toHaveBeenCalled();
  });
  it("ignores tool results without a drill payload", () => {
    const store = createWidgetStore();
    store.handleToolResult({ content: [], structuredContent: { something: 1 } });
    expect(store.getState().payload).toBeNull();
  });
  it("applies host theme changes, keeping current theme otherwise", () => {
    const store = createWidgetStore();
    store.handleHostContext({ theme: "dark" });
    expect(store.getState().theme).toBe("dark");
    store.handleHostContext({ locale: "en-US" });
    expect(store.getState().theme).toBe("dark");
  });
});

describe("buildCompletionUpdate", () => {
  it("summarizes for the model", () => {
    const u = buildCompletionUpdate("d1", { total: 5, correct: 3, missed: ["آب", "نان"] });
    expect(u.structuredContent).toMatchObject({ drill_id: "d1", total: 5, correct: 3 });
    const text = (u.content?.[0] as { text: string }).text;
    expect(text).toContain("3/5");
    expect(text).toContain("آب");
  });
});
```

- [ ] **Step 2: Run to fail** — `npm run test -- widget-host` → FAIL.

- [ ] **Step 3: Implement `src/widgets/drill/host.ts`**

```ts
import type { Drill } from "../../lib/exercises/schema";
import type { ThemeName } from "../../lib/design/tokens";
import type { DrillSummary } from "./components/DrillPlayer";

export type DrillPayload = { drill_id: string; drill: Drill };
type ToolResultLike = { content?: unknown[]; structuredContent?: unknown; isError?: boolean };

export type WidgetState = { payload: DrillPayload | null; theme: ThemeName };

// Tiny external store: the ext-apps App pushes events in, React reads via
// useSyncExternalStore. Kept App-free so it is unit-testable.
export function createWidgetStore(initialTheme: ThemeName = "light") {
  let state: WidgetState = { payload: null, theme: initialTheme };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    getState: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l); },
    handleToolResult: (result: ToolResultLike) => {
      const sc = result.structuredContent as Partial<DrillPayload> | undefined;
      if (sc && typeof sc.drill_id === "string" && sc.drill) {
        state = { ...state, payload: sc as DrillPayload };
        emit();
      }
    },
    handleHostContext: (ctx: { theme?: unknown }) => {
      if (ctx.theme === "light" || ctx.theme === "dark") {
        state = { ...state, theme: ctx.theme };
        emit();
      }
    },
  };
}

export function buildCompletionUpdate(drillId: string, summary: DrillSummary) {
  const missed = summary.missed.length ? ` Missed: ${summary.missed.join("، ")}.` : "";
  return {
    content: [{
      type: "text" as const,
      text: `Drill complete: ${summary.correct}/${summary.total} correct.${missed} Call get_drill_results for details.`,
    }],
    structuredContent: { drill_id: drillId, total: summary.total, correct: summary.correct, missed: summary.missed },
  };
}
```

- [ ] **Step 4: Run** — `npm run test -- widget-host` → PASS.

- [ ] **Step 5: Rewrite `main.tsx` against the store**

```tsx
import { StrictMode, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@modelcontextprotocol/ext-apps";
import { themes } from "../../lib/design/tokens";
import { ThemeProvider } from "./theme";
import { DrillPlayer, type AttemptEvent, type DrillSummary } from "./components/DrillPlayer";
import { createWidgetStore, buildCompletionUpdate } from "./host";
import { View, Text } from "./ui";

const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
const store = createWidgetStore(prefersDark ? "dark" : "light");
const app = new App({ name: "parlay-drill", version: "1.0.0" });

// Handlers registered BEFORE connect() — required by the ext-apps lifecycle.
app.ontoolresult = (result) => store.handleToolResult(result);
app.onhostcontextchanged = (ctx) => store.handleHostContext(ctx);

function onAttempt(drillId: string, a: AttemptEvent) {
  app.callServerTool({
    name: "record_attempt",
    arguments: {
      drill_id: drillId, exercise_id: a.exercise_id, correct: a.correct,
      answer_given: a.answer_given, ms_taken: a.ms_taken,
    },
  }).catch((e) => console.error("[parlay-drill] record_attempt failed", e));
}

function onComplete(drillId: string, s: DrillSummary) {
  app.updateModelContext(buildCompletionUpdate(drillId, s))
    .catch((e) => console.error("[parlay-drill] updateModelContext failed", e));
}

function Root() {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const theme = themes[state.theme];
  return (
    <ThemeProvider theme={theme}>
      <View style={{ background: theme.bg, color: theme.text, minHeight: 120, padding: 12, fontFamily: "'Figtree', 'Segoe UI', system-ui, sans-serif" }}>
        {state.payload ? (
          <DrillPlayer
            drill={state.payload.drill}
            languageCode={state.payload.drill.language}
            theme={theme}
            onAttempt={(a) => onAttempt(state.payload!.drill_id, a)}
            onComplete={(s) => onComplete(state.payload!.drill_id, s)}
          />
        ) : (
          <Text>Waiting for your drill…</Text>
        )}
      </View>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);

app.connect().then(() => {
  const t = app.getHostContext()?.theme;
  if (t) store.handleHostContext({ theme: t });
}).catch((e) => console.error("[parlay-drill] connect failed", e));
```

- [ ] **Step 6: Build + full local verification**

```bash
npm run widgets:build
npm run test
npx tsc --noEmit
npm run mcp:smoke
```

Expected: all green — smoke re-verifies the served widget HTML (now the real player) still satisfies every Task 6 assertion.

- [ ] **Step 7: Manual sanity in MCPJam (optional but recommended, dev server running)**

```bash
npx @mcpjam/inspector@latest
```

Connect to `http://localhost:3000/api/mcp` with header `Authorization: Bearer <token from /settings>`; call `present_drill` with a small drill JSON; confirm the card renders and answers round-trip. Record observations in the task report (this is a manual check, not a gate).

- [ ] **Step 8: Commit**

```bash
git add src/widgets/drill tests/widget-host.test.ts
git commit -m "feat: wire drill widget to MCP host - tool results in, attempts and completion out"
```

---

### Task 9: Tutor instructions teach drills (widget + text fallback)

**Files:**
- Modify: `src/lib/tutor-skill.ts` (new section builder, inserted into `buildTutorSkillBody` after the reviews section)
- Modify: `scripts/mcp-smoke.ts` (enable the Task 6 commented-out assertion)
- Test: `tests/tutor-skill.test.ts`

**Interfaces:**
- Consumes: existing private section-builder pattern in `tutor-skill.ts` (functions returning markdown strings joined with `"\n\n"`).
- Produces: `get_tutor_instructions` output (both flavors) containing drill guidance — the string `present_drill` and a compact authoring reference.

- [ ] **Step 1: Failing test** — append to `tests/tutor-skill.test.ts` (match the file's existing style for calling `buildTutorSkill`):

```ts
it("teaches interactive drills with a schema example and a text fallback", () => {
  const skill = buildTutorSkill({
    languageCode: "fa", languageName: "Persian",
    siteUrl: "https://example.test", flavor: "gpt-instructions",
  });
  expect(skill).toContain("present_drill");
  expect(skill).toContain("get_drill_results");
  expect(skill).toContain('"type":"choice"');
  expect(skill).toContain("conversationally");   // fallback guidance
  expect(skill).toContain("record_attempt");
});
```

- [ ] **Step 2: Run to fail** — `npm run test -- tutor-skill` → FAIL.

- [ ] **Step 3: Implement `drillsSection()`** in `src/lib/tutor-skill.ts` and add it to `buildTutorSkillBody`'s join list right after the reviews section:

```ts
function drillsSection(): string {
  return `# Interactive drills

After teaching or reviewing a handful of items (4-8), push an interactive drill with the present_drill tool: it renders as a tappable card in this chat where the learner answers directly, and every answer is recorded automatically (SRS grades included for exercises linked to a vocab_id: correct earns grade 4, wrong earns grade 1). Wait for the learner to finish the card, then call get_drill_results and react to what they missed.

Author the drill as JSON. 5-10 exercises, mixed types, mostly items just covered plus one or two review items. Example shapes (one per type):

{"language":"fa","title":"Food words","exercises":[
{"id":"e1","type":"choice","prompt":{"text":"Which means 'water'?"},"vocab_id":"<uuid>","options":[{"id":"a","text":"آب","script":true},{"id":"b","text":"نان","script":true}],"correct_id":"a"},
{"id":"e2","type":"typed","prompt":{"term":"آب","text":"Type the English meaning"},"expected":["water"],"input":"translation"},
{"id":"e3","type":"cloze","prompt":{"text":"Complete the sentence"},"tokens":["من","___","می‌خورم"],"blanks":[{"index":1,"expected":["آب"]}],"mode":"tiles","tiles":["آب","نان","شیر"]},
{"id":"e4","type":"match","prompt":{"text":"Match the pairs"},"pairs":[{"left":"آب","right":"water"},{"left":"نان","right":"bread"}]}]}

Rules: exercise ids unique; "typed" with "input":"script" exercises production (hardest — use sparingly early on); set "vocab_id" whenever the exercise tests a tracked vocab item so the SRS learns from it; distractor options should be plausible (same word class or theme).

Fallback: if this chat cannot render interactive cards (the learner reports seeing no card after you call present_drill), run the same exercises conversationally — ask, wait for the answer, then grade honestly with grade_card and record notable mistakes via log_practice_session. Never leave a drill half-presented: either the card completes or you run it yourself.`;
}
```

(Escape/quote exactly as the file's other sections do — they are template literals; the JSON stays single-line-per-exercise to keep the model's copy budget small.)

- [ ] **Step 4: Run** — `npm run test -- tutor-skill` → PASS.

- [ ] **Step 5: Enable the smoke assertion** — in `scripts/mcp-smoke.ts` uncomment the Task 6 `// TODO(Task 9)` line asserting `raw.includes("present_drill")` in the `get_tutor_instructions` raw checks.

- [ ] **Step 6: Verify wire** — `npm run mcp:smoke` → PASS (including the newly enabled assertion).

- [ ] **Step 7: Commit**

```bash
git add src/lib/tutor-skill.ts tests/tutor-skill.test.ts scripts/mcp-smoke.ts
git commit -m "feat: tutor instructions teach interactive drills with text fallback"
```

---

### Task 10: Full verification, cloud migration, Vercel rename + deploy, acceptance

**Files:**
- Modify: `.env.local` / Vercel env (`NEXT_PUBLIC_SITE_URL`), memory file update happens post-merge by the controller.
- No new code; this is the ship gate.

**Interfaces:** consumes everything; produces a live deployment.

- [ ] **Step 1: Full local suite in the mandated order**

```bash
npx supabase db reset --local
npx supabase test db
# recreate dev user mag@saf.com / localdev123 (admin API, as in Task 3 Step 4)
npm run seed -- --user mag@saf.com
npm run widgets:build
npm run test
npx tsc --noEmit
npm run build
npm run mcp:smoke
npm run oauth:smoke
npx playwright test
```

Expected: every stage green. Playwright specs that assert brand copy were fixed in Task 1; if any strays surface here, fix them now.

- [ ] **Step 2: Push the migration to the cloud (NOT a reset — data survives)**

```bash
npx supabase db push --linked
```

Expected: applies exactly `20260818100001_drills.sql`. Verify:

```bash
npx supabase db query "select count(*) from public.drills" --linked
```

Expected: `0` (table exists, empty).

- [ ] **Step 3: Rename the Vercel project**

Try CLI first: `npx vercel project ls` then check `npx vercel project --help` for a rename subcommand. If the CLI supports it, rename `farsi-progress-tracker` → `parlay` (if the `parlay` slug is taken for *.vercel.app, use `parlay-app` — decide by what Vercel accepts, prefer shortest). If the CLI cannot rename, STOP and ask the user to rename in the Vercel dashboard (Project → Settings → General → Project Name) and report back the new URL. Do not create a second project.

- [ ] **Step 4: Update `NEXT_PUBLIC_SITE_URL` everywhere it lives**

- Vercel env: `npx vercel env rm NEXT_PUBLIC_SITE_URL production` then `npx vercel env add NEXT_PUBLIC_SITE_URL production` with the new `https://<new-name>.vercel.app`.
- Supabase auth config: update `site_url`/redirect URLs for the hosted project the same way the original deploy did (`supabase config push` syncs `[auth]` from `config.toml` — update `config.toml`'s site_url/additional_redirect_urls to the new domain first, keeping localhost entries).
- `.env.local`: leave localhost values; only prod values change.

- [ ] **Step 5: Deploy and verify prod**

```bash
npx vercel deploy --prod
```

Then verify (curl.exe, not Invoke-WebRequest — header-reading false negatives):

```bash
curl.exe -si https://<new-name>.vercel.app/api/mcp | Select-String -Pattern "401|WWW-Authenticate"
```

Expected: 401 with `WWW-Authenticate: Bearer resource_metadata="https://<new-name>.vercel.app/.well-known/oauth-protected-resource"`. Also fetch `https://<new-name>.vercel.app/.well-known/oauth-protected-resource` → 200 JSON referencing the new origin, and `https://<new-name>.vercel.app/fonts/EstedadVariable.woff2` → 200.

- [ ] **Step 6: Manual acceptance checklist (user-facing — report, don't gate)**

Present to the user for their live run-through:
1. ChatGPT → Settings → Apps & Connectors → developer mode → add `https://<new-name>.vercel.app/api/mcp` (OAuth) → in a chat, ask the tutor to teach a few words then drill → interactive card renders, answers record, tutor reacts via get_drill_results.
2. claude.ai → same connector URL → confirm tools work and `present_drill` degrades to conversational drilling (widget rendering is directory-gated on Claude as of Aug 2026).
3. `/welcome` wizard still works under the new name/URL (bootstrap prompt shows the new URL via env interpolation).

- [ ] **Step 7: Commit any config deltas and hand off**

```bash
git add -A
git commit -m "chore: cloud migration pushed, Vercel project renamed to parlay, prod verified"
```

Merge/branch finish per superpowers:finishing-a-development-branch. Post-merge: update the memory file (new prod URL, tool count 15, widget architecture, Claude directory-gating status) and note that the repo folder rename (`farsi-progress-tracker` → `parlay`) is left for the user to do between sessions (renaming the cwd mid-session breaks tooling).

---

## Self-Review (completed at authoring)

- **Spec coverage:** rename (T1), schema+4 types (T2), tables (T3), tools+resource+wire (T4/T6), tokens+dual theme (T5), widget UI+keyboard (T7), host wiring incl. updateModelContext + host theme (T8), tutor both-modes guidance (T9), deploy+directory-gating acceptance (T10). Spec §4.4's react-native-web bet is resolved to the documented fallback via the `ui.tsx` primitives layer (recorded in T5) — the spec pre-authorized this fallback; the primitives preserve the RN port path. Spec's `exercise_attempts` linkage is implemented as a dedicated `drill_attempts` table (T3 rationale comment) because `exercise_attempts.exercise_id` is a non-null FK to lesson-authoring exercises.
- **Placeholder scan:** no TBDs; every code step carries real code; MatchCard/ClozeCard behaviors are specified prose+contract where full listings would exceed usefulness, with their tests defining the exact expected behavior.
- **Type consistency:** `AttemptEvent`/`DrillSummary` (T7) match `onAttempt`/`onComplete` usage (T8); `RecordAttemptInput` (T4) matches the `record_attempt` inputSchema (T6) and the widget's `callServerTool` arguments (T8); `DRILL_WIDGET_HTML` (T5) matches the T6 import; `drill_id`/`exercise_id` naming is consistent across table (T3), TS (T4), tool (T6), and widget (T8).
