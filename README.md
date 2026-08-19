# Parlay

**Your AI is already a great language tutor. Parlay gives it a memory and a classroom.**

Parlay is a language-learning companion (Farsi first, engine is language-agnostic) that works *with* the AI subscription you already have — Claude, ChatGPT, or any MCP-capable assistant — instead of shipping its own chatbot or charging you for API keys. The AI teaches; Parlay remembers everything, schedules reviews, and renders interactive exercises right inside the chat.

## How it works

1. **Sign up and copy one prompt.** The onboarding wizard (`/welcome`) hands you a single bootstrap prompt. Paste it into your AI and it connects itself to Parlay's MCP server, then pulls its own tutoring instructions from the `get_tutor_instructions` tool — no skill files to install, no second paste.
2. **The AI authors your curriculum.** After a short interview (pace, goals, script vs. transliteration), the tutor generates a personalized curriculum — units, lessons, vocabulary — and imports it through the MCP tools. Nothing is copy/pasted; the import feature exists only as an advanced fallback.
3. **You practice inside the chat.** When the tutor drills you, it calls `present_drill` and an interactive card renders inline in the conversation ([MCP Apps](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/), the official MCP UI extension — rendering verified live in both claude.ai and ChatGPT). Four exercise types: multiple choice, typed recall with an on-screen Farsi keyboard, cloze/sentence-building with tap-tiles, and matching pairs. Every answer is recorded server-side and feeds the SRS automatically. Hosts that can't render widgets degrade gracefully: the tutor runs the same exercises conversationally and records results itself.
4. **Spaced repetition runs underneath.** An SM-2 scheduler tracks every vocabulary card across drill answers, flashcard sessions in the web app, and conversational reviews. Daily/weekly email digests are optional.

## Architecture

| Piece | Tech | Notes |
|---|---|---|
| Web app + API | Next.js (App Router) on Vercel | UI (dashboard, lessons, flashcards, wizard) plus all API routes |
| MCP server | `mcp-handler` at `/api/mcp` | 15 tools; OAuth 2.1 with dynamic client registration for claude.ai-style connectors, plus `fpt_` bearer tokens |
| Drill widget | Single-file Vite bundle (React) | Served as an MCP Apps `ui://` resource; talks to the host via `@modelcontextprotocol/ext-apps` |
| Database | Supabase (Postgres + Auth) | RLS on everything; SM-2 grading in SQL; pg_cron for email schedules |
| Languages | `src/lib/languages/` registry | Per-language normalization, diacritics, keyboard layout, drills — Farsi implemented, generic fallback for any language |

## Local development

Prereqs: Node 20+, Docker Desktop, Supabase CLI (via `npx supabase`).

```bash
npm install
npx supabase start          # local Postgres/Auth stack
npx supabase db reset --local
npx supabase test db        # pgTAP — MUST run on the empty, just-reset DB
# create dev user mag@saf.com / localdev123 via the admin API, then:
npm run seed -- --user mag@saf.com
npm run dev                 # http://localhost:3000 (predev builds the widget)
```

Test suites (order matters — see CLAUDE.md): pgTAP → vitest (`npm run test`) → `npx tsc --noEmit` → `npm run build` → `npm run mcp:smoke` → `npm run oauth:smoke` → `npx playwright test`.

## Repository tour

```
src/app/api/mcp/route.ts     MCP server: 15 tools + the drill widget resource
src/lib/mcp/data.ts          tenant-scoped data layer behind every tool
src/lib/exercises/           drill/exercise schema + language-aware answer checking
src/widgets/drill/           the in-chat drill player (built by `npm run widgets:build`)
src/lib/tutor-skill.ts       tutor instructions, bootstrap prompt, curriculum guidance
src/lib/languages/           language registry (fa + generic)
src/lib/design/tokens.ts     design tokens (light/dark) shared by widget and future app
supabase/migrations/         schema, RLS, SM-2 functions, drills tables
docs/superpowers/specs/      design docs for each development cycle
```

## Roadmap

- **React Native app** (Expo: iOS/Android/web) replacing the Next.js UI; Next.js stays as the backend. Playful-but-grown-up design, OS dark mode, per-language theming.
- **AI-authored standalone sessions** — drills you run on your phone without a chat open; results sync back to your tutor.
- Connector-directory submissions (Claude & ChatGPT), curriculum marketplace, more languages.
