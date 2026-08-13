# Curriculums + Language-Agnostic Engine — Design

Date: 2026-08-13
Status: approved (conversation), cycle 1 of 2 (cycle 2 = onboarding + tutor skill)

## Goal

Restructure the tracker around **curriculums** (shareable, marketplace-ready
collections of lessons) and make the engine **language-agnostic** (Farsi becomes
the first configured language rather than a hardcoded assumption). All existing
data — including users — is deliberately destroyed; there are no migration-
compatibility constraints. Optimize for the cleanest possible codebase now.

Explicit user direction: "break whatever you want now."

## Non-goals (this cycle)

- Onboarding flow, tutor skill package, sample curriculum prompts (cycle 2).
- Marketplace UI (browse/clone/public listing). Schema is marketplace-READY
  (visibility + provenance columns), nothing visible ships.
- A second actual language. The engine must make adding one a config+content
  exercise, but only Farsi ships configured.
- Renaming the product/repo/domain. The site remains "Farsi Tracker" outwardly;
  only the engine generalizes.

## Decisions (from brainstorming)

1. **Sequencing**: restructure first, onboarding second — the nuke makes schema
   surgery free and cycle 2's skill/prompts get written once against the final
   model.
2. **Language depth**: generic engine + per-language config. Farsi keyboard and
   conjugation ship as Farsi-only extras behind a registry interface.
3. **Curriculum model**: curriculum owns lessons 1:N; sharing is copy-based
   (packages / future cloning), never by-reference. No lesson M2M.
4. **Marketplace**: model-ready only.
5. **Migrations**: full squash to a clean baseline; cloud DB reset (data AND
   migration history). Hardened SQL blocks (RLS, grants, definer functions,
   local_today, SM-2) are copied semantically intact under new names.

## Data model (new baseline)

### languages (new; data facts only — behavior lives in the TS registry)
- `code text pk` ("fa"), `name text` ("Persian"), `native_name text` ("فارسی"),
  `rtl boolean`, `has_diacritics boolean`, `script_font text` (key the frontend
  maps to a bundled font). Readable by all authenticated users; writable by
  no one (service_role only). Seeded: `fa` (rtl, diacritics, font "estedad").

### curriculums (replaces courses)
- `id, owner_id -> profiles, language_code -> languages, name, description,
  visibility text not null default 'private' check (visibility in
  ('private','public')), cloned_from uuid null references curriculums(id) on
  delete set null, created_at`.
- Unique `(owner_id, name)` (import upsert key, as courses had).
- RLS: owner-only for all verbs (public reads are a future cycle; the column
  exists, the policy does not).

### units / lessons
- Same shapes as today with `curriculum_id` FKs. Lessons keep number, slug,
  title, grammar_points, estimated_minutes, is_review, is_assessment, body_md,
  new_vocab_count; unique `(curriculum_id, number)` and `(curriculum_id, slug)`.

### vocab_items (generalized)
- `farsi` → `term`, `farsi_vocalized` → `term_vocalized`,
  `english` → `translation`, `farsi_normalized` → `term_normalized`.
- `present_stem`/`past_stem` fold into `morphology jsonb null` — for Farsi
  verbs: `{"present_stem": "رو", "past_stem": "رفت"}`. Each language's drill
  provider defines and interprets its own morphology shape.
- `colloquial`, `part_of_speech`, `tags`, `notes` unchanged.
- Upsert identity: `(curriculum_id, lesson_id, term)`; term stays plain
  (diacritics live in term_vocalized only; deriveVocabScript rule carries over).
- `term_normalized` maintained by trigger: `normalize_term(lang_code, term)`
  SQL function dispatching on the owning curriculum's language — `fa` case is
  the current `fa_normalize` body verbatim; default case is
  `lower(btrim(regexp_replace(term, '\s+', ' ', 'g')))`.

### Unchanged shapes (renamed references only)
- profiles (+ `fa_scale` → `script_scale`, keeps `show_diacritics`,
  `active_course_id` → `active_curriculum_id`), vocab_reviews, review_log,
  study_days, lesson_completions, skill_ratings-in-completions, api_tokens,
  oauth_clients, oauth_codes.
- SQL functions re-authored with new column names, identical semantics and
  security posture: `grade_card`, `get_review_queue`, `local_today`,
  `current_streak`, `bump_study_day`, `next_lesson_for`,
  `users_due_daily_email`, weekly digest support, and the `_for` definer
  variants with their explicit tenant-scoping predicates and
  revoke-from-PUBLIC/grant-to-service_role pattern.
- pg_cron jobs + Vault secret reads unchanged.

### Review-queue scoping change
`get_review_queue` (and `_for`) scope to the caller's **active curriculum**
only, not all owned curriculums — mixing languages in one SRS session is
wrong. Same for flashcards/vocab/progress surfaces.

## Content package v2

- `format: "farsi-tracker/content-package"` (unchanged literal — it is an app
  identifier, not a language claim), `version: 2`.
- `curriculum: { name, language, description? }` block replaces `course`.
  `language` must exist in `languages` at import.
- Vocab fields: `term`, `term_vocalized?`, `transliteration`, `translation`,
  `part_of_speech?`, `morphology?`, `colloquial?`, `tags?`, `notes?`.
- Exercise types: `to_target`, `from_target`, `cloze`, `scramble`.
- **v1 upconverter**: v1 packages parse and are mapped field-for-field
  (farsi→term, english→translation, farsi_vocalized→term_vocalized,
  present/past_stem→morphology, en_to_fa→to_target, fa_to_en→from_target,
  course→curriculum with language "fa"). Old tutor output keeps importing.
- Import stays presence-aware (absent ≠ reset) exactly as today.

## Language registry (TypeScript)

`src/lib/languages/` — one module per language + an index:

```ts
type LanguageModule = {
  code: string;                       // matches languages.code
  normalize: (s: string) => string;   // MUST mirror SQL normalize_term branch
  keyboardLayout?: string[][];        // on-screen keyboard; absent = no keyboard UI
  drills?: DrillProvider;             // conjugation decks etc.; absent = no drill deck
  sampleText: string;                 // settings preview line
};
```

- `fa.ts` absorbs today's `farsi.ts`: faNormalize, stripFaDiacritics (exposed
  generically as the diacritics helper), keyboard layout, PRONOUNS +
  conjugatePresent/Past + glide rules as the drill provider building
  conjugation flashcards and practice drills.
- Generic helpers (levenshtein, checkTypedAnswer, digits) move to
  `src/lib/text.ts`; checkTypedAnswer normalizes via the language module.
- UI: `FarsiText` → `TermText` (tri-state cycle unchanged) taking rtl/lang/font
  from the active curriculum's language; `FaKeyboard` → `ScriptKeyboard`
  rendering from `keyboardLayout`; `.font-fa` → `.font-script`; the
  `--fa-scale` var → `--script-scale` (slider + profile column renamed to
  `script_scale`); `show_diacritics` applies only when
  `languages.has_diacritics`.
- Fonts: registry maps `script_font` keys to next/font instances (Estedad for
  fa). Languages without a bundled font fall back to the site font stack.
- Capability degradation: no keyboardLayout → keyboard button absent; no
  drills → conjugation deck/radio absent from flashcards and practice.

## Site organization

- New **Library** page `/curriculums`: cards (name, language badge, lesson
  count, completion %), actions: set active, import package (moves /import
  here; old route redirects), export, delete. Creating = importing a package
  (no bespoke curriculum-builder UI this cycle).
- Nav: Library, Lessons, Review, Flashcards, Vocab, Progress, Prompts,
  Settings. All content surfaces read the active curriculum; empty states
  point at Library.
- `/prompts` SCHEMA_DOC rewrites to v2, parameterized by the active
  curriculum's language name (prompts say "Persian" because the curriculum is
  Farsi, not because it is hardcoded).

## MCP surface

- Same 11 tools; JSON fields renamed to term/translation/morphology;
  `add_vocab` accepts `morphology`; `import_content_package` accepts v1 or v2.
- get_study_state includes curriculum name + language.
- Tenant-scoping patterns in `src/lib/mcp/data.ts` and the `_for` SQL variants
  are preserved exactly (ownership predicates, active-curriculum verification).

## The nuke + rollout

1. Local: Docker Desktop up → author new baseline migrations
   (~6 files: extensions, languages+schema, rls+grants, functions,
   cron+email, tokens+oauth) → `supabase db reset` → pgTAP green.
2. Edge functions: field renames inside daily-reminder/weekly-digest; redeploy.
3. Cloud: `supabase db reset --linked` (wipes data + history; also wipes
   auth.users and Vault) → push baseline → re-create Vault secrets
   (`edge_url`, `service_role_key` with the sb_secret key) → redeploy edge
   functions → `supabase config push`.
4. Vercel: deploy app.
5. Post-nuke reality: user signs in fresh (magic link, mgrogan01@gmail.com);
   claude.ai connector re-registers via DCR on next connect; personal API
   tokens must be re-created; curriculum re-imported (seed script emits a v2
   Farsi curriculum via `--user`).

## Error handling

- Import of a package whose `language` is not configured → clear error naming
  the supported codes (currently `fa`).
- v1 packages: silently upconverted (log line in import result), never
  rejected for being v1.
- Curriculum delete: confirm dialog naming the lesson/vocab counts; cascades
  in DB.
- No-active-curriculum states: every scoped page renders a Library pointer,
  MCP tools return the existing "no active curriculum — import one first"
  error (message updated from "course").

## Testing

- **pgTAP** (rewritten): schema/has_column checks, RLS deny-anon and
  two-tenant isolation (including the definer `_for` variants), grade_card
  SM-2 math, queue limits + active-curriculum scoping, normalize_term fa/default
  branches, languages table read-only posture.
- **vitest**: fa module (normalizer mirror test against SQL fixtures,
  conjugation suite carried over, keyboard layout shape), text helpers,
  v1→v2 upconverter (field-for-field fixture), package v2 schema,
  deriveVocabScript against term fields, TermText/ScriptKeyboard/FlashcardDeck
  component tests, registry capability degradation (no-drill language hides
  conjugation deck).
- **Smoke**: mcp-smoke + oauth-smoke updated to new fields; Playwright core
  flows (login → library → import → lesson → review).
- **Prod verification**: discovery docs, register 201, MCP 11 tools listing,
  reminder email send after re-seed.

## Risks

- Squash drift: mitigated by copying hardened SQL blocks and the pgTAP
  two-tenant suite; the grant/revoke pattern (revoke PUBLIC strips
  service_role too — re-grant explicitly) is a known trap to carry over.
- Rename fallout in TS is compile-checked; `npx next build` gates every task.
- Cloud reset destroys Vault secrets — step 3 explicitly re-creates them
  (past incident: legacy JWT vs sb_secret key).
