# Onboarding Wizard + AI-Tutor Skill — Design

Date: 2026-08-13
Status: approved (conversation), cycle 2 (builds on the curriculum/language engine)

## Goal

A first-run **setup wizard** that walks a new user from zero to a working
AI-tutor loop: pick a language → install a tutor skill into their AI tool →
connect that tool to the app via MCP → have the tutor generate and import
their first curriculum. The LLM authors all content **directly through the
MCP** — the user never copy/pastes content JSON except in explicitly
"advanced/debugging" workflows.

## Product principle (user-stated)

> The LLM should be authoring all of the content directly through the MCP.
> The user should never have to copy/paste except for more advanced/debugging
> workflows.

Consequences: import UI is demoted everywhere; every empty state routes to
the wizard, not the import screen; generator prompts instruct the tutor to
call `import_content_package` itself; the skill file forbids handing the
user JSON when tools are available.

## Decisions (from brainstorming)

1. **Live progress detection**: the wizard polls real state — step 3 flips to
   done when an API/OAuth token exists; step 4 when a curriculum exists.
2. **Entry**: auto-redirect to `/welcome` after login when the user has no
   curriculum AND `profiles.onboarded_at` is null. Skippable at every step;
   "Setup guide" nav link remains until completed, then lives in Settings.
3. **Claude-first, ChatGPT best-effort**: Claude Desktop/claude.ai paths are
   fully built and verifiable; the ChatGPT tab ships the same tutor content
   as custom-GPT instructions plus connector steps, clearly marked untested.
4. **Import demoted**, not removed (see principle above).

## The wizard — `/welcome`

Four steps with a progress rail; each step is its own client component under
`src/app/welcome/`. State that must survive reloads lives in the DB or is
re-derived (polling); the language choice is client state passed between
steps (the curriculum import is what durably fixes a language).

### Step 1 — Choose your language
- Cards from the `languages` table (native_name in script font via the
  language's rtl/font config). Farsi enabled; one disabled "More languages
  coming" placeholder card.
- Selection parameterizes steps 2–4 (skill text, prompts, sample text) via
  `getLanguage(code)` + the languages row. No DB write.

### Step 2 — Install your tutor skill
- Tabs: **Claude** | **ChatGPT** (choice remembered in client state only).
- Claude tab: a generated `SKILL.md` (Agent Skills format: `name`,
  `description` frontmatter + body) with Download and Copy buttons, plus
  import instructions for Claude Desktop (skills directory / capabilities
  settings) and claude.ai (upload in Settings → Capabilities).
- ChatGPT tab: the same tutor content reformatted as custom-GPT
  "Instructions" text (no frontmatter), plus their connector setup steps,
  with a visible "untested — tell us what breaks" caveat.
- Content comes from a **pure generator** `src/lib/tutor-skill.ts`:
  `buildTutorSkill({ languageCode, languageName, siteUrl, flavor: "claude-skill" | "gpt-instructions" })`.
  The body teaches the tutor:
  - Role: a <language> tutor working against this app's MCP tools.
  - Session flow: start with `get_study_state`; run reviews via
    `get_review_queue` → quiz → `grade_card` per card (0–5, direction);
    log free practice with `log_practice_session`; mark lessons with
    `complete_lesson` (+ skill ratings).
  - Authoring rules: content-package v2 shape; `term` PLAIN (identity key),
    diacritics only in `term_vocalized`; verbs carry
    `morphology.present_stem/past_stem`; exercises `to_target`/`from_target`/
    `cloze`/`scramble`; presence-aware updates; language rules (fa: ZWNJ,
    Persian codepoints, Persian digits) included only for fa.
  - **Tool-first mandate**: author content by calling
    `import_content_package` / `add_vocab` directly; never hand the user
    JSON to paste unless tools are unavailable — then, and only then,
    output raw JSON and point them at Library → Advanced → Manual import.

### Step 3 — Connect your AI to the app
- Claude: paste `<siteUrl>/api/mcp` into Settings → Connectors → Add custom
  connector (no client id/secret — DCR), then the login + consent flow.
- ChatGPT: best-effort connector instructions (same caveat label).
- **Live detection**: poll `GET /welcome/status` (below) every ~4s; when
  `hasToken` flips true show "✓ Connected — token '<name>' created" and
  mark the step complete.

### Step 4 — Generate your first curriculum
- Primary (only visible path): a sample prompt via the existing
  `buildCreateCoursePrompt()` reworked for connected tutors — it ends with
  "import the package using your farsi-tracker tools" instead of "output
  only the JSON object". Copy button + guidance text: tell your tutor your
  pace, interests, and script-vs-transliteration preference first; it can
  regenerate/extend later.
- "Advanced: manual import" `<details>` at the bottom links to
  `/curriculums/import` and explains when you'd use it.
- **Live detection**: same status poll; when `curriculumCount > 0` show
  "✓ '<name>' imported — Start learning →" (link `/lessons`) and stamp
  completion.

### Completion + skip semantics
- Completing step 4's detection, clicking "Finish", or clicking Skip all set
  `profiles.onboarded_at = now()` (server action). Null `onboarded_at` +
  zero curriculums = auto-redirect; anything else = no redirect.
- Nav: while `onboarded_at` is null show "Setup guide" as a nav item;
  afterwards a "Setup guide" link appears in Settings instead (route stays
  accessible always; revisiting does not clear the stamp).

## Import demotion sweep

- Library `/curriculums`: primary CTA (empty and non-empty states) becomes
  "Set up your AI tutor →" (`/welcome`); the Import button moves into an
  "Advanced" disclosure (with the export links).
- All content-page empty states (dashboard, lessons, review, flashcards,
  vocab, prompts) point to `/welcome`, not the import screen.
- `/prompts` reframes as "ask your connected tutor" — every generator prompt
  builder gains a `connected: boolean` parameter: connected=true (page
  default) ends prompts with the import-via-tools instruction; the manual
  "output ONLY the JSON object" closing remains only inside a fallback note
  ("if your AI tool can't use MCP tools").
- `/curriculums/import` itself is unchanged and fully functional.

## Plumbing

- **Migration 20260813100007**: `alter table profiles add column onboarded_at timestamptz;`
  (nullable; no backfill — the nuke means all users are new).
- **Status endpoint**: route handler `src/app/welcome/status/route.ts` (auth
  required, RLS-scoped queries): returns
  `{ hasToken: boolean, tokenName: string | null, curriculumCount: number, firstCurriculumName: string | null }`.
  api_tokens is RLS-readable by the owner; curriculums likewise. Poll from
  client with plain `fetch` + `setInterval`, cleared on unmount/completion.
- **Server action** `completeOnboarding()` in `src/app/welcome/actions.ts`
  (sets the stamp; used by Finish, Skip, and step-4 auto-detection).
- **Redirect logic**: in the dashboard page (`src/app/page.tsx`) — if
  `onboarded_at` is null and curriculum count is 0, `redirect("/welcome")`.
  (Not in middleware: keeps middleware auth-only and cheap.)
- Skill generator is pure and fully unit-tested; no network/DB.

## Error handling

- Status poll failures: silent retry (no error UI; the wizard is instructions
  first, detection is progressive enhancement).
- `/welcome` with no session → standard middleware login redirect (carries
  ?next=/welcome).
- Download uses a client-side Blob (no server route needed); filename
  `farsi-tutor-skill.md` (language-parameterized: `<code>-tutor-skill.md`).

## Testing

- vitest: `tutor-skill.test.ts` — frontmatter well-formed (claude-skill
  flavor only), all 11 tool names present, tool-first mandate string
  present, fa language-rules included for fa and absent for a fake code,
  siteUrl interpolated, gpt flavor has no frontmatter; prompt-builder tests
  updated for the `connected` parameter (both closings).
- vitest: wizard step components (render, tab switch, copy-button payloads,
  step-4 advanced disclosure present but collapsed).
- vitest: status-route logic extracted pure where practical; otherwise the
  action/route stays thin over RLS queries.
- Playwright: new-user flow — login with fresh user → auto-redirect to
  /welcome → skip → Library shows tutor CTA; revisit /welcome works.
- Manual (controller): live claude.ai end-to-end — install skill, connect
  connector, generate + import curriculum via tutor (this is the real
  acceptance test; scripted where possible, documented where not).

## Non-goals

- No ChatGPT verification (explicitly best-effort this cycle).
- No per-user customization of the skill file beyond language + site URL.
- No removal of import/export; no marketplace surfaces.
- No email/onboarding-drip changes.
