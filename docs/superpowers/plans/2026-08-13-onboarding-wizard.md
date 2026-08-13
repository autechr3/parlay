# Onboarding Wizard + Tutor Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A four-step live-detection setup wizard (/welcome) that installs an MCP-aware tutor skill into the user's AI tool, connects it, and has the tutor generate + import the first curriculum — while demoting copy/paste import to an advanced workflow everywhere.

**Architecture:** One nullable `profiles.onboarded_at` column drives auto-redirect; a pure `buildTutorSkill` generator emits Claude-skill/GPT-instruction flavors; wizard steps are client components polling a thin RLS-scoped status route; prompt builders gain a `connected` flag; a sweep re-points every empty state at /welcome.

**Tech Stack:** Next.js 16 App Router, Supabase, zod v4, vitest + testing-library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-13-onboarding-wizard-design.md` (read first).

## Global Constraints

- Product rule: the LLM authors content through MCP; copy/paste appears ONLY under "Advanced"/fallback labels.
- Persian text renders with dir/lang via TermText or explicit attrs + `font-script`; ZWNJ preserved in all skill/prompt fixtures.
- Supabase is source of truth: wizard completion = `profiles.onboarded_at` (no localStorage state that matters).
- vitest can't resolve `@/` — modules under test import relatively.
- Gate every task: `npm test` green, `npx tsc --noEmit` zero, `npx next build` clean (the codebase starts fully clean this cycle).
- The 11 MCP tool names (verbatim, used in skill/tests): get_study_state, get_lesson, get_due_vocab, get_struggling_vocab, search_vocab, log_practice_session, complete_lesson, add_vocab, import_content_package, get_review_queue, grade_card.
- Site URL comes from `NEXT_PUBLIC_SITE_URL` (prod `https://farsi-progress-tracker.vercel.app`); never hardcode it in generated content — always interpolate.
- Commit trailer as used throughout this repo (Co-Authored-By + Claude-Session lines).

---

### Task 1: Migration + status route + completion action

**Files:**
- Create: `supabase/migrations/20260813100007_onboarding.sql`
- Create: `src/app/welcome/status/route.ts`, `src/app/welcome/actions.ts`
- Test: extend `supabase/tests/001_schema.sql` (plan 16→17: `has_column('profiles','onboarded_at')`); `tests/welcome-status.test.ts`

**Interfaces:**
- Produces: `GET /welcome/status` (auth required) → `{ hasToken: boolean, tokenName: string | null, curriculumCount: number, firstCurriculumName: string | null }`; server action `completeOnboarding(): Promise<void>` stamping `onboarded_at = now()` for the session user (idempotent — only when currently null: `.is("onboarded_at", null)`), then `revalidatePath("/")`.

- [ ] **Step 1:** Migration: `alter table profiles add column onboarded_at timestamptz;` (comment: null = show setup wizard; set on finish OR skip). pgTAP column check added, plan count bumped.
- [ ] **Step 2:** `npx supabase migration up` on the running local stack; `npx supabase test db` green (17/17 on 001 + rest unchanged).
- [ ] **Step 3:** Status route: create RLS-scoped server client (same helper the pages use — `createClient` from `@/lib/supabase/server`); unauthenticated → 401 JSON. Queries: `api_tokens.select("name").order("created_at",{ascending:false}).limit(1)` and `curriculums.select("name", {count:"exact"}).order("created_at",{ascending:true}).limit(1)`. Extract the response-shaping into pure `buildStatus(tokenRows, curriculumRows, count)` exported from the route file's sibling `src/app/welcome/status/build.ts`; vitest it (empty→falsy/nulls/0; rows→name mapping).
- [ ] **Step 4:** RED→GREEN on `tests/welcome-status.test.ts`; `npm test`, `tsc`, `next build` clean.
- [ ] **Step 5: Commit** `feat: onboarding stamp, status endpoint, completion action`

### Task 2: Tutor-skill generator (pure)

**Files:**
- Create: `src/lib/tutor-skill.ts`
- Test: `tests/tutor-skill.test.ts`

**Interfaces:**
- Produces:

```ts
export type TutorSkillParams = {
  languageCode: string; languageName: string;   // e.g. "fa", "Persian"
  siteUrl: string;                               // no trailing slash
  flavor: "claude-skill" | "gpt-instructions";
};
export function buildTutorSkill(p: TutorSkillParams): string;
export function tutorSkillFilename(languageCode: string): string; // `${code}-tutor-skill.md`
```

- Claude flavor starts with exactly:

```markdown
---
name: <languageName-lowercase>-tutor
description: <languageName> language tutor connected to the learner's Farsi Progress Tracker app — tracks lessons, SRS vocabulary review, and authors curriculum content directly via MCP tools.
---
```

  (gpt flavor: NO frontmatter; opens with `You are a <languageName> language tutor...`.)
- Body sections (both flavors, exact headings): `# Role`, `# Session start`, `# Running reviews`, `# Teaching lessons`, `# Authoring content (tool-first)`, `# Content rules`, `# When tools are unavailable`. Body text requirements:
  - Session start: call `get_study_state` first every session; mention streak, due count, next lesson.
  - Reviews: `get_review_queue` → quiz one card at a time → `grade_card` (grade 0-5, honest grading rubric: 5 instant, 4 slight hesitation, 3 hard recall, 2 wrong-but-recognized, 0-1 blackout; direction as presented) → never batch-grade unasked.
  - Lessons: `get_lesson` (include_body true when teaching), `complete_lesson` with skill ratings after; `log_practice_session` for free conversation/quizzes with errors[] observed.
  - Authoring (tool-first): create/extend curricula by calling `import_content_package` yourself; add single words with `add_vocab`; NEVER hand the user JSON to paste when tools are available; after importing, confirm what changed (lessons/vocab counts from the tool result).
  - Content rules: content-package v2; `term` PLAIN (upsert identity — diacritics would orphan SRS history), diacritics only in `term_vocalized`; verbs include `morphology.present_stem`/`past_stem`; exercise types to_target/from_target/cloze/scramble; presence-aware updates (omit what you don't want to change; exercises key replaces per-lesson).
  - Language rules included ONLY when languageCode === "fa" (ZWNJ U+200C requirement with می‌روم example, Persian codepoints ی/ک, Persian digits ۰-۹) — reuse/align with `buildLanguageRules` in `src/lib/agent-prompts.ts` (import it rather than duplicating if export shape allows; otherwise export it from agent-prompts.ts first).
  - Tools-unavailable fallback: output raw JSON v2 package and direct the user to Library → Advanced → Manual import at `<siteUrl>/curriculums/import`.
  - `<siteUrl>/api/mcp` appears in a `# Connection` line so the skill is self-documenting.
- [ ] **Step 1:** RED tests: frontmatter present+well-formed only for claude flavor; all 11 tool names present (loop over the Global Constraints list); "never hand the user JSON" mandate present; fa rules present for fa, absent for languageCode "es"; siteUrl interpolated (no hardcoded vercel URL when passed localhost); filename fn.
- [ ] **Step 2:** RED run → **Step 3:** implement → **Step 4:** GREEN + full gates → **Step 5: Commit** `feat: mcp-aware tutor skill generator`

### Task 3: Connected-mode prompts + prompts page reframe

**Files:**
- Modify: `src/lib/agent-prompts.ts`, `src/app/prompts/page.tsx`
- Test: `tests/agent-prompts.test.ts`

**Interfaces:**
- Produces: every builder (`buildCreateCoursePrompt`, `buildNextLessonsPrompt`, `buildExercisesPrompt`, `buildAddVocabPrompt`) gains a trailing `connected: boolean = true` param. `connected=true` closing: `Import the result yourself with the import_content_package tool, then confirm to the learner what was imported (curriculum, lessons, vocab counts). Do not show them raw JSON.` `connected=false` closing: the existing `Output ONLY the JSON object, no prose, no markdown fences.` Export `buildLanguageRules` (needed by Task 2 — coordinate: if Task 2 already exported it, keep one export).
- Prompts page: intro copy reframes to "ask your connected tutor"; builders called with `connected=true`; a `<details>` fallback block ("My AI tool can't use MCP tools") shows the same prompts with `connected=false` and links `/curriculums/import`.
- [ ] Steps: update tests first (both closings asserted per builder; default is connected) → RED → implement → GREEN + gates → commit `feat: connected-first generator prompts`.

### Task 4: Wizard steps 1–2 (language, skill install)

**Files:**
- Create: `src/app/welcome/page.tsx` (server: fetch languages + profile + curriculum count; render client wizard), `src/components/wizard/Wizard.tsx` (step rail + state), `src/components/wizard/StepLanguage.tsx`, `src/components/wizard/StepSkill.tsx`
- Test: `tests/wizard-steps.test.tsx`

**Interfaces:**
- Produces: `Wizard({ languages, initialStatus, siteUrl })` — client component owning `step` (1-4) + `languageCode` + `aiTool: "claude" | "chatgpt"` state; renders the step rail (1 Choose language · 2 Install skill · 3 Connect · 4 First curriculum) with done-checks; Steps 3-4 stubs rendered by Task 5 (Wizard accepts `renderStep3/renderStep4` slots? NO — keep single file ownership: Task 5 adds the components into Wizard directly; this task renders placeholder "next" content for 3-4).
- StepLanguage: cards from `languages` rows (native_name with dir/lang/font-script, English name, enabled only for rows present; plus one hardcoded disabled "More languages coming soon" card); selecting sets languageCode and advances.
- StepSkill: tabs Claude/ChatGPT; renders `buildTutorSkill` output in a scrollable `<pre>`, Copy button (navigator.clipboard) and Download button (Blob + anchor download using `tutorSkillFilename`); Claude instructions list (Claude Desktop: Settings → Capabilities → Skills → add file; claude.ai: Settings → Capabilities → upload skill); ChatGPT tab carries the visible untested caveat + custom-GPT Instructions paste steps.
- [ ] Steps: component tests first (language card renders فارسی with dir=rtl lang=fa; disabled placeholder present; skill tab switch swaps flavor — assert frontmatter present/absent; copy button writes clipboard mock; caveat text on chatgpt tab) → RED → implement → GREEN + gates → commit `feat: wizard shell, language and skill steps`.

### Task 5: Wizard steps 3–4, polling, completion, redirect, nav

**Files:**
- Create: `src/components/wizard/StepConnect.tsx`, `src/components/wizard/StepCurriculum.tsx`
- Modify: `src/components/wizard/Wizard.tsx` (wire real steps + polling + finish/skip), `src/app/page.tsx` (redirect), `src/components/Nav.tsx` (Setup guide item while !onboarded), `src/app/settings/page.tsx` (Setup guide link once onboarded)
- Test: `tests/wizard-steps.test.tsx` (extend)

**Interfaces:**
- Consumes: `/welcome/status` shape (Task 1), `completeOnboarding()` (Task 1), `buildCreateCoursePrompt(connected=true)` (Task 3).
- Wizard polls status with `setInterval(4000)` while mounted on steps 3-4, cleared on unmount; passes `initialStatus` from the server page to avoid a blank first paint.
- StepConnect: Claude instructions (connector URL `<siteUrl>/api/mcp` in a copyable code line; leave client id/secret blank; login+consent explanation); ChatGPT best-effort block with caveat; live state: `hasToken ? "✓ Connected — token '<tokenName>' active" : "Waiting for your AI tool to connect…"` with a subtle spinner.
- StepCurriculum: prompt `<pre>` + Copy (buildCreateCoursePrompt(true) with customization guidance paragraph above it); live state: `curriculumCount > 0 ? "✓ '<firstCurriculumName>' imported — Start learning →" (Link /lessons; clicking also fires completeOnboarding)` : waiting text; auto-fires completeOnboarding once when count flips >0; `<details>` "Advanced: manual import" → `/curriculums/import`. Finish + Skip buttons both call completeOnboarding then `router.push("/curriculums")`.
- Dashboard redirect in `src/app/page.tsx`: after existing profile fetch — `if (!profile?.onboarded_at && curriculumCount === 0) redirect("/welcome")` (curriculum count via cheap head count query; place BEFORE the heavier Promise.all).
- Nav: "Setup guide" first item when profile.onboarded_at is null (Nav already fetches or receives user — check how Nav gets data; if it's a server component, fetch profile.onboarded_at there; if client, pass from layout — follow existing pattern).
- [ ] Steps: extend tests (poll flip renders ✓ states — mock fetch/timers with vi.useFakeTimers; completeOnboarding called once on curriculum arrival; skip calls action) → RED → implement → GREEN + gates → commit `feat: live-detection connect and curriculum steps, onboarding redirect`.

### Task 6: Import demotion sweep

**Files:**
- Modify: `src/app/curriculums/page.tsx` (+ `src/components/CurriculumCard.tsx` only if CTA lives there), `src/app/page.tsx`, `src/app/lessons/page.tsx`, `src/app/review/page.tsx`, `src/app/flashcards/page.tsx`, `src/app/vocab/page.tsx`, `src/app/prompts/page.tsx` (empty-state link only — reframe was Task 3)
- Test: `tests/curriculum-actions.test.ts` untouched; assertion updates in any component tests referencing old copy; `e2e/*.spec.ts` selector updates if copy changed

**Interfaces:**
- Library: empty state headline "Set up your AI tutor" → `/welcome` primary button; import + export move under a `<details className="...">Advanced</details>` disclosure (import link `/curriculums/import` retains full function). Non-empty state keeps a small "Setup guide" text link only if onboarded_at is null (optional — skip if plumbing is awkward; the nav link covers it).
- Every listed page's no-active-curriculum empty state: copy becomes `Set up your AI tutor to generate your first curriculum` linking `/welcome` (replacing the `/curriculums`-pointing links from cycle 1).
- [ ] Steps: grep `href="/curriculums"` + `href="/curriculums/import"` in empty states, update each; update any test/e2e copy assertions → suites green + gates → commit `feat: tutor-first empty states, import demoted to advanced`.

### Task 7: Local integration + Playwright

**Files:**
- Create: `e2e/onboarding.spec.ts`
- Modify: existing e2e specs only if copy changes broke them (Task 6 should have caught)

**Interfaces:** none new.
- [ ] **Step 1:** e2e/onboarding.spec.ts (follow existing spec patterns for auth/session): fresh user with no curriculum + null onboarded_at → visiting `/` redirects to `/welcome`; wizard shows step 1 with فارسی card; click through to step 2, assert skill `<pre>` contains `import_content_package`; Skip → lands on `/curriculums` with "Set up your AI tutor" CTA; revisit `/` → NO redirect (stamp set). Seeded user (existing dev user with curriculum) → `/` does not redirect.
- [ ] **Step 2:** Full local proof: `npm test`, `tsc`, `next build`, `npx supabase test db`, `npm run mcp:smoke`, `npm run oauth:smoke`, `npx playwright test` — all green. (Reset local DB first if prior e2e polluted state: `npx supabase db reset` + recreate dev user + `npm run seed -- --user mag@saf.com`, as cycle 1 Task 11 did.)
- [ ] **Step 3: Commit** `test: onboarding e2e; full local suite green`

### Task 8: Deploy + prod verification

**Files:** none (ops).
- [ ] **Step 1:** `npx supabase db push` (applies 100007 to cloud).
- [ ] **Step 2:** `npx vercel --prod` → aliased + READY.
- [ ] **Step 3:** Verify: `GET /welcome` unauthenticated → redirects to login with next=/welcome; `GET /login` 200. (Authenticated wizard flow is the controller/user's live acceptance test — the user signs in fresh post-nuke, so the wizard IS their first-run experience.)
- [ ] **Step 4:** Report walkthrough instructions to the user (their real first-run doubles as acceptance).

## Self-Review Notes

- Spec coverage: migration/status/action (T1), skill generator with tool-first mandate + flavors (T2), connected prompts + prompts reframe (T3), wizard steps 1-2 with fonts/tabs/download (T4), live detection + completion + redirect + nav (T5), demotion sweep incl. Library Advanced disclosure (T6), e2e + full suites (T7), deploy + prod checks (T8). ChatGPT best-effort caveat: T4/T5 copy. Non-goals respected (no ChatGPT verification, no import removal).
- Type consistency: status shape defined once (T1) and consumed in T5; buildTutorSkill params (T2) consumed in T4; connected param (T3) consumed in T5; tutorSkillFilename used by T4 download.
- Coordination note: `buildLanguageRules` export — T2 and T3 both touch agent-prompts.ts exports; T2 lands first and does the export; T3's brief must not re-export.
