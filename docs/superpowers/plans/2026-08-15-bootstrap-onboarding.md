# One-Paste Bootstrap Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One copy/paste onboarding — a bootstrap prompt delegates platform setup to the AI, and a new `get_tutor_instructions` MCP tool serves the tutor persona + first-curriculum guidance after connection.

**Architecture:** Two new pure builders (`buildBootstrapPrompt`, `buildFirstCurriculumGuidance`) join the existing `buildTutorSkill`; MCP gains tool #12 wrapping them with a `languages`-table lookup; the wizard collapses 4→3 steps with the old manual content under a details disclosure.

**Tech Stack:** Next.js 16, Supabase, zod v4, vitest, Playwright, mcp-handler 2.1.0.

**Spec:** `docs/superpowers/specs/2026-08-15-bootstrap-onboarding-design.md` (read first).

## Global Constraints

- Product rule: LLM authors content via MCP; copy/paste only under Advanced/fallback labels. The bootstrap prompt is THE one sanctioned paste.
- Bootstrap prompt: ≤ ~25 lines, imperative, no JSON, no schema content; must name `get_study_state` and `get_tutor_instructions`; must cover claude.ai/Desktop, Claude Code (`claude mcp add --transport http farsi-tracker <siteUrl>/api/mcp`), and ChatGPT (best-effort) connect paths; siteUrl always interpolated (never hardcoded).
- Tool count becomes 12; tool names never renamed.
- Wizard completion/skip/redirect semantics unchanged; status polling unchanged.
- vitest relative imports; gates every task: `npm test` green, `npx tsc --noEmit` zero, `npx next build` clean.
- Commit trailer as used throughout this repo.

---

### Task 1: Bootstrap + first-curriculum builders (pure)

**Files:**
- Modify: `src/lib/tutor-skill.ts` (add both builders; wire guidance into buildTutorSkill output? NO — guidance is appended by the MCP tool, not baked into the skill file; keep buildTutorSkill unchanged)
- Test: `tests/tutor-skill.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
export function buildBootstrapPrompt(p: { languageCode: string; languageName: string; siteUrl: string }): string;
export function buildFirstCurriculumGuidance(languageName: string): string;
```

- Bootstrap content contract (spec §Bootstrap prompt): numbered flow — identify your app; if farsi-tracker tools absent give the user YOUR app's connect path (three platforms, exact strings above; claude.ai path: Settings → Connectors → Add custom connector → `<siteUrl>/api/mcp`, no client id/secret) and wait for confirmation; verify with `get_study_state`; call `get_tutor_instructions` with language `<languageCode>` and follow it from then on.
- Guidance content contract: "If the learner has no curriculum yet:" interview briefly (pace, weekly time, interests, script-vs-transliteration), generate a starter curriculum, import via `import_content_package` yourself, confirm what was imported (curriculum/lesson/vocab counts), suggest starting lesson 1. Never show raw JSON.
- [ ] **Step 1 (RED):** tests — bootstrap: contains all three platform paths (`Settings → Connectors`, `claude mcp add --transport http farsi-tracker`, `ChatGPT`), contains `<siteUrl>/api/mcp` with a localhost siteUrl passed (and NOT the prod URL), names both tools, line count ≤ 30, contains no `{` or `}`; guidance: contains `import_content_package`, the interview topics, "no curriculum yet" conditional phrasing, and no "Output ONLY the JSON" text.
- [ ] **Step 2:** run RED → **Step 3:** implement → **Step 4:** GREEN + gates → **Step 5: Commit** `feat: bootstrap prompt and first-curriculum guidance builders`

### Task 2: MCP tool get_tutor_instructions

**Files:**
- Modify: `src/lib/mcp/data.ts` (new `getTutorInstructions(userId, language)`), `src/app/api/mcp/route.ts` (register tool 12), `scripts/mcp-smoke.ts`, `tests/mcp-data.test.ts` (pure parts if extracted)

**Interfaces:**
- Consumes: `buildTutorSkill` (gpt-instructions flavor), `buildFirstCurriculumGuidance` (Task 1).
- Produces: data-layer fn — validate `language` against `languages` table via admin client (`select code, name from languages`); unknown → throw `` `unsupported language "${language}" — supported: ${codes.join(", ")}` `` (same shape as import); return `buildTutorSkill({languageCode, languageName: row.name, siteUrl: SITE, flavor: "gpt-instructions"}) + "\n" + buildFirstCurriculumGuidance(row.name)`. siteUrl from `process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"` (route already has SITE const — pass it in or read env in data.ts consistently with existing code; follow route's existing pattern).
- Tool registration: name `get_tutor_instructions`; description: `Call this before tutoring: returns the tutoring workflow, content-authoring rules, and first-session guidance for this learner's target language. New connections should call this first.`; inputSchema `z.object({ language: z.string().min(1).default("fa") })`; handler → toolResult(() => getTutorInstructions(userId, language)).
- mcp-smoke: expected tool count 11→12; new assertion: call get_tutor_instructions (default language) and assert the text contains `import_content_package` AND `ZWNJ` (fa rules present) AND `no curriculum yet`.
- [ ] Steps: extend tests (language-validation logic — if kept inline in data.ts, cover via the smoke; extract the code/name resolution into a testable pure helper ONLY if it exceeds ~10 lines — else rely on smoke) → implement → gates (npm test/tsc/build; do NOT run smoke here — Task 4 runs the stack suites) → commit `feat: get_tutor_instructions mcp tool`.

### Task 3: Wizard restructure 4→3 steps

**Files:**
- Modify: `src/components/wizard/Wizard.tsx`, `src/components/wizard/StepConnect.tsx` (becomes Connect-your-AI with bootstrap prompt + manual details), `src/components/wizard/StepCurriculum.tsx` (drop the prompt block; waiting copy explains tutor interviews then imports), delete `src/components/wizard/StepSkill.tsx`? NO — MOVE its content: StepSkill's tabs/download render INSIDE StepConnect's "Set up manually instead" `<details>` (keep the component, imported by StepConnect; remove it from the step rail)
- Test: `tests/wizard-steps.test.tsx` (update)

**Interfaces:**
- Consumes: `buildBootstrapPrompt` (Task 1).
- Wizard: steps 1-3; rail labels `1 Choose language · 2 Connect your AI · 3 First curriculum`; polling active on steps 2-3 now (was 3-4) — SAME lifecycle semantics, update the step numbers and their tests; completion guard/skip/finish unchanged.
- StepConnect (step 2): headline "Copy one prompt into your AI — it does the rest."; bootstrap prompt in `<pre>` + Copy button (prompt from buildBootstrapPrompt with step-1 language + siteUrl prop); connector URL copyable line beneath; live ✓ strip unchanged; `<details>` "Set up manually instead" containing: the StepSkill tabs (Claude/ChatGPT skill download/copy + install instructions) AND the per-tool connector instruction lists that used to be StepConnect's body.
- StepCurriculum (step 3): remove prompt `<pre>`/copy; waiting copy: "Your tutor will interview you about pace and interests, then generate and import your starter curriculum — leave this page open to see it arrive."; keep ✓/Start learning/advanced-import details/Finish.
- [ ] Steps: update tests FIRST (rail shows 3 labels; step 2 renders bootstrap prompt containing `get_tutor_instructions` and copy works; manual details contains skill-tab content (assert a known StepSkill string present but collapsed); step 3 has NO `<pre>`; polling tests renumbered — keep every lifecycle case incl. fetch-count cleanup + guard retry) → RED → implement → GREEN + gates → commit `feat: three-step wizard with one-paste bootstrap`.

### Task 4: e2e + full local suites

**Files:**
- Modify: `e2e/onboarding.spec.ts`
- [ ] **Step 1:** update spec: step-1 فارسی card → advance → step-2 heading "Connect your AI", bootstrap `<pre>` contains `get_tutor_instructions`, manual `<details>` present; Skip flow + no-redirect cases unchanged.
- [ ] **Step 2:** full local proof IN ORDER: `npx supabase db reset` → `npx supabase test db` (all green on empty DB) → recreate dev user → `npm run seed -- --user mag@saf.com` → `npm test` / `tsc` / `next build` / `npm run mcp:smoke` (12 tools + new assertions) / `npm run oauth:smoke` / `npx playwright test` (all green; run playwright twice for idempotency).
- [ ] **Step 3: Commit** `test: one-paste onboarding e2e; full local suite green`

### Task 5: Deploy + prod verification

**Files:** none (ops). No new migration this cycle.
- [ ] **Step 1:** `npx vercel --prod` → aliased + READY.
- [ ] **Step 2:** Verify: `/welcome` unauth → login redirect; authenticated MCP surface lists 12 tools — verify via `POST /api/mcp` tools/list with a token IF one exists, else assert the 401-with-WWW-Authenticate shape and rely on Task 4's smoke (note which was possible).
- [ ] **Step 3:** Report walkthrough to the user (their next tutor session should start by calling get_tutor_instructions).

## Self-Review Notes

- Spec coverage: builders (T1), tool 12 + discoverable description + smoke (T2), 3-step wizard + manual preservation + polling renumber (T3), e2e + suites (T4), deploy (T5). Non-goals respected (no /prompts change, no skill-generator content change, no prompts-primitive).
- Type consistency: builder signatures defined in T1 consumed in T2/T3; SITE pattern follows route's existing const.
- Note: no DB migration — Task 4's db reset is for clean pgTAP only.
