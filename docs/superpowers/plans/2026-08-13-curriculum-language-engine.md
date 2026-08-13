# Curriculums + Language-Agnostic Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the tracker around curriculums (marketplace-ready lesson collections) with a language-agnostic engine; Farsi becomes the first configured language. All data including users is destroyed by design.

**Architecture:** Squashed migration baseline (6 files) replaces the 15-file chain; a `languages` config table + per-language TypeScript registry (`src/lib/languages/`) splits language *facts* (DB) from language *behavior* (TS). Vocab columns generalize (term/translation/morphology), content packages bump to v2 with a v1 upconverter, and every content surface scopes to the profile's active curriculum.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres/pgTAP), zod v4, vitest + testing-library, mcp-handler 2.1.0.

**Spec:** `docs/superpowers/specs/2026-08-13-curriculum-language-engine-design.md` (read it first).

## Global Constraints

- ZWNJ (U+200C) is never stripped from stored/displayed text; diacritics live only in `term_vocalized` (plain `term` is the upsert identity key).
- Every Persian string in JSX renders with `dir="rtl" lang="fa"` via TermText or explicit attrs; language attrs now come from the curriculum's language config.
- TS normalizers MUST byte-mirror their SQL `normalize_term` branch (tested against shared fixtures).
- Grants: local + hosted Supabase have NO default table privileges — every table gets explicit `grant ... to authenticated, service_role` (+ `usage` on sequences); `revoke execute ... from public` also strips service_role — always re-grant explicitly.
- Definer functions must carry explicit tenant-ownership predicates (`owner_id = p_user`); RLS does not protect them.
- Imports stay presence-aware: absent field ≠ reset. Exercises replace-per-lesson only when the key is present.
- zod v4 API; vitest cannot resolve `@/` — modules under test use relative imports.
- Gate every task: `npm test` green and (for app tasks) `npx next build` clean before commit.
- Old migrations/tests remain in the repo until Task 12 deletes them — earlier tasks COPY from them; the new baseline lives in `supabase/migrations_v2/` until the swap in Task 12.
- Local Supabase requires Docker Desktop: `Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"` then poll `docker info` until it succeeds; then `npx supabase stop 2>$null; npx supabase start`. Note `supabase/config.toml` db.port 54322/api 54321.
- Commit messages: conventional, with the standard co-author/session trailer used in this repo.

## Rename Map (referenced by every task)

| Old | New |
|---|---|
| table `courses` | `curriculums` |
| `courses.owner_id` | `curriculums.owner_id` (+ new `language_code`, `visibility`, `cloned_from`) |
| `*.course_id` | `*.curriculum_id` |
| `profiles.active_course_id` | `profiles.active_curriculum_id` |
| `profiles.fa_scale` | `profiles.script_scale` |
| `vocab_items.farsi` | `vocab_items.term` |
| `vocab_items.farsi_vocalized` | `vocab_items.term_vocalized` |
| `vocab_items.farsi_normalized` | `vocab_items.term_normalized` |
| `vocab_items.english` | `vocab_items.translation` |
| `vocab_items.present_stem/past_stem` | `vocab_items.morphology jsonb` (`{"present_stem":..,"past_stem":..}`) |
| fn `fa_normalize(text)` | kept, called only from `normalize_term('fa', text)` |
| exercise types `en_to_fa`/`fa_to_en` | `to_target`/`from_target` |
| CSS `.font-fa`, `--fa-scale`, `--font-farsi` | `.font-script`, `--script-scale`, `--font-script` |
| component `FarsiText` | `TermText` (new props: `rtl`, `langCode`) |
| component `FaKeyboard` | `ScriptKeyboard` (layout prop) |
| component `FaScaleSlider` | `ScriptScaleSlider` |
| lib `src/lib/farsi.ts` | split: `src/lib/languages/fa.ts` + `src/lib/text.ts` |
| package v1 `course{name}` | v2 `curriculum{name, language}` |

---

### Task 1: Baseline schema migrations (extensions, languages, tables)

**Files:**
- Create: `supabase/migrations_v2/20260813100001_extensions.sql`
- Create: `supabase/migrations_v2/20260813100002_schema.sql`
- Create: `supabase/tests_v2/001_schema.sql`
- Read (copy sources): `supabase/migrations/20260809000001_extensions.sql`, `20260809000002_fa_normalize.sql`, `20260809000003_schema.sql`

**Interfaces:**
- Produces: all tables per spec §Data model; `normalize_term(p_lang text, p_text text) returns text`; trigger `vocab_items_normalize` keeping `term_normalized` fresh; `handle_new_user()` trigger on `auth.users`.

- [ ] **Step 1: Start Docker + local stack** (Global Constraints recipe). `npx supabase stop --no-backup` then move nothing yet — old stack still runs old migrations; that is fine for now.
- [ ] **Step 2: Write `100001_extensions.sql`** — copy `20260809000001_extensions.sql` verbatim (pg_cron, pg_net, pgtap creation) and append the `fa_normalize` function body copied verbatim from `20260809000002_fa_normalize.sql`.
- [ ] **Step 3: Write `100002_schema.sql`.** Contents, in order:

```sql
create table languages (
  code text primary key,
  name text not null,
  native_name text not null,
  rtl boolean not null default false,
  has_diacritics boolean not null default false,
  script_font text
);
insert into languages (code, name, native_name, rtl, has_diacritics, script_font)
values ('fa', 'Persian', 'فارسی', true, true, 'estedad');

create or replace function normalize_term(p_lang text, p_text text)
returns text language sql immutable as $$
  select case p_lang
    when 'fa' then fa_normalize(p_text)
    else lower(btrim(regexp_replace(p_text, '\s+', ' ', 'g')))
  end;
$$;
```

Then every table from `20260809000003_schema.sql` copied with the Rename Map applied. `profiles` keeps all columns (email prefs, limits, timezone, `show_diacritics boolean not null default true`) with `script_scale smallint not null default 125 constraint profiles_script_scale_range check (script_scale between 100 and 200)` and `active_curriculum_id uuid` (FK added after curriculums). `curriculums` adds:

```sql
  language_code text not null references languages(code),
  visibility text not null default 'private' check (visibility in ('private','public')),
  cloned_from uuid references curriculums(id) on delete set null,
```

`vocab_items`: `term text not null`, `term_vocalized text`, `term_normalized text`, `transliteration text not null`, `translation text not null`, `morphology jsonb`, rest unchanged; unique `(curriculum_id, lesson_id, term)`. Normalization trigger:

```sql
create or replace function vocab_items_normalize() returns trigger
language plpgsql as $$
begin
  new.term_normalized := normalize_term(
    (select language_code from curriculums where id = new.curriculum_id), new.term);
  return new;
end; $$;
create trigger vocab_items_normalize before insert or update of term, curriculum_id
  on vocab_items for each row execute function vocab_items_normalize();
```

`exercises.type` check becomes `check (type in ('to_target','from_target','cloze','scramble'))`. Copy `handle_new_user` trigger block verbatim (it only touches profiles columns that survive).
- [ ] **Step 4: Write pgTAP `tests_v2/001_schema.sql`** — `plan(14)`: `has_table` for languages/curriculums/units/lessons/vocab_items/exercises/vocab_reviews/review_log/study_days/lesson_completions; `has_column('vocab_items','term')`, `has_column('vocab_items','morphology')`; `results_eq` for `normalize_term('fa','كتابِ  خوب')` = `select fa_normalize('كتابِ  خوب')` and `normalize_term('es','  Hola   Mundo ')` = `'hola mundo'`.
- [ ] **Step 5: Dry-run the new baseline in isolation:** temporarily point config at v2 (`Copy-Item supabase/config.toml supabase/config.toml.bak` not needed — instead run: `npx supabase db reset --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres` is NOT available for alt dirs; instead apply manually: `docker exec -i supabase_db_farsi-progress-tracker psql -U postgres -d postgres -c "create database baseline_v2"` then pipe each v2 file: `Get-Content supabase/migrations_v2/20260813100001_extensions.sql -Raw | docker exec -i supabase_db_farsi-progress-tracker psql -U postgres -d baseline_v2 -v ON_ERROR_STOP=1 -f -` (repeat per file; auth schema absent in a bare DB, so guard the `handle_new_user` trigger creation with `do $$ begin if exists (select 1 from pg_namespace where nspname='auth') then ... end if; end $$;` — write it that way in the migration).
- [ ] **Step 6: Run pgTAP against baseline_v2** with `psql -d baseline_v2 -f supabase/tests_v2/001_schema.sql` via the same docker exec pattern piping through `pg_prove` is unavailable → simpler: the file starts with `begin; select plan(14);` and ends `select * from finish(); rollback;` and you assert no `not ok` lines in output: `... | Select-String "not ok"` expects no matches.
- [ ] **Step 7: Commit** `feat: v2 baseline — languages config, generic schema, normalize_term`

### Task 2: Baseline RLS, grants, SRS + queue functions

**Files:**
- Create: `supabase/migrations_v2/20260813100003_rls_grants.sql`
- Create: `supabase/migrations_v2/20260813100004_functions.sql`
- Create: `supabase/tests_v2/002_rls.sql`, `supabase/tests_v2/003_functions.sql`
- Read (copy sources): `20260809000004_rls.sql`, `20260809000005_functions.sql`, `20260809000006_service_role_grants.sql`, `20260809000007_bump_study_day.sql`, `20260809000010_timezone_guard.sql`

**Interfaces:**
- Produces: `grade_card(p_vocab_id, p_grade, p_direction, p_ms_taken)`, `get_review_queue()` returning `(vocab_id, term, term_vocalized, transliteration, translation, part_of_speech, morphology, colloquial, repetitions, is_new)`, `local_today(p_user)`, `current_streak()`, `bump_study_day()`. **Queue scoping: `v.curriculum_id = (select active_curriculum_id from prof)` — active curriculum only, per spec.**

- [ ] **Step 1:** `100003_rls_grants.sql`: copy every policy/grant block from `20260809000004_rls.sql` + `..0006_service_role_grants.sql` with the Rename Map; add `languages`: `alter table languages enable row level security; create policy "read languages" on languages for select to authenticated using (true); grant select on languages to authenticated, service_role;` (no insert/update grants to authenticated).
- [ ] **Step 2:** `100004_functions.sql`: copy `local_today` + `grade_card` + `get_review_queue` bodies from `20260809000010_timezone_guard.sql` (the current authoritative versions), `current_streak` from `..0005_functions.sql`, `bump_study_day` from `..0007`, applying the Rename Map; in `get_review_queue` replace both `v.course_id in (select id from courses where owner_id = ...)` predicates with `v.curriculum_id = (select active_curriculum_id from prof)` and add `term_vocalized` + `morphology` to the return table (drop `present_stem/past_stem` columns from it). Carry over every `revoke`/`grant execute` line, renamed.
- [ ] **Step 3:** pgTAP `002_rls.sql` — copy the structure of existing `supabase/tests/002*` two-tenant suite (create two auth.users, per-user curriculums, assert cross-tenant selects return 0 rows, anon denied). `003_functions.sql`: seed one user + curriculum + 2 vocab items (one reviewed & due, one new), set `active_curriculum_id`; assert queue returns 2; create a SECOND curriculum for the same user with 1 vocab and assert queue still returns 2 (active-only scoping); `grade_card` grade 5 then assert `interval_days = 1`, `repetitions = 1`; grade 1 asserts lapse reset.
- [ ] **Step 4:** Apply both files to `baseline_v2` DB (docker exec pattern from Task 1 Step 5) — but two-tenant tests need `auth.users`; run these two test files under the REAL local stack later in Task 12 instead; for now validate SQL parses via `psql -d baseline_v2 -v ON_ERROR_STOP=1` (functions referencing auth schema guarded same as Task 1).
- [ ] **Step 5: Commit** `feat: v2 baseline — rls, grants, srs functions with active-curriculum queue`

### Task 3: Baseline email/cron, definer variants, tokens + oauth

**Files:**
- Create: `supabase/migrations_v2/20260813100005_email_cron.sql`
- Create: `supabase/migrations_v2/20260813100006_tokens_oauth.sql`
- Create: `supabase/tests_v2/004_definers.sql`
- Read (copy sources): `20260809000009_email_functions.sql` (or nearest — locate via `Get-ChildItem supabase/migrations`), `20260812000012_cron_vault_secrets.sql`, `20260810000011_api_tokens_and_for_variants.sql`, `20260812000013_oauth.sql`

**Interfaces:**
- Produces: `users_due_daily_email()`, `next_lesson_for(uuid)` (joins curriculums), cron jobs reading Vault (`edge_url`, `service_role_key`); `grade_card_for`, `get_review_queue_for` (same signature changes as Task 2), `bump_study_day_for`; `api_tokens`, `oauth_clients`, `oauth_codes` verbatim.

- [ ] **Step 1:** `100005_email_cron.sql`: copy email-selection functions + `next_lesson_for` with Rename Map; append the two `cron.schedule` blocks from `20260812000012_cron_vault_secrets.sql` verbatim WITHOUT the leading `cron.unschedule` calls (fresh DB has no jobs).
- [ ] **Step 2:** `100006_tokens_oauth.sql`: copy `20260810000011` + `20260812000013` whole, applying Rename Map inside `_for` bodies; `get_review_queue_for` gets the same active-curriculum scoping + return-shape change as Task 2 (predicate: `v.curriculum_id = (select active_curriculum_id from profiles where id = p_user)` — and KEEP an ownership check: `and exists (select 1 from curriculums c where c.id = v.curriculum_id and c.owner_id = p_user)`).
- [ ] **Step 3:** pgTAP `004_definers.sql`: two-tenant — user A active curriculum with vocab, user B calls `get_review_queue_for(B)` → 0 rows; B calling `grade_card_for(B, <A's vocab id>, 5)` raises `vocab item not found in caller''s courses` (update message to `curriculums` in the function body and match here).
- [ ] **Step 4:** Parse-validate against baseline_v2 (same guard/docker pattern); drop the scratch DB: `docker exec supabase_db_farsi-progress-tracker psql -U postgres -c "drop database baseline_v2"`.
- [ ] **Step 5: Commit** `feat: v2 baseline — email/cron, definer variants, tokens, oauth`

### Task 4: Language registry + text helpers

**Files:**
- Create: `src/lib/languages/types.ts`, `src/lib/languages/fa.ts`, `src/lib/languages/index.ts`, `src/lib/text.ts`
- Create: `tests/languages-fa.test.ts`, `tests/text.test.ts`
- Read (source to split): `src/lib/farsi.ts`, `tests/farsi.test.ts`
- Modify: nothing else yet (old farsi.ts stays until Task 7 removes its last importer)

**Interfaces:**
- Produces:

```ts
// types.ts
export type DrillProvider = {
  // builds conjugation-style flashcards from a vocab item's morphology; null if not applicable
  buildCards(item: { term: string; transliteration: string; translation: string;
                     morphology: Record<string, string> | null }): DrillCard[] | null;
  pronouns: string[];
};
export type DrillCard = { label: string; forms: string[] };  // per-pronoun forms
export type LanguageModule = {
  code: string; normalize: (s: string) => string;
  stripDiacritics?: (s: string) => string;
  keyboardLayout?: string[][];
  drills?: DrillProvider;
  sampleText: string;
};
// index.ts
export function getLanguage(code: string): LanguageModule;   // falls back to genericLanguage
export const genericLanguage: LanguageModule;                 // normalize = lower/trim/collapse
// fa.ts re-exports (moved verbatim): faNormalize, stripFaDiacritics, PRONOUNS,
//   conjugatePresent, conjugatePast, ZWNJ, KEYBOARD_LAYOUT (moved from FaKeyboard.tsx)
// text.ts (moved verbatim from farsi.ts): toPersianDigits→toDigits(map), toWesternDigits,
//   levenshtein, checkTypedAnswer(input, expected, normalize: (s:string)=>string)
```

- [ ] **Step 1: Write failing tests.** `tests/languages-fa.test.ts`: port every case from `tests/farsi.test.ts` (normalizer mirror cases, glide-rule conjugation suite incl. VAV_VOWEL_STEMS cases گو→می‌گویم, رو→می‌روم, diacritics stripping preserving ZWNJ), plus: `getLanguage("fa").drills.buildCards({term:"رفتن",..., morphology:{present_stem:"رو",past_stem:"رفت"}})` returns cards whose present forms include `می‌روم`; `getLanguage("xx")` returns genericLanguage; `genericLanguage.normalize("  Hola   Mundo ") === "hola mundo"` (must mirror SQL default branch). `tests/text.test.ts`: checkTypedAnswer now takes the normalizer as an arg — `checkTypedAnswer("کتابِ","کتاب", fa.normalize).verdict === "exact"`.
- [ ] **Step 2:** Run `npx vitest run tests/languages-fa.test.ts tests/text.test.ts` — FAIL (modules missing).
- [ ] **Step 3:** Implement by MOVING code from `farsi.ts` (keep bodies byte-identical; only signatures noted above change). `fa.ts` drill provider wraps conjugatePresent/Past: `buildCards` returns null unless `morphology?.present_stem`; forms arrays are the existing conjugation outputs (past column only when past_stem present — preserve the hasStem guard).
- [ ] **Step 4:** Green. **Step 5:** `npm test` (old farsi tests still green — farsi.ts untouched). **Step 6: Commit** `feat: language registry with fa module and generic text helpers`

### Task 5: Content package v2 + v1 upconverter + import

**Files:**
- Modify: `src/lib/content-package.ts` (rewrite schema/import), `tests/content-package.test.ts`
- Create: `src/lib/package-v1.ts` (upconverter), `tests/package-v1.test.ts`

**Interfaces:**
- Produces:

```ts
// content-package.ts
export const ContentPackageSchema; // v2: { format:"farsi-tracker/content-package", version:2,
  // curriculum:{ name, language, description? }, units?, lessons? }
  // vocab item: { term, term_vocalized?, transliteration, translation, part_of_speech?,
  //   morphology?: Record<string,string>, colloquial?, tags?, notes? } (all strings trimmed min 1)
  // exercise.type: "to_target"|"from_target"|"cloze"|"scramble"
export function deriveVocabScript(term: string, vocalized?: string | null):
  { term: string; term_vocalized?: string };   // same diacritic rule, renamed
export async function importContentPackage(supabase, ownerId, pkg): Promise<ImportResult>;
  // upserts curriculums on (owner_id,name); sets language_code; validates language exists
  // (select from languages; error `unsupported language "xx" — supported: fa`);
  // first curriculum becomes active_curriculum_id
// package-v1.ts
export function upconvertV1(raw: unknown): unknown; // v1 object → v2 object (field map from
  // Rename Map; course→curriculum with language:"fa"; en_to_fa→to_target, fa_to_en→from_target;
  // present_stem/past_stem→morphology). Returns raw unchanged if version!==1.
export function parseAnyPackage(raw: unknown) // upconvertV1 then ContentPackageSchema.parse
```

- [ ] **Step 1: Failing tests.** Rewrite `tests/content-package.test.ts` fixtures to v2 (keep every presence-aware/buildLessonPayload/deriveVocabScript case, renamed). `tests/package-v1.test.ts`: feed the exact v1 fixture from the OLD test file (course + farsi/english vocab + en_to_fa exercise + stems) through `parseAnyPackage`; assert term/translation/morphology/to_target/curriculum.language==="fa"; assert v2 input passes through untouched; assert whitespace-only term still rejected post-conversion.
- [ ] **Step 2:** RED. **Step 3:** Implement (import loop: vocab upsert onConflict `"curriculum_id,lesson_id,term"`, morphology written only when present — presence-aware as today's farsi_vocalized). **Step 4:** GREEN + `npm test`. **Step 5: Commit** `feat: content package v2 with v1 upconverter`

### Task 6: TermText, ScriptKeyboard, script CSS, layout

**Files:**
- Create: `src/components/TermText.tsx` (from FarsiText), `src/components/ScriptKeyboard.tsx` (from FaKeyboard), `src/components/ScriptScaleSlider.tsx` (from FaScaleSlider)
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `tests/term-text.test.tsx`, `tests/script-keyboard.test.tsx`, `tests/script-scale-slider.test.tsx` (ported from the fa-named ones)
- Delete: old components + their old test files (in this task — their importers are updated in Task 7; run `npx next build` only AFTER Task 7, so this task gates on vitest only)

**Interfaces:**
- Produces:

```tsx
export function TermText({ term, translit, translation, rtl = true, langCode = "fa",
  locked = false, className = "" });   // tri-state cycle identical to FarsiText;
  // script stage renders <span dir={rtl?"rtl":"ltr"} lang={langCode} className="font-script">
export function ScriptKeyboard({ layout, onKey, onBackspace });  // rows from layout prop
export function ScriptScaleSlider({ initial, sampleText, rtl, langCode });
```

- CSS: `.font-script { font-family: var(--font-script); font-size: calc(1em * var(--script-scale, 1.25)); line-height: 1.5; }` in `@theme` `--font-script: var(--font-estedad), serif;`. Layout: font const renamed `estedadFont` with `variable: "--font-estedad"` **kept on `<html>` className** (regression guard: variable on body broke resolution — keep the comment). Body style sets `--script-scale` from `profiles.script_scale`.
- [ ] Steps: port tests (RED via missing components) → move component code applying interface → GREEN → commit `feat: script-generic text, keyboard, slider components`.

### Task 7: App-wide rename sweep (pages, actions, components)

**Files:**
- Modify: `src/app/flashcards/page.tsx`, `src/app/review/page.tsx`, `src/app/vocab/page.tsx`, `src/app/vocab/actions.ts`, `src/app/lessons/[slug]/page.tsx`, `src/app/lessons/[slug]/practice/page.tsx`, `src/app/lessons/actions.ts`, `src/app/progress/page.tsx`, `src/app/settings/page.tsx`, `src/app/settings/actions.ts`, `src/app/api/export/route.ts`, `src/components/{FlashcardDeck,ReviewSession,ExercisePlayer,VocabTable,CompletionForm,Nav}.tsx`
- Delete: `src/lib/farsi.ts`, `tests/farsi.test.ts`, old Fa* components/tests if any remain
- Modify tests: `tests/{flashcard-deck,exercises,grade-queue,directions,fa-component,farsi-text,fa-keyboard,import-parsers}.test.*` — rename/port to new components and fields

**Interfaces:**
- Consumes: Task 4 registry (`getLanguage(curriculum.language_code)`), Task 6 components, Task 5 schema.
- Produces: every page queries `curriculums`/`term`/`translation`/`morphology`; conjugation surfaces (flashcards "conjugations" deck, ExercisePlayer drills) render ONLY when `getLanguage(lang).drills` exists AND item morphology non-null; ScriptKeyboard rendered only when `keyboardLayout` exists. Pages fetch active curriculum once: `profiles.active_curriculum_id → curriculums(id, language_code, name)` and thread `{rtl, langCode, fontClass}` down as props.

- [ ] **Step 1:** Update the test files first (they define expected behavior): flashcard-deck test cards use `{term, translit, translation, morphology}`; a `kind:"verb"` card with `morphology:null` must NOT render a conjugation table; directions/grade-queue tests rename fields.
- [ ] **Step 2:** RED. **Step 3:** Sweep implementation file-by-file with the Rename Map; delete `farsi.ts` last, fixing any straggler import the compiler finds. ReviewSession `stem` direction reads `morphology.present_stem`; ExercisePlayer conjugation drills call `getLanguage(lang).drills.buildCards`.
- [ ] **Step 4:** `npm test` green, `npx next build` clean (first build gate since Task 6). **Step 5: Commit** `refactor: app-wide curriculum/term rename with capability-gated drills`

### Task 8: Library page + import relocation + nav

**Files:**
- Create: `src/app/curriculums/page.tsx`, `src/app/curriculums/actions.ts`, `src/app/curriculums/import/page.tsx` (move of `src/app/import/*` guts)
- Modify: `src/app/import/page.tsx` → `redirect("/curriculums/import")`; `src/components/Nav.tsx` (Library first)
- Test: `tests/curriculum-actions.test.ts` (pure pieces), Playwright covers flow in Task 11

**Interfaces:**
- Produces server actions:

```ts
export async function setActiveCurriculum(id: string);   // verifies owner, updates profile
export async function deleteCurriculum(id: string);      // verifies owner, delete cascades
```

Page: card per owned curriculum — name, `languages.native_name` badge, lesson count, `count(lesson_completions)/count(lessons)` progress, Active marker; actions: set-active, export (links existing `/api/export?curriculum=<id>`, updated in Task 7), delete (confirm dialog listing counts); import button. Empty state: "Import your first curriculum" pointing at `/curriculums/import` + `/prompts`.
- [ ] Steps: write action tests (ownership check: acting on another id throws "curriculum not found") → RED with mocked supabase client per `tests/mcp-data.test.ts` pattern → implement → build gate → commit `feat: curriculum library page`.

### Task 9: MCP surface v2

**Files:**
- Modify: `src/lib/mcp/data.ts`, `src/app/api/mcp/route.ts`, `tests/mcp-data.test.ts`, `scripts/mcp-smoke.ts`

**Interfaces:**
- Produces: tool JSON uses term/translation/term_vocalized/morphology; `add_vocab` input adds `morphology: z.record(z.string(), z.string()).optional()`, drops present/past_stem params (upconvert inside: if present_stem/past_stem args arrive from an old client schema they no longer exist — clean break, tools are self-describing); `import_content_package` runs `parseAnyPackage` (v1 packages keep working); `get_study_state` adds `curriculum: { name, language }`; every "course" string in errors/descriptions becomes "curriculum". `getDueVocab/getStrugglingVocab/searchVocab/getReviewQueue` keep exact tenant-scoping predicates, renamed, and scope to `active_curriculum_id`.

- [ ] Steps: update `tests/mcp-data.test.ts` fixtures/assertions (keep both tenant-isolation regression tests!) → RED → implement → `npm test` + build → update `scripts/mcp-smoke.ts` assertions (11 tools, term fields, v1 import accepted) → commit `feat: mcp v2 fields and curriculum scoping`.

### Task 10: Edge functions + prompts page + seed script

**Files:**
- Modify: `supabase/functions/daily-reminder/index.ts`, `supabase/functions/weekly-digest/index.ts` (field renames only: farsi→term, english→translation, course→curriculum in queries + email HTML; esc() and per-user try/catch stay)
- Modify: `src/lib/agent-prompts.ts`, `tests/agent-prompts.test.ts`, `src/app/prompts/page.tsx`
- Modify: `scripts/seed-lessons.ts`

**Interfaces:**
- Produces: SCHEMA_DOC v2 (exact v2 example object with term/translation/morphology/to_target, curriculum block with `"language": "fa"`, field notes updated including the farsi_vocalized→term_vocalized guidance renamed, orthography rules kept but introduced as "Language rules (Persian)" emitted only when the active curriculum's language is fa — prompt builders take `languageCode`/`languageName` params from CourseState→CurriculumState rename); seed script emits a v2 package.
- [ ] Steps: rewrite agent-prompts tests for v2 (assert `"version": 2`, `"term"`, `"language": "fa"`, no `"farsi":` key) → RED → implement → seed script compile-check `npx tsx --tsconfig tsconfig.json scripts/seed-lessons.ts --help` style dry check (guard: script prints usage without env) → commit `feat: v2 prompts, edge function renames, v2 seed`.

### Task 11: Local integration green (swap baseline in, full suites)

**Files:**
- Move: `supabase/migrations` → deleted; `supabase/migrations_v2` → `supabase/migrations`; same for `tests_v2` → `supabase/tests`
- Modify: `scripts/oauth-smoke.ts` (only if field assertions break), `playwright/*` specs
- Delete: old `supabase/tests/00*` files replaced by v2 suite

**Interfaces:** none new — this task proves everything integrates.

- [ ] **Step 1:** Swap directories (git mv). Remove the Task-1 `do $$ ... auth exists` guards? NO — keep them; harmless on real stack.
- [ ] **Step 2:** `npx supabase db reset` (real local stack — applies baseline + auth schema) → `npx supabase test db` → ALL pgTAP green including the two-tenant suites deferred from Tasks 2-3.
- [ ] **Step 3:** Recreate local dev user (mag@saf.com/localdev123 via `npx supabase auth` admin API call pattern used previously — see scripts/create-dev-user if present, else curl to `http://127.0.0.1:54321/auth/v1/admin/users` with local service_role key) and run `npm run seed -- --user mag@saf.com`.
- [ ] **Step 4:** `npm test`, `npx next build`, `npm run mcp:smoke`, `npm run oauth:smoke`, `npx playwright test` — all green (update Playwright selectors for Library nav).
- [ ] **Step 5: Commit** `feat: swap in v2 migration baseline; full local suite green`

### Task 12: Nuke + cloud rollout + prod verification

**Files:** none created; operations + `.superpowers/sdd/progress.md` entry; memory file update happens post-merge by the orchestrator.

- [ ] **Step 1:** `npx supabase db reset --linked` (DESTROYS cloud data/users/history — the point). Confirm prompt with `--yes` if offered; this is the explicitly-approved nuke.
- [ ] **Step 2:** Recreate Vault secrets on cloud (values from `.superpowers/cloud-keys.json` sb_secret + project URL):
```sql
select vault.create_secret('https://wbgxabdllukiofokqczc.supabase.co/functions/v1', 'edge_url');
select vault.create_secret('<sb_secret_... from cloud-keys.json>', 'service_role_key');
```
via `docker exec supabase_db_farsi-progress-tracker psql "postgresql://postgres.wbgxabdllukiofokqczc:<SUPABASE_DB_PASSWORD from .env.local>@aws-0-us-east-2.pooler.supabase.com:5432/postgres"`.
- [ ] **Step 3:** `npx supabase functions deploy daily-reminder weekly-digest`; `npx supabase config push`.
- [ ] **Step 4:** `npx vercel --prod`; verify: `/login` 200; `/.well-known/oauth-authorization-server` issuer correct; `POST /oauth/register` 201; `/api/mcp` 401 with WWW-Authenticate.
- [ ] **Step 5:** Report to user: sign in fresh at prod (magic link), then either seed via `npm run seed -- --user mgrogan01@gmail.com --prod` (if script supports prod flag; else import via UI/tutor), reconnect claude.ai connector (DCR re-registers), re-create any personal tokens. Append OUTCOME entry to `.superpowers/sdd/progress.md`.
- [ ] **Step 6: Commit** progress ledger `chore: curriculum engine cycle complete`

## Self-Review Notes

- Spec coverage: languages table (T1), curriculums+provenance (T1), normalize trigger (T1), RLS/grants (T2), queue active-scoping (T2/T3), definer tenant checks (T3), registry+drills (T4), package v2+upconverter (T5), TermText/ScriptKeyboard/fonts/scale (T6), capability degradation (T7), Library+import move (T8), MCP v2 (T9), prompts/edge/seed (T10), swap+suites (T11), nuke+rollout+vault (T12). Marketplace UI: correctly absent (non-goal). Onboarding: cycle 2.
- Type consistency: `morphology Record<string,string>` everywhere; queue return shape (T2) matches ReviewSession consumption (T7) and `_for` (T3); `deriveVocabScript` renamed once (T5) and consumed in T9.
- Known intentional break: MCP add_vocab drops stem params (tools are self-describing; clean break sanctioned by user).
