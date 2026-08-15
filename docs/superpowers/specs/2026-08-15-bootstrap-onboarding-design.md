# One-Paste Bootstrap Onboarding — Design

Date: 2026-08-15
Status: approved (conversation), cycle 3 (streamlines cycle 2's wizard)

## Goal

Reduce onboarding to **one copy/paste**. The MCP connection becomes the
delivery channel for everything after it: a new `get_tutor_instructions` MCP
tool serves the tutor persona + first-curriculum guidance, so the agent
fetches its own instructions instead of the user ferrying prompts and skill
files. Manual setup survives as an explicit self-service option.

User-stated problem: "users are complaining it's a little convoluted to set
up." User-chosen mechanism: "expose an mcp endpoint for getting the prompts
that the agent could execute after the connection is verified, instead of
asking the user to copy paste more than once."

## Honest constraint (drives the design)

A pasted prompt cannot modify a chat app's own settings — claude.ai/ChatGPT
connectors and skills are Settings-UI-only. Agentic tools (Claude Code) CAN
self-install (`claude mcp add`, write skill files). Therefore the bootstrap
prompt delegates platform setup to the AI itself ("walk me through YOUR
app's connector flow / run the command yourself"), and everything after
connection flows through MCP tools.

## New MCP surface

### Tool 12: `get_tutor_instructions`
- Input: `{ language: z.string().min(1).default("fa") }` (validated against
  the `languages` table; unknown → the standard unsupported-language error
  listing supported codes).
- Output (text): the `gpt-instructions` flavor of `buildTutorSkill` for that
  language (existing generator — no frontmatter, direct second-person
  instructions, tool-first mandate, language rules), followed by a new
  **First curriculum** section (served only when the caller's account has
  zero curriculums for that language... simplification: always included,
  phrased conditionally): interview the learner briefly (pace, weekly time,
  interests, script-vs-transliteration preference), then generate a starter
  curriculum and import it via `import_content_package`, then confirm what
  was imported and suggest starting lesson 1.
- Description (discoverability requirement): tells any newly-connected agent
  to call this FIRST — e.g. "Call this before tutoring: returns the tutoring
  workflow, content-authoring rules, and first-session guidance for this
  learner's target language." A connected agent that never saw the wizard
  still self-configures.
- Implementation: thin tool over `buildTutorSkill` + a new pure
  `buildFirstCurriculumGuidance(languageName)` appended; language name/row
  from the `languages` table lookup.

## Bootstrap prompt

New pure builder `buildBootstrapPrompt({ languageCode, languageName, siteUrl })`
(lives with tutor-skill code). Content contract:
1. Identify which AI app you (the assistant) are running in.
2. If farsi-tracker tools are not available: give the user YOUR app's exact
   connect path — claude.ai/Claude Desktop: Settings → Connectors → Add
   custom connector → `<siteUrl>/api/mcp` (no client id/secret); Claude
   Code: run `claude mcp add --transport http farsi-tracker <siteUrl>/api/mcp`;
   ChatGPT: its connector/developer-mode flow (best-effort). Wait until the
   user confirms.
3. Verify the connection by calling `get_study_state`.
4. Call `get_tutor_instructions` with language `<languageCode>` and follow
   the returned instructions from now on (become the tutor; run the
   first-curriculum interview + import).
Short (≤ ~25 lines), imperative, no JSON, no schema content (that all lives
server-side behind the tool).

## Wizard restructure (4 steps → 3)

- **Step 1 — Choose language** (unchanged).
- **Step 2 — Connect your AI** (replaces old steps 2+3): headline copy "Copy
  one prompt into your AI — it does the rest." Shows: the bootstrap prompt
  (copy button, parameterized by step-1 language) and the connector URL in a
  small copyable line beneath (the AI will reference it; surfacing it saves
  a round-trip). Live ✓ "Connected — token '<name>' active" (existing status
  polling unchanged). A "Set up manually instead" `<details>` contains
  cycle-2's content: skill tabs (Claude/ChatGPT) with download/copy +
  install instructions, per-tool connector steps.
- **Step 3 — Your first curriculum** (old step 4, minus the prompt): live
  detection only — waiting state explains the tutor will interview then
  import; ✓ + "Start learning →" + completion stamp as today. Advanced
  manual-import `<details>` stays.
- Step-rail labels: 1 Choose language · 2 Connect your AI · 3 First
  curriculum. Completion/skip semantics, redirect, nav — all unchanged.
- `/prompts` page: unchanged this cycle (its generator prompts remain the
  post-onboarding library; the fallback details already covers no-MCP).

## Testing

- vitest: `buildBootstrapPrompt` (mentions all three platform paths, embeds
  siteUrl + language code, contains the two tool names get_study_state +
  get_tutor_instructions, ≤ length budget, no JSON braces beyond none);
  `buildFirstCurriculumGuidance` (interview + import_content_package + no
  raw-JSON instruction); tool test in tests/mcp-data.test.ts style for the
  language validation path (pure part); wizard step tests updated (3 rails,
  bootstrap prompt rendered + copyable, manual details contains old skill
  tabs, step-3 has no prompt `<pre>`).
- MCP route: tool count assertions (11 → 12) in mcp-smoke; smoke asserts
  get_tutor_instructions returns text containing "import_content_package"
  and the fa language rules.
- e2e: onboarding spec updated for 3 steps (step-2 heading/prompt presence,
  manual details present; skip flow unchanged).
- Full local proof + deploy + prod verification (tool listed on prod /api/mcp).

## Non-goals

- No change to OAuth/connector mechanics, /prompts builders, or skill-file
  generator content (reused as-is).
- No MCP "prompts" protocol primitive (tools are agent-invokable; prompts
  primitive is user-invoked and unevenly supported).
- No removal of the manual path.
