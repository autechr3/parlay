@AGENTS.md

# Parlay — agent context

Language-learning companion: the user's own AI (Claude/ChatGPT/any MCP host) is the tutor; this app is the memory (SRS, curriculum, progress) and the interactive surfaces (in-chat drill widgets via MCP Apps). Farsi first; engine is language-agnostic. See README.md for the product story and repo tour, `docs/superpowers/specs/` for per-cycle design docs.

## Wire contracts (FROZEN — regressions here have shipped before)

In `src/app/api/mcp/route.ts` there are three result wrappers, selected per tool **by identity, never by runtime type**:
- `toolResult` — JSON.stringify's everything. `log_practice_session` and `add_vocab` return bare UUID strings and MUST stay stringified (the smoke's `callTool` JSON.parses every result).
- `toolResultVerbatim` — used ONLY by `get_tutor_instructions` (instruction prose goes on the wire untouched).
- `toolResultStructured` — used ONLY by `present_drill` (model-facing text + `structuredContent {drill_id, drill}` for the widget).

15 tools total; `serverInfo.name` is `"parlay"`; both smoke scripts assert the exact tool list.

## Widget pipeline

- `src/widgets/drill/` builds to ONE self-contained HTML file: `npm run widgets:build` (runs automatically via `predev`/`prebuild`) → git-ignored `src/widgets/generated/drill-widget-html.ts`, imported by the MCP route and served as resource `ui://parlay/drill.html`. Standalone `npx tsc --noEmit` needs `widgets:build` run first.
- `__PARLAY_SITE__` placeholder in the widget HTML is substituted with `NEXT_PUBLIC_SITE_URL` at resource-read time. Never hardcode site URLs anywhere in generated content.
- **Bidi rule (regression-tested):** card chrome is ALWAYS LTR. Direction for content comes from the content, not the drill language — sentence rows use `dir="auto"`, script elements set explicit per-element `dir="rtl"`. English instructions inside Farsi drills are normal and must render LTR.
- Widget components use only the primitives in `src/widgets/drill/ui.tsx` (RN-portable layer) + tokens from `src/lib/design/tokens.ts` (always define light AND dark).
- Host support (verified live 2026-08): claude.ai and ChatGPT both render the widget for custom connectors; other MCP hosts get the conversational fallback taught by `get_tutor_instructions`.

## Database & Supabase

- Migrations are a squashed baseline (`20260813100001`–`...07`) + additive migrations after. RLS conventions live in `20260813100003_rls_grants.sql`: every table gets RLS + owner-scoped policy (guarded by the `pg_namespace` auth-schema check) + explicit grants (no base privileges otherwise).
- SM-2 grading is SQL: `grade_card` (invoker, browser path) and `grade_card_for` (definer, MCP path). Definer `_for` functions carry explicit tenant predicates and the revoke-from-public + re-grant-to-service_role pattern (a bare revoke also strips service_role).
- `src/lib/mcp/data.ts` uses the service-role admin client which BYPASSES RLS — every query there must carry explicit tenant predicates (`.eq("user_id", ...)`, `ownedCurriculumIds`). Never trust `profiles.active_curriculum_id` without re-verifying ownership.
- Empty `.in()` lists 500 in PostgREST — use typed sentinels (nil-UUID for uuid columns).
- `data.ts` is `import "server-only"` — pure logic that needs vitest coverage goes in `src/lib/mcp/helpers.ts`.

## Test suite order (mandatory)

```
npx supabase db reset --local
npx supabase test db            # pgTAP on the EMPTY just-reset DB, BEFORE seeding
# recreate dev user mag@saf.com / localdev123 (admin API), then:
npm run seed -- --user mag@saf.com
npm run test && npx tsc --noEmit && npm run build
npm run mcp:smoke && npm run oauth:smoke
npx playwright test
```

pgTAP files 002–004 collide with seeded data — never run them after seeding. The smokes spawn their own dev server. Local supabase needs Docker Desktop running.

## Conventions

- Content-package format: emit `"parlay/content-package"`, accept legacy `"farsi-tracker/content-package"` forever.
- Brand vs language: "Parlay"/"parlay" is the brand; Farsi/Persian references (`fa` codes, `fa_to_en` directions, `fa_normalize`, curriculum copy) are language content, not brand.
- Tutor-facing text lives in `src/lib/tutor-skill.ts` (skill, bootstrap prompt, drill authoring rules) — it is product surface; wording changes there need the string-asserting tests updated (`tests/tutor-skill.test.ts`, smoke raw assertions).
- Estedad is the Farsi face. In the Next.js app its `next/font` variable must stay on `<html>` (comment in `layout.tsx` explains the Tailwind `@theme` regression if moved).
- Import/copy-paste flows are demoted product-wide: the LLM authors content through MCP; paste-based import survives only under advanced/fallback disclosures.

## Ops (don't print secret values)

- Prod: https://useparlay.vercel.app (Vercel project `parlay`, team autechr3s-projects). MCP endpoint `/api/mcp`; OAuth discovery under `/.well-known/`.
- Cloud Supabase project `wbgxabdllukiofokqczc`. Query it with `npx supabase db query "..." --linked`; psql only via `docker exec supabase_db_farsi-progress-tracker psql "postgresql://postgres.wbgxabdllukiofokqczc:<pw>@aws-0-us-east-2.pooler.supabase.com:5432/postgres"`.
- Secrets: `.env.local` (`SUPABASE_DB_PASSWORD`, `RESEND_API_KEY`, ...) and `.superpowers/cloud-keys.json` (git-ignored).
- `npx supabase db push --linked` for additive migrations (preserves data); `db reset --linked` wipes users too — only on explicit request. Vault cron secrets survive resets.
- MCP tool-level errors ride inside HTTP 200s; all three result wrappers `console.error("[mcp tool error]", ...)` so `npx vercel logs useparlay.vercel.app` shows them.
