# Parlay visual overhaul — design

**Date:** 2026-08-19
**Status:** approved direction, spec for the visual-overhaul cycle
**Predecessor state:** main @ 1c539f1 (Parlay widgets shipped; drill cards verified rendering in claude.ai and ChatGPT)

## 1. Goal and scope decision

Give Parlay a distinctive visual identity on the surfaces users touch **today**: the in-chat drill widget (carries into the future RN app via the primitives layer) and the existing Next.js web app (accepted as partially throwaway when the RN rewrite lands — the cost of looking good now). The seeds progress metaphor ships **wired to real data**, not as garnish.

User-approved decisions: widgets + web polish (not the RN cycle yet, not widgets-only); seeds wired to real data; serious-Duolingo tone; OS-level dark mode; no mascot.

## 2. Design direction (from the frontend-design pass; plans copy these values verbatim)

### Signature: countable seeds
A **seed** — a rounded teardrop glyph tilted ~30°, rendered in **anar `#E03A57`** when filled — is the one repeated identity object: logo mark beside the wordmark, drill progress notches, daily-meter units, correct-answer pop. The daily meter is **countable**: 20 discrete seed sockets that fill one by one (never a continuous percentage bar). One seed = one answered review item (effort metric; correctness is shown separately as score). The boldness budget is spent entirely here; everything around the seeds stays quiet.

### Palette (existing tokens survive; usage rules tightened)
| Token | Light | Dark | Role |
|---|---|---|---|
| bg | #FBF7F0 | #10173A | page ground (warm stone / cobalt night — never gray) |
| surface | #FFFFFF | #1A2350 | cards |
| text / muted | #1B2140 / #6B7194 | #F2EFE9 / #9BA3C7 | copy |
| primary | #12B5AE | #17C9C1 | actions, matched/locked states |
| correct / incorrect | #2FA36B / #E03A57 | #3FBF80 / #F06078 | answer feedback only |
| accent (saffron) | #F2A93B | #F5B95C | goal-reached / streak celebration only |
| seed fill | #E03A57 | #F06078 | seeds ONLY (shares anar hex; the glyph shape carries the meaning) |

Empty seed sockets: `border` color outline at 45% opacity. Stat numerals use tabular figures.

### Type roles
- **Display: Baloo 2** (self-hosted woff2) — wordmark, big score/seed counts, page titles. Nothing else. Weights 600/700.
- **Body: Figtree** (self-hosted) — everything readable; 400/600.
- **Script: Estedad** — unchanged; in drill cards the target-language term is always the largest element on screen (≥1.6em).
- No third Latin face, no gradients on text.

### Key layouts (wireframes are normative for hierarchy, not pixel measurements)
```
Dashboard hero                          Drill card (widget)
┌────────────────────────────────┐      ┌────────────────────────────┐
│ ◗ Day 12                       │      │ ◗◗◗▹▹▹▹  3/7               │
│ ◗◗◗◗◗◗◗◗ ▹▹▹▹▹▹▹▹▹▹▹▹  8/20    │      │        آب                  │
│ Today's seeds                  │      │  Which means 'water'?      │
│ ┌────────────┐ ┌────────────┐  │      │  ┌─────────┐ ┌─────────┐   │
│ │ 14 due     │ │ Lesson 4   │  │      │  │  water  │ │  bread  │   │
│ │ Review →   │ │ Continue → │  │      │  └─────────┘ └─────────┘   │
│ └────────────┘ └────────────┘  │      └────────────────────────────┘
└────────────────────────────────┘
```
Streak is a quiet "◗ Day N" chip (no flame — Duolingo owns flames). Answer options are chunky pills (radius.pill, 1px border, generous tap targets). Nav carries the wordmark + seed mark; pages are mobile-first.

### Motion (one orchestrated moment per surface; ALL gated on prefers-reduced-motion)
- Dashboard load: today's seeds pop into sockets, staggered ~30ms, scale 0.6→1 with slight overshoot. Only entrance animation on the page.
- Drill correct: one seed pops into the progress notch (~200ms scale-bounce). Incorrect: 4px horizontal shake, border → incorrect.
- Drill complete: earned seeds fly to the summary count; "+N seeds" lands with a single bounce. No confetti.
- Everything else: 120–150ms ease-out color/transform transitions on interactive elements; no scroll-triggered effects.

### Copy register
Sentence case, plain verbs, consistent action names (a button says what it does). Empty states invite action ("No cards due — learn something new"). Errors say what happened and what to do next, never apologize.

## 3. Architecture

- **Single token source:** `src/lib/design/tokens.ts` (extended with motion durations + the seed constants). `globals.css` gains a CSS-variable mirror mapped through Tailwind v4 `@theme` so pages use token utilities; a **drift-guard vitest** asserts the CSS values equal the TS values. Widget keeps importing TS tokens directly.
- **Dark mode (web):** CSS variables set on `:root` (light) and overridden under `@media (prefers-color-scheme: dark)`. No toggle this pass. The widget already follows host theme; its `prefers-color-scheme` fallback stays.
- **Fonts:** Baloo 2 + Figtree woff2 files in `public/fonts/`; web loads via `next/font/local` (variables on `<html>`, per the layout.tsx regression rule); widget adds `@font-face` blocks with `__PARLAY_SITE__` URLs (CSP `resourceDomains` already covers our origin). Real fallback stacks throughout.
- **Seed glyph:** one inline-SVG component implemented twice against the same path data — `src/components/SeedGlyph.tsx` (web) and a widget primitive — plus filled/empty variants. Favicon and wordmark derive from it.
- **Seed data:** dashboard reads existing `study_days.cards_reviewed` (today) and `current_streak()`; `DAILY_SEED_GOAL = 20` constant (a settings knob later — no schema changes this cycle). Drill summary's "+N seeds" = exercises answered in that drill (widget-local; no new fetches from the widget).
- **Widget preview harness:** `npm run widgets:preview` — a Vite dev page mounting `DrillPlayer` with a fixture drill and a light/dark toggle, for visual iteration and screenshots without a chat host. Permanent dev tool, excluded from the production bundle.
- **Shared web primitives:** `Card`, `Button`, `PageHeader`, `SeedMeter`, `StreakChip` in `src/components/ui/`; the page sweep replaces ad-hoc styling with these + token utilities.

## 4. Surfaces in scope

1. **Widget:** CardShell (surface/borders/feedback states), option pills, ScriptKeys key styling, Progress → seed-notch bar, Summary (score hero in Baloo, "+N seeds", missed list), completion motion, fonts.
2. **Web:** globals/theme + dark mode; nav (wordmark + seed mark) + favicon; dashboard hero (SeedMeter + StreakChip + action cards); lessons list/detail; flashcards + review session; vocab; curriculums; settings; welcome wizard; login; progress; prompts. Import/advanced flows get token styling but no redesign.

## 5. Out of scope

RN app (next cycle); per-language accent theming (needs a languages-table column); daily-goal settings knob; streak-repair/gamification mechanics beyond display; audio exercises; marketplace.

## 6. Testing & verification

- All existing behavioral suites stay green (restyle, not rewire); tests that assert class names (e.g. the ScriptKeyboard component test) are updated alongside their components.
- New: token drift-guard test (CSS vars ⇄ tokens.ts); SeedMeter/StreakChip component tests (socket counts, goal-reached state); widget tests keep passing with styled components.
- Visual verification: screenshots of localhost pages (light + dark) and the widget preview harness reviewed during the cycle; before/after screenshots on prod at the end. Suite order and ops rules per CLAUDE.md.
- Accessibility floor: visible keyboard focus on all interactive elements, contrast ≥ 4.5:1 for text tokens in both themes, reduced-motion respected (asserted where testable).
