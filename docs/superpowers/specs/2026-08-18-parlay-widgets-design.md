# Parlay: in-chat exercise widgets — design

**Date:** 2026-08-18
**Status:** approved direction, spec for sub-project 1 of the Parlay roadmap
**Predecessor state:** farsi-progress-tracker @ main 2af63d0 (one-paste bootstrap onboarding shipped)

## 1. Vision and roadmap context

The product becomes **Parlay**: a general language-learning companion (Farsi first) where the user's own AI subscription — claude.ai, ChatGPT, or any MCP-capable host — is the tutor, and Parlay supplies the memory (SRS, progress, curriculum) and the interactive surfaces. Guiding principle: **meet the user where they are**; never require an API key or a second subscription.

Roadmap decided during brainstorming (each sub-project gets its own spec → plan → build cycle):

1. **This spec — Parlay widgets:** rename/rebrand, plus interactive exercises rendered *inside* the AI chat via the MCP Apps open standard. The lesson experience stops being "AI asks questions in prose" and becomes real tap/type/match UI inline in the conversation.
2. **RN app foundation (future):** Expo app (iOS/Android/web) replacing the Next.js UI entirely; Next.js survives as backend only. Decisions already made: full RN/Expo rewrite; email-OTP auth; playful-but-grown-up design; OS-level dark mode; Expo web served at the main domain.
3. **AI-authored standalone sessions in the app (future):** the async fallback/mobile-first experience; also the universal fallback for AI hosts that cannot render widgets.

Explicitly rejected: embedding the user's chat subscription inside our app ("Sign in with ChatGPT" is a Codex-only preview granting API credits, no cross-provider equivalent, iframing chat UIs violates ToS). Re-evaluate in ~a year.

## 2. Decisions log (user-approved)

- Full RN/Expo rewrite later; **widgets first** now.
- Live tutoring interactivity happens **in the chat via MCP Apps widgets**, not via a two-surface realtime channel. No realtime infrastructure in this sub-project.
- Exercise types v1: **multiple choice / recognition, typed recall (with in-widget script keyboard), cloze & sentence building, matching/pairs.**
- Name: **Parlay** (parler = to speak; a parlay compounds winnings — as streaks and SRS compound vocabulary).
- Aesthetic: **playful and game-like but restrained** — "a more serious Duolingo." Neutral Parlay core brand; per-language accent theming (Farsi keeps turquoise/girih/pomegranate flavor via `languages` config). Seed-based progress metaphor stays (language-neutral).
- **OS-level dark mode everywhere**; widgets follow the host chat's theme.
- Rename is task one of this sub-project; zero users, zero migration concerns.

## 3. Host support reality (as of Aug 2026)

MCP Apps is the first official MCP extension (Jan 2026), co-developed by Anthropic and OpenAI; ChatGPT is fully compatible with the shared spec (Feb 2026).

| Host | Widget rendering | Parlay behavior |
|---|---|---|
| ChatGPT (developer mode) | ✅ works for custom servers today | Primary widget target at launch |
| ChatGPT (app directory) | After review | Future submission task |
| claude.ai / Claude Desktop | Directory-approved connectors only; custom remote connectors currently fall back to text (anthropics/claude-ai-mcp#471) | Text-drill fallback until directory review passes; submission is a first-class follow-up task |
| Goose, VS Code, Postman, MCPJam | ✅ | Works incidentally; MCPJam/basic-host used for dev |
| Gemini, DeepSeek, z.ai, others | MCP tools only, no UI | Text-drill fallback via tutor instructions |

**Design consequence:** text fallback is not an afterthought — `get_tutor_instructions` teaches both modes and how to detect which one applies. The widget path and text path exercise the same server-side attempt-recording, so progress data is identical regardless of host.

## 4. Architecture

### 4.1 Rename (task one)

- Product name everywhere: **Parlay**. MCP `serverInfo.name` → `parlay`; package.json name; page titles/nav branding; tutor skill and bootstrap prompt copy; README.
- Vercel project renamed (new `*.vercel.app` URL; exact slug resolved at rename time by availability). `NEXT_PUBLIC_SITE_URL` updated; all generated content already interpolates it — no hardcoded URLs exist by prior convention.
- Repo/local directory rename happens at the end of the sub-project (avoids mid-flight tooling churn).
- The `fa`-specific naming of *data* (e.g., `fa_to_en` grade directions) is untouched — internal identifiers are not brand surface.

### 4.2 Exercise schema (`packages`-ready, lives in `src/lib/exercises/`)

A discriminated union `Exercise` with shared envelope:

```
{ id, type: "choice" | "typed" | "cloze" | "match",
  prompt: { text?, term?, term_vocalized?, transliteration?, audio? (future) },
  vocab_id?,           // links to vocab_items for SRS
  srs?: boolean,       // if true and vocab_id present, attempt maps to an SRS grade
  payload: <per-type>, // options/answer/tiles/pairs/blanks
  meta: { difficulty?, skill? } }
```

Per-type payloads:
- `choice`: `{ options: [{id, text, script?}], correct_id, direction }`
- `typed`: `{ expected: [accepted strings], input: "script" | "translit" | "translation", keyboard?: boolean }` — normalization via the existing language registry (`normalize`, diacritic stripping) before comparison.
- `cloze`: `{ sentence_tokens: [...], blanks: [{index, expected:[...]}], mode: "type" | "tiles" }` — tiles mode doubles as sentence-scramble.
- `match`: `{ pairs: [{left, right}] }` — shuffled client-side.

A `Drill` is `{ id, title?, language, exercises: Exercise[] (1–10), srs_default? }`. Zod schemas exported for tool input validation and shared with the widget bundle.

### 4.3 MCP tools

- **`present_drill` (new):** input = `Drill` (validated). Registers/returns per MCP Apps: tool declares `_meta` UI resource pointing at the exercise widget; result carries the drill as structured content. The tutor authors the drill inline (typically from vocab it fetched via existing tools). Server persists the drill row so the widget can record attempts against it.
- **`record_attempt` (new, widget-facing):** called by the widget via the ext-apps `callServerTool` bridge. Input: `{ drill_id, exercise_id, correct, answer_given, ms_taken }`. Writes to the existing `exercise_attempts` table; when the exercise has `vocab_id` + srs enabled, applies an SRS grade through the existing grading logic (correct → 4, incorrect → 1; the tutor can still use `grade_card` for nuanced 0–5 grading in conversational reviews). Tenant-scoped like every other tool.
- **`get_drill_results` (new):** tutor calls this after the widget signals completion, to fetch the full attempt breakdown for adaptation. (The widget also pushes a compact summary via `updateModelContext`, but this tool is the reliable source.)
- **`get_tutor_instructions` (updated):** teaches widget-mode drilling (when to push drills, sizing, difficulty mixing, reading results) and the text-mode fallback; explains how to tell which mode the host supports.
- Existing 12 tools unchanged; wire contracts unchanged (`toolResultVerbatim` stays exclusive to `get_tutor_instructions`).

### 4.4 Widget runtime

- One widget page (`ui://parlay/drill.html` semantics per spec; served as a bundled single-file HTML resource from the Next.js app) hosting the drill player: steps through 1–10 exercises with progress indicator, immediate per-answer feedback, end-of-drill summary card (score, seeds earned).
- Interaction flow: host renders iframe → widget receives tool result (`ontoolresult`) with the drill → user answers each exercise → widget calls `record_attempt` per answer (durable data capture independent of model behavior) → on completion, `updateModelContext("drill complete: 8/10, missed: نان, آب")` so the model reacts naturally; tutor may call `get_drill_results` for detail.
- Components written in **React + react-native-web + shared design tokens**, bundled with Vite into a small self-contained artifact — the deliberate bet that these same components mount in the Expo app later. Documented fallback: if RNW fights the iframe constraints (bundle size, styling), drop to plain React and accept a one-time exercise-UI rebuild in RN.
- The Farsi script keyboard is ported into the widget bundle from the existing `ScriptKeyboard` (typed-recall exercises in script mode).
- **Theming:** design tokens as CSS variables with light/dark values; widget follows the host-provided theme from the ext-apps context, falling back to `prefers-color-scheme`. Estedad served for Farsi text; script-scale/diacritics respected from user settings when available.

### 4.5 Design system seed

This sub-project creates the **Parlay token package** (colors, type scale, spacing, radii, motion durations — light + dark) used by the widgets now and the RN app later. Full visual direction is executed at the design task with the frontend-design skill under the brief: *neutral Parlay core, playful-but-restrained, seed/compounding progress metaphor, per-language accent slots (Farsi: turquoise `firoozeh`, cobalt `kashi`, pomegranate `anar`, saffron `zaferan`), dual-mode from day one.*

### 4.6 Data model

- New table `drills` (id, user_id/curriculum scoping, language, payload jsonb, created_at) — persisted on `present_drill` so `record_attempt` validates against a real drill and attempts have provenance.
- `exercise_attempts` (exists since v2) gains drill/exercise linkage columns as needed.
- RLS follows the established pattern (tenant predicates, definer `_for` variants where the MCP admin path needs them).

## 5. Implementation risks

1. **claude.ai widget gating** (see §3): mitigated by text fallback + directory submission task; ChatGPT proves the experience meanwhile.
2. **`mcp-handler` 2.x may not expose MCP Apps `_meta`/resource registration.** Plan must verify early; acceptable outcomes: upgrade, drop to `@modelcontextprotocol/sdk` directly, or attach `_meta` manually if the handler passes it through. This is the first spike of the plan.
3. **react-native-web in a sandboxed iframe** — bundle size and style fidelity. Spiked early; documented fallback to plain React.
4. **Spec drift:** MCP Apps is young (first official extension, Jan 2026; MCP core rev 2026-07-28 rolling out). Pin SDK versions; keep the widget contract thin.

## 6. Testing

- **Unit (vitest):** exercise schema validation incl. normalization-based answer checking per language; drill persistence; `record_attempt` grading side-effects; tool input validation.
- **Widget (vitest + RTL):** each exercise type's interaction loop; drill player stepping; theme switching.
- **Wire (mcp-smoke, extended):** tool count; `present_drill` declares its UI resource; resource fetch returns the bundled HTML; `record_attempt`/`get_drill_results` round-trip; existing verbatim/stringify contracts asserted unchanged.
- **Host e2e (local):** the ext-apps SDK `basic-host` harness drives the real widget against the real server — the closest-to-production automated check.
- **Manual acceptance:** ChatGPT developer mode end-to-end (connect → tutor pushes drill → answer → tutor adapts); claude.ai confirms graceful text fallback.
- Suite order rules from prior cycles unchanged (pgTAP on empty DB post-reset, before seeding).

## 7. Out of scope

- RN app, store shipping, async standalone sessions (sub-projects 2–3).
- Marketplace/sharing; audio exercises (schema leaves room via `prompt.audio`).
- Claude/ChatGPT directory submissions happen after this ships (follow-up tasks, not gating).
- Subscription-embedding (watchlist only).
