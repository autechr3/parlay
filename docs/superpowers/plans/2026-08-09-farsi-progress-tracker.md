# Farsi Progress Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-user (multi-user-correct) Farsi study companion: SRS vocabulary review, lesson progress tracking, and a daily reminder email.

**Architecture:** Next.js App Router (TypeScript, Tailwind) on Vercel talking to Supabase (Postgres + Auth + RLS + Edge Functions). All SRS logic lives in a Postgres function `grade_card`; the review UI is a client-side session that queues grades in IndexedDB and syncs via RPC. `pg_cron` fires an hourly Edge Function that sends timezone-matched reminder emails through Resend. Spec: `docs/superpowers/specs/2026-08-09-farsi-progress-tracker-design.md`.

**Tech Stack:** Next.js 15+, TypeScript, Tailwind, @supabase/supabase-js, @supabase/ssr, js-yaml, csv-parse, idb-keyval, react-markdown, recharts, Vitest, Playwright, pgTAP (via `supabase test db`), Deno Edge Functions, Resend.

## Global Constraints

- Development runs against **local Supabase** (`npx supabase start`, requires Docker Desktop). Cloud Supabase/Vercel/Resend are provisioned only in Tasks 16–17.
- **No ORM** — hand-written SQL in `supabase/migrations/`. **No state-management library.**
- **Never set `dir="rtl"` globally.** Persian text always rendered as `<span dir="rtl" lang="fa" className="font-fa">…</span>`; Persian inline inside English sentences wrapped in `<bdi>`.
- **Never strip or trim ZWNJ (U+200C)** from stored or displayed text. Normalization (Arabic→Persian mapping, diacritic stripping, ZWNJ→space) exists ONLY in `fa_normalize` (SQL) and `faNormalize` (TS) for search/answer-comparison.
- Font: **Vazirmatn**, self-hosted via `next/font/local`, exposed as Tailwind class `font-fa`.
- Digits stored as numbers; `toPersianDigits()` only at the render boundary.
- SM-2 grades stored 0–5. UI grade buttons map: Again=1, Hard=3, Good=4, Easy=5.
- Daily limits default 20 new / 120 reviews, per-user columns `profiles.daily_new_limit` / `daily_review_limit`. Interval cap 365 days.
- **All curriculum content is user-owned via `courses`** (spec decision 5). No shared reference data; course-content RLS = owner only. Content enters via content-package JSON (spec §Content packages) through `/import` or the seed script — both call the same `importContentPackage` engine. Imports never touch progress tables.
- No gamification: no badges, confetti, XP.
- All commands below are Git Bash syntax (Windows host). Use `npx supabase` (no global install).
- Local Supabase URLs: API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Mailpit (captured email) `http://127.0.0.1:54324`.

## File Structure

```
farsi-progress-tracker/
├── content/                      # import sources (copied in, DB is source of truth after import)
│   ├── lessons/L01…L10*.md
│   └── vocab.csv
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260809000001_extensions.sql
│   │   ├── 20260809000002_fa_normalize.sql
│   │   ├── 20260809000003_schema.sql
│   │   ├── 20260809000004_rls.sql
│   │   └── 20260809000005_functions.sql   # grade_card, current_streak, get_review_queue
│   ├── tests/                    # pgTAP, run with `npx supabase test db`
│   │   ├── 001_fa_normalize.sql
│   │   ├── 002_schema.sql
│   │   ├── 003_rls.sql
│   │   └── 004_grade_card.sql
│   └── functions/
│       ├── daily-reminder/index.ts
│       └── weekly-digest/index.ts
├── scripts/seed-lessons.ts       # importer (frontmatter + vocab.csv + md-table fallback)
├── src/
│   ├── app/
│   │   ├── layout.tsx  page.tsx (dashboard)
│   │   ├── login/page.tsx  auth/callback/route.ts  auth/signout/route.ts
│   │   ├── review/page.tsx  flashcards/page.tsx
│   │   ├── lessons/page.tsx  lessons/[slug]/page.tsx
│   │   ├── vocab/page.tsx  progress/page.tsx  settings/page.tsx
│   │   ├── import/page.tsx  prompts/page.tsx
│   │   └── api/export/route.ts  api/unsubscribe/route.ts
│   ├── components/   # Fa, FarsiText (tri-state toggle), FaKeyboard, ReviewSession,
│   │                 # FlashcardDeck, Heatmap, VocabTable, CompletionForm
│   ├── lib/
│   │   ├── supabase/server.ts  client.ts  middleware.ts
│   │   ├── farsi.ts        # digits, faNormalize, levenshtein, checkTypedAnswer, conjugatePresent/Past
│   │   ├── content-package.ts  # zod schema + importContentPackage engine
│   │   ├── agent-prompts.ts    # /prompts template builders
│   │   ├── directions.ts   # pickDirection
│   │   └── grade-queue.ts  # IndexedDB grade queue + sync
│   └── fonts/Vazirmatn[wght].woff2
├── tests/            # Vitest (unit)
└── e2e/              # Playwright smoke
```

---

### Task 1: Scaffold Next.js app, tooling, content

**Files:**
- Create: Next.js scaffold (via `create-next-app`), `content/lessons/*.md`, `content/vocab.csv`, `src/fonts/Vazirmatn[wght].woff2`, `vitest.config.ts`, `src/components/Fa.tsx`, `tests/fa-component.test.tsx`, `.env.local`
- Modify: `src/app/layout.tsx`, `package.json`, `.gitignore`

**Interfaces:**
- Produces: `<Fa>{farsi}</Fa>` component — `Fa({ children, className }: { children: React.ReactNode; className?: string })` renders `<span dir="rtl" lang="fa" className="font-fa …">`. Tailwind class `font-fa` → Vazirmatn. `npm test` runs Vitest.

- [ ] **Step 1: Scaffold the app**

```bash
cd /c/Users/mgrog/github/autechr3/farsi-progress-tracker
npx -y create-next-app@latest . --ts --tailwind --eslint --app --src-dir --use-npm --no-import-alias --turbopack
npm i @supabase/supabase-js @supabase/ssr js-yaml csv-parse idb-keyval react-markdown remark-gfm recharts
npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom tsx @types/js-yaml
```

If `create-next-app` refuses because the directory is not empty (docs/, .git), run it in a temp dir and move everything except `.git` in:
```bash
npx -y create-next-app@latest /c/Users/mgrog/AppData/Local/Temp/fpt-scaffold --ts --tailwind --eslint --app --src-dir --use-npm --no-import-alias --turbopack
cp -r /c/Users/mgrog/AppData/Local/Temp/fpt-scaffold/. . && rm -rf /c/Users/mgrog/AppData/Local/Temp/fpt-scaffold
npm i   # then the two npm i lines above
```

- [ ] **Step 2: Copy content in**

```bash
mkdir -p content/lessons
cp "/c/Users/mgrog/AppData/Local/Packages/CLAUDE~1/LOCALC~1/Roaming/Claude/LOCAL-~1/5C72FD~1/A99E97~1/LOCAL_~1/outputs/farsi/lessons/"*.md content/lessons/
cp "/c/Users/mgrog/AppData/Local/Packages/CLAUDE~1/LOCALC~1/Roaming/Claude/LOCAL-~1/5C72FD~1/A99E97~1/LOCAL_~1/outputs/farsi/progress/vocab.csv" content/vocab.csv
ls content/lessons | wc -l   # expect 10
```

- [ ] **Step 3: Download Vazirmatn variable font**

```bash
mkdir -p src/fonts
curl -L -o "src/fonts/Vazirmatn[wght].woff2" "https://raw.githubusercontent.com/rastikerdar/vazirmatn/master/fonts/variable/Vazirmatn%5Bwght%5D.woff2"
```

- [ ] **Step 4: Wire the font + Fa component**

`src/app/layout.tsx` (replace scaffold version):

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vazirmatn = localFont({
  src: "../fonts/Vazirmatn[wght].woff2",
  variable: "--font-fa",
  display: "swap",
});

export const metadata: Metadata = { title: "Farsi Tracker" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${vazirmatn.variable} antialiased`}>{children}</body>
    </html>
  );
}
```

Append to `src/app/globals.css` (Tailwind v4 theme token so `font-fa` works as a utility):

```css
@theme {
  --font-fa: var(--font-fa), serif;
}
```

`src/components/Fa.tsx`:

```tsx
export function Fa({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span dir="rtl" lang="fa" className={`font-fa ${className}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Vitest setup + failing test**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"] },
});
```

Add to `package.json` scripts: `"test": "vitest run", "test:watch": "vitest"`.

`tests/fa-component.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Fa } from "../src/components/Fa";

describe("Fa", () => {
  it("renders RTL Persian span with lang and font class", () => {
    const { container } = render(<Fa>می‌روم</Fa>);
    const span = container.querySelector("span")!;
    expect(span.getAttribute("dir")).toBe("rtl");
    expect(span.getAttribute("lang")).toBe("fa");
    expect(span.className).toContain("font-fa");
    // ZWNJ must survive rendering untouched
    expect(span.textContent).toBe("می‌روم");
  });
});
```

- [ ] **Step 6: Run tests and build**

Run: `npm test` — Expected: PASS (1 test).
Run: `npm run build` — Expected: compiles with no errors.

- [ ] **Step 7: Env file placeholder**

`.env.local` (git-ignored by scaffold; also create `.env.example` committed):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from `npx supabase start` output>
SUPABASE_SERVICE_ROLE_KEY=<from `npx supabase start` output>
NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true
UNSUBSCRIBE_SECRET=dev-secret-change-in-prod
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: scaffold Next.js app with Vazirmatn font, Fa component, content import sources"
```

---

### Task 2: Supabase local stack, extensions, `fa_normalize`

**Files:**
- Create: `supabase/config.toml` (via `supabase init`), `supabase/migrations/20260809000001_extensions.sql`, `supabase/migrations/20260809000002_fa_normalize.sql`, `supabase/tests/001_fa_normalize.sql`

**Interfaces:**
- Produces: SQL function `fa_normalize(text) returns text` — immutable; maps ي→ی ك→ک ة→ه أإآ→ا ؤ→و ئ→ی, strips U+064B–U+0652 diacritics, converts ZWNJ (U+200C) to space, collapses whitespace, trims. Extensions `pg_trgm`, `pg_cron`, `pg_net` available.

- [ ] **Step 1: Init + start local Supabase** (requires Docker Desktop running)

```bash
npx -y supabase init
npx supabase start
```

Expected: prints API URL `http://127.0.0.1:54321`, anon key, service_role key. Paste those two keys into `.env.local`.

- [ ] **Step 2: Extensions migration**

`supabase/migrations/20260809000001_extensions.sql`:

```sql
create extension if not exists pg_trgm;
create extension if not exists pg_net;
-- pg_cron is enabled via config on hosted Supabase; enable locally too:
create extension if not exists pg_cron;
```

- [ ] **Step 3: Write failing pgTAP test for fa_normalize**

`supabase/tests/001_fa_normalize.sql`:

```sql
begin;
create extension if not exists pgtap;
select plan(6);

select is(fa_normalize('علي'), 'علی', 'Arabic yeh maps to Persian yeh');
select is(fa_normalize('كتاب'), 'کتاب', 'Arabic kaf maps to Persian kaf');
select is(fa_normalize('مدرسة'), 'مدرسه', 'teh marbuta maps to heh');
select is(fa_normalize('کتابِ خوب'), 'کتاب خوب', 'kasre/diacritics stripped');
select is(fa_normalize('می‌روم'), 'می روم', 'ZWNJ becomes a single space');
select is(fa_normalize('  سلام   دنیا '), 'سلام دنیا', 'whitespace collapsed and trimmed');

select * from finish();
rollback;
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx supabase test db`
Expected: FAIL — `function fa_normalize(unknown) does not exist`.

- [ ] **Step 5: Implement fa_normalize**

`supabase/migrations/20260809000002_fa_normalize.sql`:

```sql
create or replace function fa_normalize(input text)
returns text
language sql
immutable
strict
as $$
  select trim(
    regexp_replace(          -- collapse runs of whitespace
      regexp_replace(        -- ZWNJ -> space
        regexp_replace(      -- strip harakat U+064B..U+0652
          translate(input, 'يكةأإآؤئ', 'یکهاااوی'),
          '[ً-ْ]', '', 'g'
        ),
        '‌', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;
```

- [ ] **Step 6: Apply and verify pass**

```bash
npx supabase db reset      # applies all migrations to local db
npx supabase test db
```
Expected: `001_fa_normalize.sql .. ok`, 6/6 pass.

- [ ] **Step 7: Commit**

```bash
git add supabase && git commit -m "feat: local supabase with extensions and immutable fa_normalize"
```

---

### Task 3: Schema migration + profile-creation trigger

**Files:**
- Create: `supabase/migrations/20260809000003_schema.sql`, `supabase/tests/002_schema.sql`

**Interfaces:**
- Produces: tables `profiles`, `units`, `lessons`, `lesson_completions`, `practice_sessions`, `skill_ratings`, `vocab_items` (with generated `farsi_normalized` + trigram index + `unique (lesson_id, farsi)`), `vocab_reviews`, `review_log`, `study_days`, `email_log` — exactly as in the spec's Data model section (spec §Data model). Trigger `on_auth_user_created` auto-inserts a `profiles` row for every new auth user.

- [ ] **Step 1: Write failing pgTAP test**

`supabase/tests/002_schema.sql`:

```sql
begin;
create extension if not exists pgtap;
select plan(7);

select has_table('profiles');
select has_table('courses');
select has_table('vocab_items');
select has_column('vocab_items', 'farsi_normalized');
select has_table('email_log');
select col_is_unique('email_log', array['user_id','kind','sent_on'], 'email_log dedup constraint');

-- trigger creates profile automatically
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'test@example.com');
select is(
  (select count(*)::int from profiles where id = '00000000-0000-0000-0000-000000000001'),
  1, 'profile auto-created for new auth user'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase test db` — Expected: 002 FAILs (`profiles` missing).

- [ ] **Step 3: Write the schema migration**

`supabase/migrations/20260809000003_schema.sql` — copy the full `create table` DDL verbatim from spec §Data model (all 12 tables including `courses` and `email_log`, the `alter table profiles add column active_course_id`, and the `vocab_reviews`/`vocab_items` indexes — the exercises tables are excluded, they land in migration 7). Creation order: `profiles` → `courses` → `alter profiles` → `units` → `lessons` → the rest. Add:

```sql
-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

Order matters: `profiles` → `units` → `lessons` → everything else (FK dependencies). `fa_normalize` already exists from migration 2, so the generated column works.

- [ ] **Step 4: Apply and verify pass**

```bash
npx supabase db reset && npx supabase test db
```
Expected: 001 and 002 both `ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase && git commit -m "feat: full schema with generated farsi_normalized, email_log, profile trigger"
```

---

### Task 4: RLS policies

**Files:**
- Create: `supabase/migrations/20260809000004_rls.sql`, `supabase/tests/003_rls.sql`

**Interfaces:**
- Produces: RLS enabled on every table. User-scoped tables allow only `auth.uid() = user_id` (profiles: `auth.uid() = id`). Course-content tables (`courses`, `units`, `lessons`, `vocab_items`) — full access for the course **owner only**; nobody else can read or write another user's course.

- [ ] **Step 1: Write failing pgTAP test**

`supabase/tests/003_rls.sql`:

```sql
begin;
create extension if not exists pgtap;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into courses (id, owner_id, name) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Farsi');
insert into lessons (course_id, number, title, slug) values
  ('c0000000-0000-0000-0000-000000000001', 1, 'Greetings', 'greetings');
insert into vocab_items (course_id, farsi, transliteration, english, lesson_id)
  values ('c0000000-0000-0000-0000-000000000001', 'سلام', 'salâm', 'hello',
          (select id from lessons where number = 1));
insert into vocab_reviews (user_id, vocab_id)
  values ('00000000-0000-0000-0000-00000000000a', (select id from vocab_items limit 1));

-- act as user A (the course owner)
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*)::int from profiles), 1, 'A sees only own profile');
select is((select count(*)::int from vocab_reviews), 1, 'A sees own review row');
select is((select count(*)::int from courses), 1, 'A sees own course');
select is((select count(*)::int from vocab_items), 1, 'A reads own course content');
select lives_ok(
  $$insert into vocab_items (course_id, farsi, transliteration, english)
    values ('c0000000-0000-0000-0000-000000000001','تست','test','test')$$,
  'owner can write own course content');

-- act as user B (not the owner)
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select is((select count(*)::int from vocab_reviews), 0, 'B cannot see A''s reviews');
select is((select count(*)::int from lessons), 0, 'B cannot see A''s course content');
select throws_ok(
  $$insert into vocab_items (course_id, farsi, transliteration, english)
    values ('c0000000-0000-0000-0000-000000000001','x','x','x')$$,
  '42501', null, 'B cannot write into A''s course');

reset role;
select is((select count(*)::int from profiles), 2, 'service context sees all');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase test db` — Expected: 003 FAILs (RLS not enabled → both users see everything).

- [ ] **Step 3: Write RLS migration**

`supabase/migrations/20260809000004_rls.sql`:

```sql
-- ===== user-scoped tables =====
alter table profiles enable row level security;
create policy "own profile" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['lesson_completions','practice_sessions','skill_ratings',
                           'vocab_reviews','review_log','study_days','email_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ===== course content: owner only =====
alter table courses enable row level security;
create policy "own courses" on courses for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['units','lessons','vocab_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own course content" on %I for all
         using (course_id in (select id from courses where owner_id = auth.uid()))
         with check (course_id in (select id from courses where owner_id = auth.uid()))', t);
  end loop;
end $$;
```

- [ ] **Step 4: Apply and verify pass**

```bash
npx supabase db reset && npx supabase test db
```
Expected: 001–003 all `ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase && git commit -m "feat: RLS policies - user-scoped isolation, read-only reference data"
```

---

### Task 5: SRS SQL functions — `grade_card`, `current_streak`, `get_review_queue`

**Files:**
- Create: `supabase/migrations/20260809000005_functions.sql`, `supabase/tests/004_grade_card.sql`

**Interfaces:**
- Produces:
  - `grade_card(p_vocab_id uuid, p_grade smallint, p_direction text default 'fa_to_en', p_ms_taken int default null) returns vocab_reviews` — SM-2 update as authenticated user (`auth.uid()`), writes `review_log` + upserts `study_days.cards_reviewed` on the user's LOCAL date.
  - `current_streak(p_user uuid default auth.uid()) returns int` — consecutive study days ending today or yesterday (user-local).
  - `get_review_queue() returns table(vocab_id uuid, farsi text, transliteration text, english text, part_of_speech text, present_stem text, past_stem text, colloquial text, repetitions int, is_new boolean)` — due cards first (oldest due first, capped at `daily_review_limit − reviews already done today`), then new cards in lesson order (capped at `daily_new_limit − new cards started today`). Excludes suspended.

- [ ] **Step 1: Write failing pgTAP test**

`supabase/tests/004_grade_card.sql`:

```sql
begin;
create extension if not exists pgtap;
select plan(10);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'srs@example.com');
insert into courses (id, owner_id, name) values
  ('c0000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000aa', 'Farsi');
insert into lessons (course_id, number, title, slug) values
  ('c0000000-0000-0000-0000-0000000000aa', 1, 'L1', 'l1');
insert into vocab_items (id, course_id, farsi, transliteration, english, lesson_id) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000aa', 'سلام', 'salâm', 'hello', (select id from lessons where number=1)),
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000aa', 'رفتن', 'raftan', 'to go', (select id from lessons where number=1));

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);
set local role authenticated;

-- new card, first pass (grade 4): reps 1, interval 1, ease unchanged 2.50
select is( (grade_card('10000000-0000-0000-0000-000000000001', 4::smallint)).repetitions, 1, 'first pass reps=1');
select is( (select interval_days from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 1, 'first interval 1');
select is( (select ease from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 2.50, 'grade 4 keeps ease 2.5');

-- second pass: interval 6
select is( (grade_card('10000000-0000-0000-0000-000000000001', 4::smallint)).interval_days, 6, 'second pass interval 6');

-- third pass grade 5: interval = round(6 * ease); ease grows by 0.10 (2.50->2.60 applied AFTER interval calc => 6*2.5=15)
select is( (grade_card('10000000-0000-0000-0000-000000000001', 5::smallint)).interval_days, 15, 'third pass 6*2.5=15');
select is( (select ease from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 2.60, 'grade 5 ease +0.10');

-- failure: reset reps, interval 1, lapse++, ease -0.20
select is( (grade_card('10000000-0000-0000-0000-000000000001', 1::smallint)).repetitions, 0, 'fail resets reps');
select is( (select lapses from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 1, 'lapse counted');
select is( (select ease from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 2.40, 'fail ease -0.20');

-- side effects: review_log rows + study_days
select is( (select count(*)::int from review_log), 4, 'four log rows');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx supabase test db` — Expected: 004 FAILs (`grade_card does not exist`).

- [ ] **Step 3: Implement the functions**

`supabase/migrations/20260809000005_functions.sql`:

```sql
-- user-local date helper
create or replace function local_today(p_user uuid)
returns date language sql stable as $$
  select (now() at time zone coalesce(
    (select timezone from profiles where id = p_user), 'UTC'))::date;
$$;

create or replace function grade_card(
  p_vocab_id uuid,
  p_grade smallint,
  p_direction text default 'fa_to_en',
  p_ms_taken int default null
) returns vocab_reviews
language plpgsql
security invoker
as $$
declare
  v vocab_reviews;
  v_uid uuid := auth.uid();
  v_day date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_grade < 0 or p_grade > 5 then raise exception 'grade out of range'; end if;

  insert into vocab_reviews (user_id, vocab_id) values (v_uid, p_vocab_id)
    on conflict (user_id, vocab_id) do nothing;
  select * into v from vocab_reviews
    where user_id = v_uid and vocab_id = p_vocab_id for update;

  if p_grade <= 2 then
    v.repetitions   := 0;
    v.interval_days := 1;
    v.lapses        := v.lapses + 1;
    v.ease          := greatest(1.3, v.ease - 0.20);
  else
    v.repetitions   := v.repetitions + 1;
    v.interval_days := case v.repetitions
                         when 1 then 1
                         when 2 then 6
                         else round(v.interval_days * v.ease)::int
                       end;
    v.ease := least(2.8, greatest(1.3,
      v.ease + (0.1 - (5 - p_grade) * (0.08 + (5 - p_grade) * 0.02))));
  end if;

  v.interval_days    := least(v.interval_days, 365);
  v.due_on           := current_date + v.interval_days;
  v.last_reviewed_at := now();

  update vocab_reviews set
    repetitions = v.repetitions, interval_days = v.interval_days,
    lapses = v.lapses, ease = v.ease, due_on = v.due_on,
    last_reviewed_at = v.last_reviewed_at
  where id = v.id;

  insert into review_log (user_id, vocab_id, grade, direction, ms_taken)
  values (v_uid, p_vocab_id, p_grade, p_direction, p_ms_taken);

  v_day := local_today(v_uid);
  insert into study_days (user_id, day, cards_reviewed) values (v_uid, v_day, 1)
  on conflict (user_id, day) do update
    set cards_reviewed = study_days.cards_reviewed + 1;

  return v;
end;
$$;

create or replace function current_streak(p_user uuid default auth.uid())
returns int language sql stable as $$
  with d as (
    select distinct day from study_days
    where user_id = p_user and (cards_reviewed > 0 or lessons_completed > 0)
  ),
  t as (select day, row_number() over (order by day desc) rn from d),
  anchor as (
    select case
      when exists (select 1 from d where day = local_today(p_user)) then local_today(p_user)
      when exists (select 1 from d where day = local_today(p_user) - 1) then local_today(p_user) - 1
    end as a
  )
  select coalesce((select count(*)::int from t, anchor
                   where a is not null and t.day = a - (t.rn - 1)), 0);
$$;

create or replace function get_review_queue()
returns table (
  vocab_id uuid, farsi text, transliteration text, english text,
  part_of_speech text, present_stem text, past_stem text, colloquial text,
  repetitions int, is_new boolean
) language sql stable as $$
  with prof as (select * from profiles where id = auth.uid()),
  reviews_today as (
    select count(*)::int c from review_log r
    where r.user_id = auth.uid()
      and (r.reviewed_at at time zone (select timezone from prof))::date
          = local_today(auth.uid())
  ),
  new_today as (
    select count(*)::int c from (
      select vocab_id, min(reviewed_at) fs from review_log
      where user_id = auth.uid() group by vocab_id
    ) t
    where (fs at time zone (select timezone from prof))::date = local_today(auth.uid())
  ),
  due as (
    select v.id, v.farsi, v.transliteration, v.english, v.part_of_speech,
           v.present_stem, v.past_stem, v.colloquial, vr.repetitions, false as is_new
    from vocab_reviews vr
    join vocab_items v on v.id = vr.vocab_id
    where vr.user_id = auth.uid() and not vr.suspended
      and vr.due_on <= current_date
    order by vr.due_on
    limit greatest(0, (select daily_review_limit from prof) - (select c from reviews_today))
  ),
  new_cards as (
    select v.id, v.farsi, v.transliteration, v.english, v.part_of_speech,
           v.present_stem, v.past_stem, v.colloquial, 0 as repetitions, true as is_new
    from vocab_items v
    left join lessons l on l.id = v.lesson_id
    where not exists (
      select 1 from vocab_reviews vr
      where vr.vocab_id = v.id and vr.user_id = auth.uid())
    order by l.number nulls last, v.farsi
    limit greatest(0, (select daily_new_limit from prof) - (select c from new_today))
  )
  select * from due union all select * from new_cards;
$$;
```

Note: `get_review_queue` and `grade_card` are `security invoker`, so course-content RLS applies inside them automatically — `vocab_items` rows are already restricted to courses the caller owns. No explicit course filter needed.

- [ ] **Step 4: Apply and verify pass**

```bash
npx supabase db reset && npx supabase test db
```
Expected: 001–004 all `ok` (10/10 in 004).

- [ ] **Step 5: Commit**

```bash
git add supabase && git commit -m "feat: grade_card SM-2, current_streak, get_review_queue SQL functions"
```

---

### Task 6: TypeScript Farsi utilities

**Files:**
- Create: `src/lib/farsi.ts`, `tests/farsi.test.ts`

**Interfaces:**
- Produces (all pure, from `src/lib/farsi.ts`):
  - `toPersianDigits(n: string | number): string`, `toWesternDigits(s: string): string`
  - `faNormalize(s: string): string` — MUST match SQL `fa_normalize` behavior exactly
  - `levenshtein(a: string, b: string): number`
  - `checkTypedAnswer(input: string, expected: string): { verdict: "exact" | "close" | "wrong" }` — compares normalized forms; `close` = levenshtein ≤ 1 (and not exact)
  - `conjugatePresent(presentStem: string): string[]` — six forms `می‌ + stem + [م,ی,د,یم,ید,ند]`, inserting glide `ی` when the stem ends in `ا` or `و` (می‌آیم, می‌گویم)
  - `conjugatePast(pastStem: string): string[]` — six forms `stem + [م,ی,"",یم,ید,ند]` (3sg is the bare stem)
  - `PRONOUNS: string[]` — `['من','تو','او','ما','شما','آنها']`

- [ ] **Step 1: Write failing tests**

`tests/farsi.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  toPersianDigits, toWesternDigits, faNormalize, levenshtein,
  checkTypedAnswer, conjugatePresent, conjugatePast,
} from "../src/lib/farsi";

describe("digits", () => {
  it("converts to Persian digits", () => expect(toPersianDigits(1404)).toBe("۱۴۰۴"));
  it("converts back", () => expect(toWesternDigits("۲۵")).toBe("25"));
});

describe("faNormalize (must mirror SQL fa_normalize)", () => {
  it("maps Arabic yeh/kaf/teh-marbuta", () => {
    expect(faNormalize("علي")).toBe("علی");
    expect(faNormalize("كتاب")).toBe("کتاب");
    expect(faNormalize("مدرسة")).toBe("مدرسه");
  });
  it("strips diacritics", () => expect(faNormalize("کتابِ خوب")).toBe("کتاب خوب"));
  it("ZWNJ becomes space", () => expect(faNormalize("می‌روم")).toBe("می روم"));
  it("collapses whitespace", () => expect(faNormalize("  سلام   دنیا ")).toBe("سلام دنیا"));
});

describe("checkTypedAnswer", () => {
  it("exact after normalization", () =>
    expect(checkTypedAnswer("کتابِ", "کتاب").verdict).toBe("exact"));
  it("ZWNJ vs space is not an error", () =>
    expect(checkTypedAnswer("می روم", "می‌روم").verdict).toBe("exact"));
  it("one letter off = close", () =>
    expect(checkTypedAnswer("کتاپ", "کتاب").verdict).toBe("close"));
  it("two letters off = wrong", () =>
    expect(checkTypedAnswer("کتپپ", "کتاب").verdict).toBe("wrong"));
});

describe("conjugation", () => {
  it("regular present: رو", () =>
    expect(conjugatePresent("رو")).toEqual(["می‌روم","می‌روی","می‌رود","می‌رویم","می‌روید","می‌روند"]));
  it("glide insertion for stem ending in ا: آ", () =>
    expect(conjugatePresent("آ")).toEqual(["می‌آیم","می‌آیی","می‌آید","می‌آییم","می‌آیید","می‌آیند"]));
  it("glide insertion for stem ending in و: گو", () =>
    expect(conjugatePresent("گو")[0]).toBe("می‌گویم");
  );
  it("past: رفت — 3sg is bare stem", () =>
    expect(conjugatePast("رفت")).toEqual(["رفتم","رفتی","رفت","رفتیم","رفتید","رفتند"]));
});

describe("levenshtein", () => {
  it("basic", () => expect(levenshtein("kitten", "sitting")).toBe(3));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test` — Expected: FAIL, cannot resolve `../src/lib/farsi`.

- [ ] **Step 3: Implement**

`src/lib/farsi.ts`:

```ts
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
export const ZWNJ = "‌";
export const PRONOUNS = ["من", "تو", "او", "ما", "شما", "آنها"];

export function toPersianDigits(n: string | number): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function toWesternDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
}

// Mirrors SQL fa_normalize exactly. For search/comparison ONLY — never for display or storage.
export function faNormalize(s: string): string {
  return s
    .replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/ة/g, "ه")
    .replace(/[أإآ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ی")
    .replace(/[ً-ْ]/g, "")
    .replace(/‌/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return dp[m][n];
}

export function checkTypedAnswer(input: string, expected: string) {
  const a = faNormalize(input), b = faNormalize(expected);
  if (a === b) return { verdict: "exact" as const };
  if (levenshtein(a, b) <= 1) return { verdict: "close" as const };
  return { verdict: "wrong" as const };
}

const PRESENT_ENDINGS = ["م", "ی", "د", "یم", "ید", "ند"];
const PAST_ENDINGS = ["م", "ی", "", "یم", "ید", "ند"];

export function conjugatePresent(presentStem: string): string[] {
  const glide = /[او]$/.test(presentStem) ? "ی" : "";
  return PRESENT_ENDINGS.map((e) => `می${ZWNJ}${presentStem}${glide}${e}`);
}

export function conjugatePast(pastStem: string): string[] {
  return PAST_ENDINGS.map((e) => `${pastStem}${e}`);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test` — Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/lib/farsi.ts tests/farsi.test.ts
git commit -m "feat: farsi utils - digits, normalization, answer grading, conjugation"
```

---

### Task 7: Content-package engine + importer (`scripts/seed-lessons.ts`)

**Files:**
- Create: `src/lib/content-package.ts`, `src/lib/import-parsers.ts`, `scripts/seed-lessons.ts`, `tests/import-parsers.test.ts`, `tests/content-package.test.ts`
- Modify: `package.json` (script `"seed": "tsx scripts/seed-lessons.ts"`; `npm i zod`)

**Interfaces:**
- Consumes: `content/lessons/*.md`, `content/vocab.csv`, service role key from `.env.local`.
- Produces (from `src/lib/import-parsers.ts`, pure/testable):
  - `parseLessonFile(filename: string, raw: string): ParsedLesson` where `ParsedLesson = { number: number; unit: number; title: string; slug: string; filename: string; grammar_points: string[]; new_vocab_count: number | null; estimated_minutes: number; is_review: boolean; is_assessment: boolean; body_md: string }`
  - `parseVocabCsv(raw: string): CsvVocabRow[]` where `CsvVocabRow = { lesson: number; farsi: string; translit: string; english: string; pos: string | null; present_stem: string | null; past_stem: string | null; colloquial: string | null }`
  - `parseVocabTables(bodyMd: string): { farsi: string; translit: string; english: string; present_stem?: string }[]` — markdown fallback for lessons missing from the CSV.
- Produces (from `src/lib/content-package.ts` — THE shared import engine, used by the seed script now and `/import` in Task 21):
  - `ContentPackageSchema` — zod schema matching spec §Content packages exactly (`format: "farsi-tracker/content-package"`, `version: 1`, `course.name` required; lessons require `number` + `title`; vocab requires `farsi`/`transliteration`/`english`; exercise `type` enum `en_to_fa|fa_to_en|cloze|scramble`). `type ContentPackage = z.infer<typeof ContentPackageSchema>`.
  - `importContentPackage(supabase: SupabaseClient, ownerId: string, pkg: ContentPackage): Promise<ImportResult>` where `ImportResult = { courseId: string; units: number; lessons: number; vocab: number; exercises: number }`. Merge semantics per spec: course upserted on `(owner_id, name)`; units on `(course_id, number)`; lessons on `(course_id, number)` (slug derived from title via `slugify` when absent); vocab on `(course_id, lesson_id, farsi)`; exercises **replaced per lesson** only when the lesson has an `exercises` array. Sets `profiles.active_course_id` when null. Never touches progress tables.
  - `slugify(title: string): string` — lowercase, non-alphanumeric → `-`, trimmed.

- [ ] **Step 1: Write failing parser tests**

`tests/import-parsers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseLessonFile, parseVocabCsv, parseVocabTables } from "../src/lib/import-parsers";

const FM = `---
lesson: 04
unit: 1
title: Present Tense I
duration: 40 min lesson + 20 min homework
prerequisites: [L01, L02, L03]
grammar: [می- prefix, present stems, personal endings, داشتن exception]
new_vocab: 10 verbs + 8 time words
negar_drill: yes
---

# Lesson 04 — Present Tense I
body here
`;

describe("parseLessonFile", () => {
  const p = parseLessonFile("L04-present-tense-i.md", FM);
  it("core fields", () => {
    expect(p.number).toBe(4);
    expect(p.unit).toBe(1);
    expect(p.title).toBe("Present Tense I");
    expect(p.slug).toBe("present-tense-i");
  });
  it("sums duration minutes", () => expect(p.estimated_minutes).toBe(60));
  it("sums new_vocab numbers", () => expect(p.new_vocab_count).toBe(18));
  it("grammar array preserved", () => expect(p.grammar_points).toHaveLength(4));
  it("flags", () => {
    expect(p.is_review).toBe(false);
    expect(parseLessonFile("L05-saying-no-review1.md", FM).is_review).toBe(true);
    expect(parseLessonFile("L10-simple-past-review2.md", FM).is_assessment).toBe(false); // number from fm (4), not filename
  });
  it("body excludes frontmatter", () => expect(p.body_md).toContain("# Lesson 04"));
});

describe("parseVocabCsv", () => {
  it("handles quoted commas and empty stems", () => {
    const rows = parseVocabCsv(
      'lesson,farsi,translit,english,pos,present_stem,past_stem,colloquial\n' +
      '4,خوردن,khordan,"to eat, to drink",verb,خور,خورد,\n' +
      '1,ممنون,mamnun,thank you,phrase,,,مرسی\n'
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].english).toBe("to eat, to drink");
    expect(rows[0].present_stem).toBe("خور");
    expect(rows[1].present_stem).toBeNull();
    expect(rows[1].colloquial).toBe("مرسی");
  });
});

describe("parseVocabTables", () => {
  it("parses a 3-col vocab table", () => {
    const md = `## 2. Vocabulary\n\n| Farsi | Translit | English |\n|---|---|---|\n| سلام | salâm | hello |\n`;
    expect(parseVocabTables(md)).toEqual([{ farsi: "سلام", translit: "salâm", english: "hello" }]);
  });
  it("parses a verb table with stems", () => {
    const md = `## 1. Grammar\n\n| Infinitive | Meaning | Present stem | 1sg |\n|---|---|---|---|\n| رفتن (raftan) | to go | **رو** rav‑ | می‌روم |\n`;
    expect(parseVocabTables(md)).toEqual([
      { farsi: "رفتن", translit: "raftan", english: "to go", present_stem: "رو" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` — Expected: FAIL, cannot resolve `../src/lib/import-parsers`.

- [ ] **Step 3: Implement parsers**

`src/lib/import-parsers.ts`:

```ts
import yaml from "js-yaml";
import { parse as csvParse } from "csv-parse/sync";

export type ParsedLesson = {
  number: number; unit: number; title: string; slug: string; filename: string;
  grammar_points: string[]; new_vocab_count: number | null; estimated_minutes: number;
  is_review: boolean; is_assessment: boolean; body_md: string;
};

const sumNumbers = (s: string): number =>
  (s.match(/\d+/g) ?? []).reduce((a, n) => a + Number(n), 0);

export function parseLessonFile(filename: string, raw: string): ParsedLesson {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) throw new Error(`${filename}: no YAML frontmatter`);
  // js-yaml v4 load() is the former safeLoad; CORE_SCHEMA pins it to plain data types only
  const fm = yaml.load(m[1], { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>;
  const number = Number(fm.lesson);
  const durations = String(fm.duration ?? "");
  return {
    number,
    unit: Number(fm.unit),
    title: String(fm.title),
    slug: filename.replace(/^L\d+-/, "").replace(/\.md$/i, ""),
    filename,
    grammar_points: Array.isArray(fm.grammar) ? fm.grammar.map(String) : [],
    new_vocab_count: fm.new_vocab != null ? sumNumbers(String(fm.new_vocab)) : null,
    estimated_minutes: durations ? sumNumbers(durations) : 60,
    is_review: /review/i.test(filename),
    is_assessment: number % 10 === 0,
    body_md: raw.slice(m[0].length),
  };
}

export type CsvVocabRow = {
  lesson: number; farsi: string; translit: string; english: string;
  pos: string | null; present_stem: string | null; past_stem: string | null;
  colloquial: string | null;
};

export function parseVocabCsv(raw: string): CsvVocabRow[] {
  const records = csvParse(raw, { columns: true, skip_empty_lines: true, trim: false }) as
    Record<string, string>[];
  const nn = (s: string | undefined) => {
    const v = (s ?? "").trim();
    return v === "" ? null : v;
  };
  return records.map((r) => ({
    lesson: Number(r.lesson),
    farsi: r.farsi.trim(),          // plain spaces only; ZWNJ is U+200C and untouched by trim
    translit: r.translit.trim(),
    english: r.english.trim(),
    pos: nn(r.pos),
    present_stem: nn(r.present_stem),
    past_stem: nn(r.past_stem),
    colloquial: nn(r.colloquial),
  }));
}

export function parseVocabTables(bodyMd: string) {
  const out: { farsi: string; translit: string; english: string; present_stem?: string }[] = [];
  const lines = bodyMd.split(/\r?\n/);
  let header: string[] | null = null;
  for (const line of lines) {
    if (!line.trim().startsWith("|")) { header = null; continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue; // separator row
    if (!header) { header = cells.map((c) => c.toLowerCase()); continue; }

    if (header[0].includes("infinitive")) {
      // | رفتن (raftan) | to go | **رو** rav‑ | می‌روم |
      const im = cells[0].match(/^(\S+)\s*\(([^)]+)\)/);
      const sm = cells[2]?.match(/\*\*(.+?)\*\*/);
      if (im && sm) out.push({
        farsi: im[1], translit: im[2], english: cells[1].replace(/\*/g, "").trim(),
        present_stem: sm[1],
      });
    } else if (
      (header[0].includes("farsi") || header[0].includes("فارسی")) && cells.length >= 3
    ) {
      out.push({ farsi: cells[0], translit: cells[1], english: cells[2] });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Content-package engine with failing tests first**

`tests/content-package.test.ts` (schema-level tests; the DB merge is covered by the seed run in Step 7):

```ts
import { describe, it, expect } from "vitest";
import { ContentPackageSchema, slugify } from "../src/lib/content-package";

const minimal = {
  format: "farsi-tracker/content-package", version: 1,
  course: { name: "Farsi A1" },
  lessons: [{ number: 1, title: "Greetings" }],
};

describe("ContentPackageSchema", () => {
  it("accepts a minimal package", () =>
    expect(ContentPackageSchema.safeParse(minimal).success).toBe(true));
  it("rejects wrong format string", () =>
    expect(ContentPackageSchema.safeParse({ ...minimal, format: "x" }).success).toBe(false));
  it("rejects lesson without number", () => {
    const bad = { ...minimal, lessons: [{ title: "no number" }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
  it("rejects unknown exercise type", () => {
    const bad = { ...minimal, lessons: [{ number: 1, title: "t",
      exercises: [{ type: "multiple_choice", prompt: "p", answer: "a" }] }] };
    expect(ContentPackageSchema.safeParse(bad).success).toBe(false);
  });
});

describe("slugify", () => {
  it("derives clean slugs", () =>
    expect(slugify("Ezâfe — the Persian Glue!")).toBe("ez-fe-the-persian-glue"));
});
```

Run `npm test` (fails) → implement `src/lib/content-package.ts`:

```ts
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const VocabSchema = z.object({
  farsi: z.string().min(1), transliteration: z.string().min(1), english: z.string().min(1),
  part_of_speech: z.string().nullish(), present_stem: z.string().nullish(),
  past_stem: z.string().nullish(), colloquial: z.string().nullish(),
  tags: z.array(z.string()).default([]), notes: z.string().nullish(),
});

const ExerciseSchema = z.object({
  type: z.enum(["en_to_fa", "fa_to_en", "cloze", "scramble"]),
  prompt: z.string().min(1), answer: z.string().min(1),
  accept: z.array(z.string()).default([]), hint: z.string().nullish(),
});

const LessonSchema = z.object({
  number: z.number().int().positive(), title: z.string().min(1),
  unit: z.number().int().positive().nullish(), slug: z.string().nullish(),
  grammar_points: z.array(z.string()).default([]),
  estimated_minutes: z.number().int().positive().default(60),
  is_review: z.boolean().default(false), is_assessment: z.boolean().default(false),
  body_md: z.string().nullish(),
  vocab: z.array(VocabSchema).optional(),
  exercises: z.array(ExerciseSchema).optional(),  // absent = leave existing alone
});

export const ContentPackageSchema = z.object({
  format: z.literal("farsi-tracker/content-package"),
  version: z.literal(1),
  course: z.object({ name: z.string().min(1), description: z.string().nullish() }),
  units: z.array(z.object({
    number: z.number().int().positive(), title: z.string().min(1),
    description: z.string().nullish(),
  })).default([]),
  lessons: z.array(LessonSchema).default([]),
});
export type ContentPackage = z.infer<typeof ContentPackageSchema>;
export type ImportResult = { courseId: string; units: number; lessons: number; vocab: number; exercises: number };

export function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function importContentPackage(
  supabase: SupabaseClient, ownerId: string, pkg: ContentPackage,
): Promise<ImportResult> {
  // course
  const { data: course, error: cErr } = await supabase.from("courses")
    .upsert({ owner_id: ownerId, name: pkg.course.name, description: pkg.course.description ?? null },
      { onConflict: "owner_id,name" })
    .select("id").single();
  if (cErr) throw cErr;
  const courseId = course.id as string;

  // units (explicit + any referenced by lessons)
  const unitNumbers = new Set<number>(pkg.units.map((u) => u.number));
  for (const l of pkg.lessons) if (l.unit) unitNumbers.add(l.unit);
  for (const n of unitNumbers) {
    const explicit = pkg.units.find((u) => u.number === n);
    const { error } = await supabase.from("units").upsert(
      { course_id: courseId, number: n, title: explicit?.title ?? `Unit ${n}`,
        description: explicit?.description ?? null },
      { onConflict: "course_id,number" });
    if (error) throw error;
  }
  const { data: units } = await supabase.from("units").select("id, number").eq("course_id", courseId);
  const unitId = new Map((units ?? []).map((u) => [u.number, u.id]));

  let vocabCount = 0, exCount = 0;
  for (const l of pkg.lessons) {
    const { data: lesson, error: lErr } = await supabase.from("lessons").upsert({
      course_id: courseId, number: l.number, title: l.title,
      slug: l.slug ?? slugify(l.title), unit_id: l.unit ? unitId.get(l.unit) : null,
      grammar_points: l.grammar_points, estimated_minutes: l.estimated_minutes,
      is_review: l.is_review, is_assessment: l.is_assessment,
      new_vocab_count: l.vocab?.length ?? null,
      ...(l.body_md != null ? { body_md: l.body_md } : {}),
    }, { onConflict: "course_id,number" }).select("id").single();
    if (lErr) throw lErr;

    for (const v of l.vocab ?? []) {
      const { error } = await supabase.from("vocab_items").upsert({
        course_id: courseId, lesson_id: lesson.id,
        farsi: v.farsi, transliteration: v.transliteration, english: v.english,
        part_of_speech: v.part_of_speech ?? null, present_stem: v.present_stem ?? null,
        past_stem: v.past_stem ?? null, colloquial: v.colloquial ?? null,
        tags: v.tags, notes: v.notes ?? null,
      }, { onConflict: "course_id,lesson_id,farsi" });
      if (error) throw error;
      vocabCount++;
    }

    if (l.exercises) {  // replace-per-lesson, only when provided
      await supabase.from("exercises").delete().eq("lesson_id", lesson.id);
      if (l.exercises.length) {
        const { error } = await supabase.from("exercises").insert(
          l.exercises.map((e, i) => ({ course_id: courseId, lesson_id: lesson.id,
            position: i + 1, type: e.type, prompt: e.prompt, answer: e.answer,
            accept: e.accept, hint: e.hint ?? null })));
        if (error) throw error;
        exCount += l.exercises.length;
      }
    }
  }

  // first course becomes the active one
  await supabase.from("profiles").update({ active_course_id: courseId })
    .eq("id", ownerId).is("active_course_id", null);

  return { courseId, units: unitNumbers.size, lessons: pkg.lessons.length,
           vocab: vocabCount, exercises: exCount };
}
```

Note: until migration 7 exists (Task 15), the `exercises` delete/insert will error if called with exercises present — the markdown lessons have none yet, so the seed path is safe; Task 15 adds the table before any exercises flow through.

Run: `npm test` — Expected: PASS.

- [ ] **Step 6: Write the seed script (assembles a package, feeds the engine)**

`scripts/seed-lessons.ts`:

```ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseLessonFile, parseVocabCsv, parseVocabTables } from "../src/lib/import-parsers";
import { ContentPackageSchema, importContentPackage } from "../src/lib/content-package";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const OWNER_EMAIL = process.argv.includes("--user")
  ? process.argv[process.argv.indexOf("--user") + 1]
  : "mag@saf.com";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data: owner, error: oErr } = await supabase.from("profiles")
    .select("id").eq("email", OWNER_EMAIL).single();
  if (oErr || !owner) throw new Error(`no profile for ${OWNER_EMAIL} — sign that user up first`);

  const dir = "content/lessons";
  const files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();
  const parsed = files.map((f) => parseLessonFile(f, readFileSync(join(dir, f), "utf8")));
  const csvRows = existsSync("content/vocab.csv")
    ? parseVocabCsv(readFileSync("content/vocab.csv", "utf8")) : [];
  const csvLessons = new Set(csvRows.map((r) => r.lesson));

  const pkg = ContentPackageSchema.parse({
    format: "farsi-tracker/content-package",
    version: 1,
    course: { name: "Farsi", description: "Structured Farsi curriculum, generated lessons" },
    units: [...new Set(parsed.map((l) => l.unit))].map((n) => ({ number: n, title: `Unit ${n}` })),
    lessons: parsed.map((l) => ({
      number: l.number, title: l.title, unit: l.unit, slug: l.slug,
      grammar_points: l.grammar_points, estimated_minutes: l.estimated_minutes,
      is_review: l.is_review, is_assessment: l.is_assessment, body_md: l.body_md,
      vocab: csvLessons.has(l.number)
        ? csvRows.filter((r) => r.lesson === l.number).map((r) => ({
            farsi: r.farsi, transliteration: r.translit, english: r.english,
            part_of_speech: r.pos, present_stem: r.present_stem,
            past_stem: r.past_stem, colloquial: r.colloquial }))
        : parseVocabTables(l.body_md).map((v) => ({
            farsi: v.farsi, transliteration: v.translit, english: v.english,
            part_of_speech: v.present_stem ? "verb" : null,
            present_stem: v.present_stem ?? null })),
    })),
  });

  const r = await importContentPackage(supabase, owner.id, pkg);
  console.log(`Imported course ${r.courseId}: ${r.lessons} lessons, ${r.units} units, ${r.vocab} vocab, ${r.exercises} exercises.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Add to `package.json` scripts: `"seed": "tsx scripts/seed-lessons.ts"`.
Prerequisite for running: the owner profile must exist — the Task 8 Step 3 command creates `mag@saf.com` locally. If running Task 7 before Task 8, run that `node -e "...createUser..."` one-liner from Task 8 Step 3 first.

- [ ] **Step 7: Run against local, verify idempotency**

```bash
npm run seed          # Expected: "Imported course <uuid>: 10 lessons, 1 units, ~190 vocab, 0 exercises."
npm run seed          # run again — same counts, no errors, no duplicates:
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -c "select count(*) from vocab_items; select count(*) from lessons; select name, owner_id from courses;"
```
Expected: vocab count unchanged after the second run (~190), lessons = 10, one course named "Farsi".

- [ ] **Step 8: Commit**

```bash
git add scripts src/lib/import-parsers.ts src/lib/content-package.ts tests package.json
git commit -m "feat: content-package engine and idempotent markdown/CSV seed importer"
```

---

### Task 8: Auth plumbing (magic link + Google + dev password)

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/signout/route.ts`

**Interfaces:**
- Produces:
  - `createClient()` (server, from `src/lib/supabase/server.ts`) — async, cookie-bound server client. Every server component/action uses this.
  - `createBrowserClient()` (from `src/lib/supabase/client.ts`)
  - Middleware redirects unauthenticated requests to `/login` (except `/login`, `/auth/*`, `/api/unsubscribe`).
  - Login page: magic-link email form + "Sign in with Google" + a password form shown only when `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=true` (local dev + e2e).

- [ ] **Step 1: Supabase clients** (patterns from @supabase/ssr docs)

`src/lib/supabase/client.ts`:

```ts
import { createBrowserClient as createSSRBrowserClient } from "@supabase/ssr";

export function createBrowserClient() {
  return createSSRBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

`src/lib/supabase/server.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cs) => {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* called from a Server Component — middleware refreshes sessions */ }
        },
      },
    },
  );
}
```

`src/lib/supabase/middleware.ts`:

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [/^\/login/, /^\/auth\//, /^\/api\/unsubscribe/];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cs) => {
          cs.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cs.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if (!user && !PUBLIC_PATHS.some((re) => re.test(path))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return response;
}
```

`src/middleware.ts`:

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|woff2)$).*)"],
};
```

- [ ] **Step 2: Login page + auth routes**

`src/app/login/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  async function magicLink(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { emailRedirectTo: `${site}/auth/callback` },
    });
    setMsg(error ? error.message : "Check your email for the sign-in link.");
  }
  async function google() {
    await supabase.auth.signInWithOAuth({
      provider: "google", options: { redirectTo: `${site}/auth/callback` },
    });
  }
  async function passwordLogin(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMsg(error.message); else window.location.href = "/";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">Farsi Tracker</h1>
      <form onSubmit={magicLink} className="flex flex-col gap-3">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com" className="rounded border p-3" />
        <button className="rounded bg-black p-3 text-white">Send magic link</button>
      </form>
      <button onClick={google} className="rounded border p-3">Sign in with Google</button>
      {process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true" && (
        <form onSubmit={passwordLogin} className="flex flex-col gap-3 border-t pt-4">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="password (dev only)" className="rounded border p-3" />
          <button className="rounded border p-3">Password sign-in</button>
        </form>
      )}
      {msg && <p className="text-sm text-gray-600">{msg}</p>}
    </main>
  );
}
```

`src/app/auth/callback/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(origin);
}
```

`src/app/auth/signout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 302 });
}
```

- [ ] **Step 3: Create a local test user and verify the flow**

```bash
# create a confirmed user with a password against LOCAL supabase (service role via psql-free path):
node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split(/\r?\n/).map(l=>l.split('=')));
createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  .auth.admin.createUser({ email: 'mag@saf.com', password: 'localdev123', email_confirm: true })
  .then(r => console.log(r.error ?? 'created ' + r.data.user.email));
"
npm run dev
```

Manual check: visiting `http://localhost:3000` redirects to `/login`; password sign-in with `mag@saf.com` / `localdev123` lands on `/`; magic-link emails appear in Mailpit at `http://127.0.0.1:54324`. (Google OAuth is configured at deploy time, Task 17 — the button will error locally; that's expected.)

- [ ] **Step 4: Build + commit**

Run: `npm run build` — Expected: compiles.

```bash
git add src/lib/supabase src/middleware.ts src/app/login src/app/auth
git commit -m "feat: supabase auth - magic link, google, dev password login, route protection"
```

---

### Task 9: `FarsiText` tri-state toggle + `FaKeyboard` components

**Files:**
- Create: `src/components/FarsiText.tsx`, `src/components/FaKeyboard.tsx`, `tests/farsi-text.test.tsx`, `tests/fa-keyboard.test.tsx`

**Interfaces:**
- Produces:
  - `FarsiText({ farsi, translit, english, locked = false, className }: { farsi: string; translit?: string | null; english?: string | null; locked?: boolean; className?: string })` — client component. Renders Persian script by default (via `Fa`); each click cycles script → transliteration (LTR, italic) → English → script. Skips missing stages. `locked` disables cycling (used by `/review` prompts pre-reveal). Cursor-pointer + `title="click to toggle"` affordance when unlockable.
  - `FaKeyboard({ onKey, onBackspace }: { onKey: (ch: string) => void; onBackspace: () => void })` — client component, standard Persian 3-row layout plus a fourth row with **نیم‌فاصله** (ZWNJ, U+200C), space, and ⌫. Buttons `type="button"` and `onMouseDown={e => e.preventDefault()}` so the bound input keeps focus. Min touch target 40px.

- [ ] **Step 1: Write failing tests**

`tests/farsi-text.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FarsiText } from "../src/components/FarsiText";

describe("FarsiText", () => {
  it("cycles farsi -> translit -> english -> farsi on click", () => {
    const { getByRole } = render(<FarsiText farsi="کتاب" translit="ketâb" english="book" />);
    const el = getByRole("button");
    expect(el.textContent).toBe("کتاب");
    fireEvent.click(el);
    expect(el.textContent).toBe("ketâb");
    fireEvent.click(el);
    expect(el.textContent).toBe("book");
    fireEvent.click(el);
    expect(el.textContent).toBe("کتاب");
  });
  it("skips missing translit", () => {
    const { getByRole } = render(<FarsiText farsi="کتاب" english="book" />);
    fireEvent.click(getByRole("button"));
    expect(getByRole("button").textContent).toBe("book");
  });
  it("locked does not cycle", () => {
    const { getByText } = render(<FarsiText farsi="کتاب" english="book" locked />);
    fireEvent.click(getByText("کتاب"));
    expect(getByText("کتاب")).toBeTruthy();
  });
  it("farsi stage is RTL with lang=fa", () => {
    const { container } = render(<FarsiText farsi="کتاب" english="book" />);
    const span = container.querySelector('span[dir="rtl"]')!;
    expect(span.getAttribute("lang")).toBe("fa");
  });
});
```

`tests/fa-keyboard.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FaKeyboard } from "../src/components/FaKeyboard";

describe("FaKeyboard", () => {
  it("emits characters, ZWNJ, space, backspace", () => {
    const onKey = vi.fn(); const onBackspace = vi.fn();
    const { getByText, getByLabelText } = render(
      <FaKeyboard onKey={onKey} onBackspace={onBackspace} />);
    fireEvent.click(getByText("ک"));
    expect(onKey).toHaveBeenCalledWith("ک");
    fireEvent.click(getByText("نیم‌فاصله"));
    expect(onKey).toHaveBeenCalledWith("‌");
    fireEvent.click(getByLabelText("space"));
    expect(onKey).toHaveBeenCalledWith(" ");
    fireEvent.click(getByLabelText("backspace"));
    expect(onBackspace).toHaveBeenCalled();
  });
  it("renders all 32 Persian letters", () => {
    const { getByText } = render(<FaKeyboard onKey={() => {}} onBackspace={() => {}} />);
    for (const ch of "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی") expect(getByText(ch)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` — Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`src/components/FarsiText.tsx`:

```tsx
"use client";
import { useState } from "react";

type Props = {
  farsi: string; translit?: string | null; english?: string | null;
  locked?: boolean; className?: string;
};

export function FarsiText({ farsi, translit, english, locked = false, className = "" }: Props) {
  const stages = [
    { key: "fa", text: farsi },
    ...(translit ? [{ key: "tr", text: translit }] : []),
    ...(english ? [{ key: "en", text: english }] : []),
  ];
  const [i, setI] = useState(0);
  const stage = stages[i % stages.length];
  const cyclable = !locked && stages.length > 1;

  const inner = stage.key === "fa"
    ? <span dir="rtl" lang="fa" className="font-fa">{stage.text}</span>
    : <span className={stage.key === "tr" ? "italic" : ""}>{stage.text}</span>;

  if (!cyclable) return <span className={className}>{inner}</span>;
  return (
    <span role="button" tabIndex={0} title="click to toggle"
      className={`cursor-pointer select-none ${className}`}
      onClick={() => setI((v) => v + 1)}
      onKeyDown={(e) => { if (e.key === "Enter") setI((v) => v + 1); }}>
      {inner}
    </span>
  );
}
```

`src/components/FaKeyboard.tsx`:

```tsx
"use client";

const ROWS = [
  ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "چ"],
  ["ش", "س", "ی", "ب", "ل", "ا", "ت", "ن", "م", "ک", "گ"],
  ["ظ", "ط", "ز", "ر", "ذ", "د", "پ", "و", "ژ", "آ"],
];

export function FaKeyboard({ onKey, onBackspace }:
  { onKey: (ch: string) => void; onBackspace: () => void }) {
  const btn = "min-w-10 min-h-10 rounded border bg-white px-2 text-lg font-fa active:bg-gray-200";
  const stop = (e: React.MouseEvent) => e.preventDefault(); // keep input focus
  return (
    <div dir="rtl" className="flex flex-col items-center gap-1 select-none" aria-label="Persian keyboard">
      {ROWS.map((row, ri) => (
        <div key={ri} className="flex gap-1">
          {row.map((ch) => (
            <button key={ch} type="button" className={btn}
              onMouseDown={stop} onClick={() => onKey(ch)}>{ch}</button>
          ))}
        </div>
      ))}
      <div className="flex gap-1">
        <button type="button" className={`${btn} text-sm`} onMouseDown={stop}
          onClick={() => onKey("‌")}>نیم‌فاصله</button>
        <button type="button" aria-label="space" className={`${btn} w-40`}
          onMouseDown={stop} onClick={() => onKey(" ")} />
        <button type="button" aria-label="backspace" className={btn}
          onMouseDown={stop} onClick={onBackspace}>⌫</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FarsiText.tsx src/components/FaKeyboard.tsx tests/farsi-text.test.tsx tests/fa-keyboard.test.tsx
git commit -m "feat: FarsiText tri-state toggle and on-screen Persian keyboard"
```

---

### Task 10: App shell (nav) + `/settings`

**Files:**
- Create: `src/components/Nav.tsx`, `src/app/settings/page.tsx`, `src/app/settings/actions.ts`
- Modify: `src/app/layout.tsx` (render `Nav` when signed in)

**Interfaces:**
- Consumes: `createClient()` from Task 8.
- Produces: `updateSettings(formData: FormData)` server action updating `profiles` (timezone, daily_email_enabled, daily_email_hour, target_lessons_per_week, daily_new_limit, daily_review_limit). Nav with links: Dashboard, Review, Flashcards, Lessons, Vocab, Progress, Settings + sign-out button.

- [ ] **Step 1: Nav component**

`src/components/Nav.tsx`:

```tsx
import Link from "next/link";

const LINKS = [
  ["/", "Dashboard"], ["/review", "Review"], ["/flashcards", "Flashcards"],
  ["/lessons", "Lessons"], ["/vocab", "Vocab"], ["/progress", "Progress"],
  ["/settings", "Settings"],
] as const;

export function Nav() {
  return (
    <nav className="flex flex-wrap items-center gap-4 border-b p-4 text-sm">
      {LINKS.map(([href, label]) => (
        <Link key={href} href={href} className="hover:underline">{label}</Link>
      ))}
      <form action="/auth/signout" method="post" className="ml-auto">
        <button className="text-gray-500 hover:underline">Sign out</button>
      </form>
    </nav>
  );
}
```

In `src/app/layout.tsx`, render `<Nav />` above `{children}` only when a user exists (make the layout `async`, call `createClient()` → `supabase.auth.getUser()`).

- [ ] **Step 2: Settings page + action**

`src/app/settings/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const int = (k: string, lo: number, hi: number, dflt: number) => {
    const v = Number(formData.get(k));
    return Number.isInteger(v) && v >= lo && v <= hi ? v : dflt;
  };
  const { error } = await supabase.from("profiles").update({
    timezone: String(formData.get("timezone") || "America/New_York"),
    daily_email_enabled: formData.get("daily_email_enabled") === "on",
    daily_email_hour: int("daily_email_hour", 0, 23, 7),
    target_lessons_per_week: int("target_lessons_per_week", 1, 21, 5),
    daily_new_limit: int("daily_new_limit", 0, 200, 20),
    daily_review_limit: int("daily_review_limit", 0, 1000, 120),
  }).eq("id", user.id);
  if (error) throw error;
  revalidatePath("/settings");
}
```

`src/app/settings/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { updateSettings } from "./actions";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: p } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
  const field = "flex items-center justify-between gap-4";
  const input = "w-48 rounded border p-2";
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-2xl font-bold">Settings</h1>
      <form action={updateSettings} className="flex flex-col gap-4">
        <label className={field}>Timezone (IANA)
          <input name="timezone" defaultValue={p.timezone} className={input} /></label>
        <label className={field}>Daily reminder email
          <input type="checkbox" name="daily_email_enabled" defaultChecked={p.daily_email_enabled} /></label>
        <label className={field}>Delivery hour (0–23, local)
          <input type="number" name="daily_email_hour" min={0} max={23}
            defaultValue={p.daily_email_hour} className={input} /></label>
        <label className={field}>Lessons per week target
          <input type="number" name="target_lessons_per_week" min={1} max={21}
            defaultValue={p.target_lessons_per_week} className={input} /></label>
        <label className={field}>New cards per day
          <input type="number" name="daily_new_limit" min={0} max={200}
            defaultValue={p.daily_new_limit} className={input} /></label>
        <label className={field}>Reviews per day
          <input type="number" name="daily_review_limit" min={0} max={1000}
            defaultValue={p.daily_review_limit} className={input} /></label>
        <button className="rounded bg-black p-3 text-white">Save</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verify manually + build**

Run: `npm run dev` — sign in, change delivery hour to 8, save, reload: value persists.
Run: `npm run build` — Expected: compiles.

- [ ] **Step 4: Commit**

```bash
git add src/components/Nav.tsx src/app/settings src/app/layout.tsx
git commit -m "feat: nav shell and settings page with profile-backed server action"
```

---

### Task 11: Review engine — direction picker + offline grade queue

**Files:**
- Create: `src/lib/directions.ts`, `src/lib/grade-queue.ts`, `tests/directions.test.ts`, `tests/grade-queue.test.ts`

**Interfaces:**
- Consumes: `grade_card` RPC (Task 5), types from Task 5's `get_review_queue` row shape.
- Produces:
  - `type Direction = "fa_to_en" | "en_to_fa" | "stem"` and `pickDirection(partOfSpeech: string | null, repetitions: number): Direction` — `fa_to_en` until 2 successful repetitions; then verbs cycle `stem → fa_to_en → en_to_fa` (by `repetitions % 3`, stem first — stems matter most), non-verbs alternate `fa_to_en`/`en_to_fa` (by `repetitions % 2`).
  - `type PendingGrade = { id: string; vocabId: string; grade: number; direction: Direction; msTaken: number; ts: number }`
  - `class GradeQueue { constructor(store: KVStore, rpc: (g: PendingGrade) => Promise<void>); enqueue(g: Omit<PendingGrade,"id">): Promise<void>; flush(): Promise<{ sent: number; remaining: number }>; pendingCount(): Promise<number> }` where `KVStore = { get(k: string): Promise<PendingGrade[] | undefined>; set(k: string, v: PendingGrade[]): Promise<void> }`. `enqueue` persists first, then attempts `flush()`. `flush` sends FIFO, stops at first failure (keeps the rest), never throws.
  - `makeIdbStore(): KVStore` (idb-keyval-backed) and `makeGradeRpc(supabase)` → calls `supabase.rpc("grade_card", { p_vocab_id, p_grade, p_direction, p_ms_taken })`.

- [ ] **Step 1: Write failing tests**

`tests/directions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pickDirection } from "../src/lib/directions";

describe("pickDirection", () => {
  it("recognition until 2 reps", () => {
    expect(pickDirection("noun", 0)).toBe("fa_to_en");
    expect(pickDirection("verb", 1)).toBe("fa_to_en");
  });
  it("non-verbs alternate after unlock", () => {
    expect(pickDirection("noun", 2)).toBe("fa_to_en");
    expect(pickDirection("noun", 3)).toBe("en_to_fa");
  });
  it("verbs cycle with stem first", () => {
    expect(pickDirection("verb", 2)).toBe("stem");
    expect(pickDirection("verb", 3)).toBe("fa_to_en");
    expect(pickDirection("verb", 4)).toBe("en_to_fa");
    expect(pickDirection("verb", 5)).toBe("stem");
  });
});
```

`tests/grade-queue.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { GradeQueue, type PendingGrade, type KVStore } from "../src/lib/grade-queue";

function memStore(): KVStore {
  const m = new Map<string, PendingGrade[]>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}
const grade = { vocabId: "v1", grade: 4, direction: "fa_to_en" as const, msTaken: 900, ts: 1 };

describe("GradeQueue", () => {
  it("enqueue persists then flushes to rpc", async () => {
    const rpc = vi.fn().mockResolvedValue(undefined);
    const q = new GradeQueue(memStore(), rpc);
    await q.enqueue(grade);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(await q.pendingCount()).toBe(0);
  });
  it("keeps grades when rpc fails, resends on next flush", async () => {
    const rpc = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const q = new GradeQueue(memStore(), rpc);
    await q.enqueue(grade);                    // fails silently, stays queued
    expect(await q.pendingCount()).toBe(1);
    const r = await q.flush();                 // network back
    expect(r).toEqual({ sent: 1, remaining: 0 });
  });
  it("flush stops at first failure, preserves order", async () => {
    const rpc = vi.fn()
      .mockRejectedValue(new Error("offline"));
    const q = new GradeQueue(memStore(), rpc);
    await q.enqueue(grade);
    await q.enqueue({ ...grade, vocabId: "v2" });
    expect(await q.pendingCount()).toBe(2);
    rpc.mockResolvedValue(undefined);
    const r = await q.flush();
    expect(r.sent).toBe(2);
    expect(rpc.mock.calls.map((c) => c[0].vocabId).slice(-2)).toEqual(["v1", "v2"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` — Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`src/lib/directions.ts`:

```ts
export type Direction = "fa_to_en" | "en_to_fa" | "stem";

export function pickDirection(partOfSpeech: string | null, repetitions: number): Direction {
  if (repetitions < 2) return "fa_to_en";
  if (partOfSpeech === "verb")
    return (["stem", "fa_to_en", "en_to_fa"] as const)[repetitions % 3];
  return repetitions % 2 === 0 ? "fa_to_en" : "en_to_fa";
}
```

`src/lib/grade-queue.ts`:

```ts
import { get as idbGet, set as idbSet } from "idb-keyval";
import type { Direction } from "./directions";

export type PendingGrade = {
  id: string; vocabId: string; grade: number; direction: Direction;
  msTaken: number; ts: number;
};
export type KVStore = {
  get(k: string): Promise<PendingGrade[] | undefined>;
  set(k: string, v: PendingGrade[]): Promise<void>;
};

const KEY = "pending-grades";

export function makeIdbStore(): KVStore {
  return { get: (k) => idbGet(k), set: (k, v) => idbSet(k, v) };
}

export function makeGradeRpc(supabase: {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
}) {
  return async (g: PendingGrade) => {
    const { error } = await supabase.rpc("grade_card", {
      p_vocab_id: g.vocabId, p_grade: g.grade,
      p_direction: g.direction, p_ms_taken: g.msTaken,
    });
    if (error) throw error;
  };
}

export class GradeQueue {
  #flushing = false;
  constructor(
    private store: KVStore,
    private rpc: (g: PendingGrade) => Promise<void>,
  ) {}

  async enqueue(g: Omit<PendingGrade, "id">): Promise<void> {
    const list = (await this.store.get(KEY)) ?? [];
    list.push({ ...g, id: crypto.randomUUID() });
    await this.store.set(KEY, list);
    await this.flush();
  }

  async flush(): Promise<{ sent: number; remaining: number }> {
    if (this.#flushing) return { sent: 0, remaining: await this.pendingCount() };
    this.#flushing = true;
    let sent = 0;
    try {
      let list = (await this.store.get(KEY)) ?? [];
      while (list.length > 0) {
        try { await this.rpc(list[0]); }
        catch { break; }                    // offline / error: keep everything from here
        list = list.slice(1);
        await this.store.set(KEY, list);
        sent++;
      }
      return { sent, remaining: list.length };
    } finally { this.#flushing = false; }
  }

  async pendingCount(): Promise<number> {
    return ((await this.store.get(KEY)) ?? []).length;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/directions.ts src/lib/grade-queue.ts tests/directions.test.ts tests/grade-queue.test.ts
git commit -m "feat: direction rotation and offline-tolerant IndexedDB grade queue"
```

---

### Task 12: `/review` screen

**Files:**
- Create: `src/app/review/page.tsx`, `src/components/ReviewSession.tsx`

**Interfaces:**
- Consumes: `get_review_queue` RPC row shape (Task 5), `pickDirection`, `GradeQueue`/`makeIdbStore`/`makeGradeRpc` (Task 11), `checkTypedAnswer`/`conjugatePresent`/`conjugatePast`/`toPersianDigits` (Task 6), `FarsiText`, `FaKeyboard` (Task 9), `createBrowserClient` (Task 8).
- Produces: keyboard-driven review session. Space = reveal, 1/2/3/4 = Again/Hard/Good/Easy (grades 1/3/4/5). Production (`en_to_fa`) and `stem` cards show a text input + `FaKeyboard`; Enter submits, `checkTypedAnswer` verdict pre-selects the grade (`exact` → free choice defaulting Good, `close` → capped at Hard(3) with "close — check the spelling", `wrong` → Again preselected). All grades go through `GradeQueue` (never block the UI on network). Ends with a summary (counts by grade, pending-sync count).

- [ ] **Step 1: Server page — fetch queue once**

`src/app/review/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { ReviewSession, type QueueCard } from "@/components/ReviewSession";

export default async function ReviewPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_review_queue");
  if (error) throw new Error(error.message);
  return <ReviewSession initialQueue={(data ?? []) as QueueCard[]} />;
}
```

- [ ] **Step 2: The session component**

`src/components/ReviewSession.tsx`:

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { pickDirection, type Direction } from "@/lib/directions";
import { GradeQueue, makeIdbStore, makeGradeRpc } from "@/lib/grade-queue";
import { checkTypedAnswer, conjugatePresent, conjugatePast, toPersianDigits } from "@/lib/farsi";
import { FarsiText } from "./FarsiText";
import { FaKeyboard } from "./FaKeyboard";

export type QueueCard = {
  vocab_id: string; farsi: string; transliteration: string; english: string;
  part_of_speech: string | null; present_stem: string | null; past_stem: string | null;
  colloquial: string | null; repetitions: number; is_new: boolean;
};

const GRADES = [
  { key: "1", label: "Again", grade: 1 }, { key: "2", label: "Hard", grade: 3 },
  { key: "3", label: "Good", grade: 4 }, { key: "4", label: "Easy", grade: 5 },
] as const;

export function ReviewSession({ initialQueue }: { initialQueue: QueueCard[] }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const queue = useMemo(
    () => new GradeQueue(makeIdbStore(), makeGradeRpc(supabase)), [supabase]);
  const [i, setI] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState<"exact" | "close" | "wrong" | null>(null);
  const [tally, setTally] = useState<Record<number, number>>({});
  const [pending, setPending] = useState(0);
  const shownAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  const card = initialQueue[i];
  const direction: Direction | null =
    card ? pickDirection(card.part_of_speech, card.repetitions) : null;
  const typedCard = direction === "en_to_fa" || direction === "stem";
  const expected = !card ? "" : direction === "stem" ? (card.present_stem ?? "") : card.farsi;

  useEffect(() => {
    setRevealed(false); setTyped(""); setVerdict(null);
    shownAt.current = Date.now();
    queue.pendingCount().then(setPending);
    if (typedCard) inputRef.current?.focus();
  }, [i, queue, typedCard]);

  useEffect(() => {
    const onOnline = () => queue.flush().then(() => queue.pendingCount().then(setPending));
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [queue]);

  function submitTyped() {
    if (!card) return;
    setVerdict(checkTypedAnswer(typed, expected).verdict);
    setRevealed(true);
  }

  async function grade(g: number) {
    if (!card || !revealed || !direction) return;
    // near-miss on typed cards caps the grade at 3 (spec: SRS algorithm section)
    const finalGrade = verdict === "close" ? Math.min(g, 3) : verdict === "wrong" ? Math.min(g, 1) : g;
    await queue.enqueue({
      vocabId: card.vocab_id, grade: finalGrade, direction,
      msTaken: Date.now() - shownAt.current, ts: Date.now(),
    });
    setTally((t) => ({ ...t, [finalGrade]: (t[finalGrade] ?? 0) + 1 }));
    setI((v) => v + 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) {
        if (e.key === "Enter" && !revealed) submitTyped();
        return;
      }
      if (e.key === " " && !revealed && !typedCard) { e.preventDefault(); setRevealed(true); }
      const g = GRADES.find((x) => x.key === e.key);
      if (g && revealed) grade(g.grade);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!card) {
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="text-2xl font-bold">Session done</h1>
        <p className="mt-2">{total} cards reviewed.</p>
        <ul className="mt-4 text-sm text-gray-600">
          {GRADES.map((g) => <li key={g.grade}>{g.label}: {tally[g.grade] ?? 0}</li>)}
        </ul>
        {pending > 0 && <p className="mt-4 text-amber-600">{pending} grades queued offline — will sync when online.</p>}
      </main>
    );
  }

  // fixed heights prevent layout shift on reveal
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="h-2 w-full rounded bg-gray-200">
        <div className="h-2 rounded bg-black" style={{ width: `${(i / initialQueue.length) * 100}%` }} />
      </div>
      <p className="text-xs text-gray-400">
        {i + 1}/{initialQueue.length}{card.is_new && " · new"}{pending > 0 && ` · ${pending} unsynced`}
      </p>

      <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded border p-6 text-3xl">
        {direction === "fa_to_en" && <FarsiText farsi={card.farsi} translit={card.transliteration} english={card.english} locked={!revealed} />}
        {direction === "en_to_fa" && <span className="text-2xl">{card.english}</span>}
        {direction === "stem" && (
          <span className="text-2xl">present stem of <FarsiText farsi={card.farsi} translit={card.transliteration} english={card.english} locked={!revealed} /></span>
        )}
      </div>

      <div className="min-h-40">
        {!revealed && typedCard && (
          <div className="flex flex-col gap-2">
            <input ref={inputRef} dir="rtl" lang="fa" value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="rounded border p-3 text-2xl font-fa" autoComplete="off" />
            <FaKeyboard onKey={(ch) => setTyped((t) => t + ch)}
              onBackspace={() => setTyped((t) => t.slice(0, -1))} />
            <button onClick={submitTyped} className="rounded bg-black p-3 text-white">Check</button>
          </div>
        )}
        {!revealed && !typedCard && (
          <button onClick={() => setRevealed(true)} className="w-full rounded border p-3">
            Reveal <span className="text-gray-400">(space)</span>
          </button>
        )}
        {revealed && (
          <div className="flex flex-col gap-3">
            <div className="text-center text-xl">
              {direction === "fa_to_en" && <p>{card.english}{card.colloquial && <> · spoken: <FarsiText farsi={card.colloquial} /></>}</p>}
              {direction === "en_to_fa" && <FarsiText farsi={card.farsi} translit={card.transliteration} />}
              {direction === "stem" && card.present_stem && (
                <div>
                  <FarsiText farsi={card.present_stem} />
                  <p dir="rtl" lang="fa" className="font-fa mt-2 text-base text-gray-600">
                    {conjugatePresent(card.present_stem).join(" · ")}
                  </p>
                  {card.past_stem && (
                    <p dir="rtl" lang="fa" className="font-fa text-base text-gray-500">
                      {conjugatePast(card.past_stem).join(" · ")}
                    </p>
                  )}
                </div>
              )}
              {verdict === "close" && <p className="mt-1 text-sm text-amber-600">close — check the spelling</p>}
              {verdict === "wrong" && <p className="mt-1 text-sm text-red-600">not quite</p>}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {GRADES.map((g) => (
                <button key={g.grade} onClick={() => grade(g.grade)}
                  className="min-h-12 rounded border p-2 text-sm active:bg-gray-200">
                  {g.label}<br /><span className="text-gray-400">{g.key}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev` → `/review`. Check: cards appear (new cards from seeded vocab, capped at 20); space reveals; 1–4 grades and advances instantly with no layout shift; a verb at repetitions ≥ 2 shows the stem card with the six-form conjugation on reveal; DevTools → Network offline → grading still advances, "unsynced" counter grows; back online → counter clears. `select count(*) from review_log;` in psql grows accordingly.

- [ ] **Step 4: Build + commit**

Run: `npm run build` — Expected: compiles.

```bash
git add src/app/review src/components/ReviewSession.tsx
git commit -m "feat: keyboard-driven review screen with typed production cards and offline sync"
```

---

### Task 13: `/flashcards` — cram mode from learned lessons

**Files:**
- Create: `src/app/flashcards/page.tsx`, `src/components/FlashcardDeck.tsx`, `tests/flashcard-deck.test.tsx`

**Interfaces:**
- Consumes: `FarsiText` (Task 9), `conjugatePresent`/`conjugatePast`/`PRONOUNS` (Task 6), `createClient` (Task 8).
- Produces:
  - Server page: "learned lessons" = lessons with a `lesson_completions` row for this user, **plus the first uncompleted lesson** (the one in progress). Renders lesson checkboxes + deck-type radio (`vocabulary` | `conjugations`), then `FlashcardDeck`.
  - `FlashcardDeck({ cards }: { cards: DeckCard[] })` where `DeckCard = { id: string; farsi: string; translit: string; english: string; kind: "vocab" } | { id: string; farsi: string; translit: string; english: string; kind: "verb"; presentStem: string; pastStem: string | null }`. Vocab cards flip via `FarsiText` cycling. Verb cards show the infinitive; flipping reveals the full conjugation table (pronoun + present + past columns). Space flips, ←/→ navigate, `s` shuffles. **No SRS writes** — pure cram.
  - `shuffle<T>(arr: T[], seed: number): T[]` exported from `FlashcardDeck.tsx` — deterministic Fisher–Yates (mulberry32 PRNG) so it's testable.

- [ ] **Step 1: Write failing test**

`tests/flashcard-deck.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FlashcardDeck, shuffle } from "../src/components/FlashcardDeck";

const cards = [
  { id: "1", farsi: "کتاب", translit: "ketâb", english: "book", kind: "vocab" as const },
  { id: "2", farsi: "رفتن", translit: "raftan", english: "to go", kind: "verb" as const,
    presentStem: "رو", pastStem: "رفت" },
];

describe("shuffle", () => {
  it("is deterministic for a seed and keeps all items", () => {
    const a = shuffle([1, 2, 3, 4, 5], 42);
    expect(a).toEqual(shuffle([1, 2, 3, 4, 5], 42));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("FlashcardDeck", () => {
  it("navigates with arrows and shows verb conjugations on flip", () => {
    const { container, getByText } = render(<FlashcardDeck cards={cards} />);
    expect(getByText("کتاب")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowRight" });     // -> verb card
    expect(getByText("رفتن")).toBeTruthy();
    fireEvent.keyDown(window, { key: " " });              // flip
    expect(getByText("می‌روم")).toBeTruthy();              // present 1sg
    expect(getByText("رفتم")).toBeTruthy();                // past 1sg
    expect(container.textContent).toContain("من");
  });
  it("counter uses positions", () => {
    const { getByText } = render(<FlashcardDeck cards={cards} />);
    expect(getByText(/1\s*\/\s*2/)).toBeTruthy();
  });
});
```

Note: `FlashcardDeck` must render cards **unshuffled** initially (shuffle only on `s` key / Shuffle button) so this test is deterministic.

- [ ] **Step 2: Run to verify failure**

Run: `npm test` — Expected: FAIL, module missing.

- [ ] **Step 3: Implement deck component**

`src/components/FlashcardDeck.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { FarsiText } from "./FarsiText";
import { conjugatePresent, conjugatePast, PRONOUNS } from "@/lib/farsi";

export type DeckCard =
  | { id: string; farsi: string; translit: string; english: string; kind: "vocab" }
  | { id: string; farsi: string; translit: string; english: string; kind: "verb";
      presentStem: string; pastStem: string | null };

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], seed: number): T[] {
  const rnd = mulberry32(seed); const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function FlashcardDeck({ cards: initial }: { cards: DeckCard[] }) {
  const [cards, setCards] = useState(initial);
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === " ") { e.preventDefault(); setFlipped((f) => !f); }
      if (e.key === "ArrowRight") { setI((v) => Math.min(v + 1, cards.length - 1)); setFlipped(false); }
      if (e.key === "ArrowLeft") { setI((v) => Math.max(v - 1, 0)); setFlipped(false); }
      if (e.key === "s") { setCards((c) => shuffle(c, Date.now() & 0xffff)); setI(0); setFlipped(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  if (!card) return <p className="p-6 text-gray-500">No cards in this deck.</p>;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-xs text-gray-400">{i + 1} / {cards.length}</p>
      <div onClick={() => setFlipped((f) => !f)}
        className="flex min-h-56 w-full max-w-md cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border p-6 text-3xl shadow-sm">
        {!flipped && <FarsiText farsi={card.farsi} translit={card.translit} english={card.english} />}
        {flipped && card.kind === "vocab" && (
          <>
            <FarsiText farsi={card.farsi} translit={card.translit} />
            <p className="text-xl text-gray-700">{card.english}</p>
          </>
        )}
        {flipped && card.kind === "verb" && (
          <table className="text-lg" onClick={(e) => e.stopPropagation()}>
            <tbody>
              {PRONOUNS.map((pr, r) => (
                <tr key={pr}>
                  <td className="pr-4 text-gray-500"><span dir="rtl" lang="fa" className="font-fa">{pr}</span></td>
                  <td className="pr-4"><span dir="rtl" lang="fa" className="font-fa">{conjugatePresent(card.presentStem)[r]}</span></td>
                  <td>{card.pastStem && <span dir="rtl" lang="fa" className="font-fa">{conjugatePast(card.pastStem)[r]}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex gap-3 text-sm">
        <button onClick={() => { setI((v) => Math.max(v - 1, 0)); setFlipped(false); }} className="rounded border px-4 py-2">← prev</button>
        <button onClick={() => setFlipped((f) => !f)} className="rounded border px-4 py-2">flip (space)</button>
        <button onClick={() => { setI((v) => Math.min(v + 1, cards.length - 1)); setFlipped(false); }} className="rounded border px-4 py-2">next →</button>
        <button onClick={() => { setCards((c) => shuffle(c, Date.now() & 0xffff)); setI(0); setFlipped(false); }} className="rounded border px-4 py-2">shuffle (s)</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Server page with learned-lesson scoping**

`src/app/flashcards/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { FlashcardDeck, type DeckCard } from "@/components/FlashcardDeck";
import Link from "next/link";

export default async function FlashcardsPage({ searchParams }:
  { searchParams: Promise<{ lessons?: string; deck?: string }> }) {
  const { lessons: lessonsParam, deck = "vocabulary" } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: allLessons } = await supabase.from("lessons")
    .select("id, number, title").order("number");
  const { data: completions } = await supabase.from("lesson_completions")
    .select("lesson_id").eq("user_id", user!.id);
  const completed = new Set((completions ?? []).map((c) => c.lesson_id));
  const firstUncompleted = (allLessons ?? []).find((l) => !completed.has(l.id));
  // learned = completed + the lesson currently in progress
  const learned = (allLessons ?? []).filter(
    (l) => completed.has(l.id) || l.id === firstUncompleted?.id);

  const selected = lessonsParam
    ? lessonsParam.split(",").map(Number).filter((n) => learned.some((l) => l.number === n))
    : learned.map((l) => l.number);
  const selectedIds = learned.filter((l) => selected.includes(l.number)).map((l) => l.id);

  let query = supabase.from("vocab_items")
    .select("id, farsi, transliteration, english, part_of_speech, present_stem, past_stem")
    .in("lesson_id", selectedIds.length ? selectedIds : [-1]);
  if (deck === "conjugations") query = query.eq("part_of_speech", "verb").not("present_stem", "is", null);
  const { data: vocab } = await query;

  const cards: DeckCard[] = (vocab ?? []).map((v) =>
    deck === "conjugations"
      ? { id: v.id, farsi: v.farsi, translit: v.transliteration, english: v.english,
          kind: "verb" as const, presentStem: v.present_stem!, pastStem: v.past_stem }
      : { id: v.id, farsi: v.farsi, translit: v.transliteration, english: v.english, kind: "vocab" as const });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-4 text-2xl font-bold">Flashcards</h1>
      <form method="get" className="mb-6 flex flex-col gap-3 rounded border p-4 text-sm">
        <div className="flex flex-wrap gap-3">
          {learned.map((l) => (
            <label key={l.id} className="flex items-center gap-1">
              <input type="checkbox" name="l" value={l.number}
                defaultChecked={selected.includes(l.number)} />
              L{String(l.number).padStart(2, "0")}
            </label>
          ))}
        </div>
        <div className="flex gap-4">
          <label><input type="radio" name="deck" value="vocabulary" defaultChecked={deck === "vocabulary"} /> Vocabulary</label>
          <label><input type="radio" name="deck" value="conjugations" defaultChecked={deck === "conjugations"} /> Verb conjugations</label>
        </div>
        {/* checkboxes submit as repeated ?l=; a tiny inline script folds them into ?lessons= */}
        <button className="self-start rounded bg-black px-4 py-2 text-white"
          formAction="/flashcards">Build deck</button>
      </form>
      {learned.length === 0
        ? <p className="text-gray-500">Complete your first lesson to unlock flashcards — or open <Link className="underline" href="/lessons">Lessons</Link>.</p>
        : <FlashcardDeck cards={cards} />}
    </main>
  );
}
```

Note for the implementer: with `method="get"`, repeated `l` params arrive as `searchParams.l` string-or-array — normalize to the `lessons` csv shape by reading both keys: `const raw = sp.lessons ?? sp.l; const list = Array.isArray(raw) ? raw : raw?.split(",")`. Implement that normalization (adjust the `searchParams` type to `{ lessons?: string; l?: string | string[]; deck?: string }`) rather than adding client JS.

- [ ] **Step 6: Verify manually + build**

`npm run dev` → `/flashcards` with no completions: only L01 (in-progress) offered. Complete L01 via psql:
```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "
insert into lesson_completions (user_id, lesson_id)
select u.id, l.id from auth.users u, lessons l where u.email='mag@saf.com' and l.number=1;"
```
Reload: L01 + L02 offered. Conjugations deck from L04 shows verb cards with six-row tables. Run: `npm run build` — compiles.

- [ ] **Step 7: Commit**

```bash
git add src/app/flashcards src/components/FlashcardDeck.tsx tests/flashcard-deck.test.tsx
git commit -m "feat: flashcards cram mode scoped to learned lessons with conjugation decks"
```

---

### Task 14: `/lessons` grid + lesson detail + completion form

**Files:**
- Create: `src/app/lessons/page.tsx`, `src/app/lessons/[slug]/page.tsx`, `src/app/lessons/actions.ts`, `src/components/CompletionForm.tsx`

**Interfaces:**
- Consumes: `createClient` (Task 8), `toPersianDigits` (Task 6).
- Produces:
  - `completeLesson(formData: FormData)` server action — inserts `lesson_completions` (fields: `lesson_id`, `minutes_spent`, `homework_done`, `negar_drill_done`, `confidence`, `notes`) and upserts `study_days.lessons_completed` for the user's local day (RPC `bump_study_day` below). Skill ratings: when the lesson `is_assessment`, the form also posts `skill:<name>` fields → rows in `skill_ratings`.
  - SQL migration `20260809000006_bump_study_day.sql` with `bump_study_day() returns void` — security invoker; `insert into study_days (user_id, day, lessons_completed) values (auth.uid(), local_today(auth.uid()), 1) on conflict (user_id, day) do update set lessons_completed = study_days.lessons_completed + 1;`
  - Lesson gating: lesson N is **locked** unless N==1 or N−1 is completed. Locked lessons still render with an "override — open anyway" link (`?override=1`). The gate is a nudge, not a jail.

- [ ] **Step 1: Migration for study-day bump**

`supabase/migrations/20260809000006_bump_study_day.sql` — the function above, verbatim. Then:

```bash
npx supabase db reset && npx supabase test db && npm run seed
```
Expected: all pgTAP still `ok` (reset wipes data; reseed).

- [ ] **Step 2: Lessons grid**

`src/app/lessons/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function LessonsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: units } = await supabase.from("units").select("*").order("number");
  const { data: lessons } = await supabase.from("lessons")
    .select("id, number, title, slug, is_review, is_assessment, estimated_minutes").order("number");
  const { data: comps } = await supabase.from("lesson_completions")
    .select("lesson_id, confidence, completed_at").eq("user_id", user!.id);
  const byLesson = new Map((comps ?? []).map((c) => [c.lesson_id, c]));
  const doneNumbers = new Set((lessons ?? []).filter((l) => byLesson.has(l.id)).map((l) => l.number));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Lessons</h1>
      {(units ?? []).map((u) => (
        <section key={u.id} className="mb-8">
          <h2 className="mb-3 font-semibold">Unit {u.number}: {u.title}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(lessons ?? []).filter((l) => true /* unit filter once >1 unit */).map((l) => {
              const done = byLesson.get(l.id);
              const locked = l.number !== 1 && !doneNumbers.has(l.number - 1) && !done;
              return (
                <Link key={l.id} href={`/lessons/${l.slug}`}
                  className={`rounded border p-3 ${locked ? "opacity-50" : ""} ${done ? "border-green-600" : ""}`}>
                  <span className="text-xs text-gray-400">L{String(l.number).padStart(2, "0")}
                    {l.is_review && " · review"}{l.is_assessment && " · assessment"}{locked && " · locked"}</span>
                  <p>{l.title}</p>
                  {done && <p className="text-xs text-green-700">
                    done {new Date(done.completed_at).toLocaleDateString()}
                    {done.confidence && ` · confidence ${done.confidence}/5`}</p>}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </main>
  );
}
```

- [ ] **Step 3: Lesson detail + completion action**

`src/app/lessons/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function completeLesson(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const lessonId = Number(formData.get("lesson_id"));
  const conf = Number(formData.get("confidence"));
  const { error } = await supabase.from("lesson_completions").insert({
    user_id: user.id, lesson_id: lessonId,
    minutes_spent: Number(formData.get("minutes_spent")) || null,
    homework_done: formData.get("homework_done") === "on",
    negar_drill_done: formData.get("negar_drill_done") === "on",
    confidence: conf >= 1 && conf <= 5 ? conf : null,
    notes: String(formData.get("notes") || "") || null,
  });
  if (error && !error.message.includes("duplicate")) throw error;
  await supabase.rpc("bump_study_day");
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("skill:") && Number(v) >= 1) {
      await supabase.from("skill_ratings").insert({
        user_id: user.id, lesson_id: lessonId,
        skill: k.slice(6), rating: Number(v),
      });
    }
  }
  revalidatePath("/lessons");
  redirect("/lessons");
}
```

`src/app/lessons/[slug]/page.tsx`:

```tsx
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompletionForm } from "@/components/CompletionForm";

export default async function LessonPage({ params, searchParams }:
  { params: Promise<{ slug: string }>; searchParams: Promise<{ override?: string }> }) {
  const { slug } = await params;
  const { override } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: lesson } = await supabase.from("lessons").select("*").eq("slug", slug).single();
  if (!lesson) notFound();

  const { data: prev } = lesson.number > 1
    ? await supabase.from("lessons").select("id").eq("number", lesson.number - 1).single()
    : { data: null };
  const { data: comps } = await supabase.from("lesson_completions")
    .select("lesson_id").eq("user_id", user!.id).in("lesson_id", [lesson.id, prev?.id ?? -1]);
  const done = (comps ?? []).some((c) => c.lesson_id === lesson.id);
  const prevDone = !prev || (comps ?? []).some((c) => c.lesson_id === prev.id);

  if (!prevDone && !done && override !== "1") {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-bold">L{lesson.number}: {lesson.title}</h1>
        <p className="mt-4 text-gray-600">The previous lesson isn't complete yet — finish it first for the curriculum to build properly.</p>
        <Link href={`/lessons/${slug}?override=1`} className="mt-4 inline-block underline">Open anyway →</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">L{String(lesson.number).padStart(2, "0")}: {lesson.title}</h1>
        <Link href={`/lessons/${slug}/practice`} className="rounded border px-3 py-1 text-sm">Practice →</Link>
      </div>
      {/* prose styling; Persian inside the markdown is handled by the fa-aware prose css below */}
      <article className="prose max-w-none [&_table]:block [&_table]:overflow-x-auto">
        <Markdown remarkPlugins={[remarkGfm]}>{lesson.body_md ?? "_No lesson body imported._"}</Markdown>
      </article>
      {!done && <CompletionForm lessonId={lesson.id} isAssessment={lesson.is_assessment} />}
      {done && <p className="mt-6 rounded bg-green-50 p-3 text-green-800">Completed ✓</p>}
    </main>
  );
}
```

Install prose plugin: `npm i -D @tailwindcss/typography` and add `@plugin "@tailwindcss/typography";` to `globals.css`. Lesson bodies mix English and Persian; add to `globals.css` a rule so Persian glyph runs inherit the Persian font inside prose:

```css
.prose { font-feature-settings: normal; }
.prose :where(td, th, li, p, strong) { unicode-bidi: plaintext; }
```

(`unicode-bidi: plaintext` makes mixed-direction table cells and list items order themselves by their own first strong character — the markdown equivalent of `<bdi>`.)

`src/components/CompletionForm.tsx`:

```tsx
import { completeLesson } from "@/app/lessons/actions";

const SKILLS = ["ezafe", "ra", "present_stems", "past_stems", "verb_final_order",
  "possessive_suffixes", "numbers_by_ear", "telling_time", "reading_unvocalized",
  "formal_colloquial", "conversation"];

export function CompletionForm({ lessonId, isAssessment }:
  { lessonId: number; isAssessment: boolean }) {
  return (
    <form action={completeLesson} className="mt-8 flex flex-col gap-3 rounded border p-4">
      <h2 className="font-semibold">Mark complete</h2>
      <input type="hidden" name="lesson_id" value={lessonId} />
      <label className="flex justify-between">Minutes spent
        <input type="number" name="minutes_spent" min={0} max={600} className="w-24 rounded border p-1" /></label>
      <label className="flex justify-between">Homework done
        <input type="checkbox" name="homework_done" /></label>
      <label className="flex justify-between">Negar drill done
        <input type="checkbox" name="negar_drill_done" /></label>
      <label className="flex justify-between">Confidence (1–5)
        <input type="number" name="confidence" min={1} max={5} className="w-24 rounded border p-1" /></label>
      <textarea name="notes" placeholder="notes" className="rounded border p-2" />
      {isAssessment && (
        <fieldset className="mt-2 flex flex-col gap-1 border-t pt-2">
          <legend className="text-sm font-semibold">Skill self-ratings (1–5, blank to skip)</legend>
          {SKILLS.map((s) => (
            <label key={s} className="flex justify-between text-sm">{s.replaceAll("_", " ")}
              <input type="number" name={`skill:${s}`} min={1} max={5} className="w-20 rounded border p-1" /></label>
          ))}
        </fieldset>
      )}
      <button className="rounded bg-black p-3 text-white">Complete lesson</button>
    </form>
  );
}
```

- [ ] **Step 4: Verify manually + build**

`npm run dev` → `/lessons`: L01 available, L02+ locked (unless L01 completed in Task 13 testing). Open L01 → markdown renders, Persian tables readable RTL-in-cell. Complete it → grid shows done, L02 unlocked. `select * from study_days;` shows `lessons_completed = 1`. Run: `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260809000006_bump_study_day.sql src/app/lessons src/components/CompletionForm.tsx src/app/globals.css package.json
git commit -m "feat: lessons grid with soft gating, markdown detail, completion + skill ratings"
```

---

### Task 15: Exercises — migration, importer extension, practice player

**Files:**
- Create: `supabase/migrations/20260809000007_exercises.sql`, `src/app/lessons/[slug]/practice/page.tsx`, `src/components/ExercisePlayer.tsx`, `src/lib/english-check.ts`, `tests/exercises.test.ts`
- Modify: `src/lib/import-parsers.ts` (add `parseExercises`), `scripts/seed-lessons.ts` (upsert exercises), `tests/import-parsers.test.ts`

**Interfaces:**
- Consumes: `checkTypedAnswer`, `conjugatePresent`, `conjugatePast`, `PRONOUNS` (Task 6), `FaKeyboard`, `FarsiText` (Task 9), `shuffle` (Task 13).
- Produces:
  - Tables `exercises` + `exercise_attempts` per spec §Data model (exercises = reference data: authenticated read-only; attempts user-scoped RLS, same policy shape as Task 4).
  - `parseExercises(bodyMd: string): { type: string; prompt: string; answer: string; accept: string[]; hint: string | null }[]` — parses the fenced ` ```exercises ` YAML block (a YAML list). Returns `[]` when absent.
  - `checkEnglishAnswer(input: string, answer: string, accept: string[]): boolean` (from `src/lib/english-check.ts`) — lowercase, strip punctuation/articles-irrelevant whitespace, exact or Levenshtein ≤ 1 against answer or any accept.
  - `ExercisePlayer({ exercises, verbs }: { exercises: Ex[]; verbs: Verb[] })` where `Ex = { id: string; type: "en_to_fa" | "fa_to_en" | "cloze" | "scramble"; prompt: string; answer: string; accept: string[]; hint: string | null }` and `Verb = { farsi: string; transliteration: string; present_stem: string; past_stem: string | null }`. Appends auto-generated conjugation drills (one per verb: seeded-random pronoun, present tense; past when `past_stem` exists and index is odd). Logs each attempt via `supabase.from("exercise_attempts").insert(...)` (fire-and-forget; conjugation drills have no exercise row so they are not logged).
  - The generator contract for future lessons, appended to the external `GENERATE_LESSONS.md`.

- [ ] **Step 1: Migration**

`supabase/migrations/20260809000007_exercises.sql` — the two `create table` statements verbatim from spec §Data model (exercises section, both carry `course_id`), then:

```sql
alter table exercises enable row level security;
create policy "own course content" on exercises for all
  using (course_id in (select id from courses where owner_id = auth.uid()))
  with check (course_id in (select id from courses where owner_id = auth.uid()));
alter table exercise_attempts enable row level security;
create policy "own rows" on exercise_attempts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

```bash
npx supabase db reset && npx supabase test db && npm run seed
```
Expected: all `ok`.

- [ ] **Step 2: Failing tests for parsers + english check**

Append to `tests/import-parsers.test.ts`:

```ts
import { parseExercises } from "../src/lib/import-parsers";

describe("parseExercises", () => {
  it("parses the fenced exercises yaml block", () => {
    const md = "body\n\n```exercises\n- type: en_to_fa\n  prompt: I am going home\n  answer: من به خانه می‌روم\n  accept: [به خانه می‌روم]\n- type: cloze\n  prompt: من کتاب ___ خواندم\n  answer: را\n  hint: object marker\n```\n";
    const ex = parseExercises(md);
    expect(ex).toHaveLength(2);
    expect(ex[0].type).toBe("en_to_fa");
    expect(ex[0].accept).toEqual(["به خانه می‌روم"]);
    expect(ex[1].hint).toBe("object marker");
    expect(ex[1].accept).toEqual([]);
  });
  it("returns empty when absent", () => expect(parseExercises("no block here")).toEqual([]));
});
```

`tests/exercises.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checkEnglishAnswer } from "../src/lib/english-check";

describe("checkEnglishAnswer", () => {
  it("case and punctuation insensitive", () =>
    expect(checkEnglishAnswer("I'm going home!", "im going home", [])).toBe(true));
  it("accept alternatives", () =>
    expect(checkEnglishAnswer("to eat", "to eat, to drink", ["to eat", "to drink"])).toBe(true));
  it("one typo tolerated", () =>
    expect(checkEnglishAnswer("hovse", "house", [])).toBe(true));
  it("wrong is wrong", () =>
    expect(checkEnglishAnswer("car", "house", [])).toBe(false));
});
```

Run: `npm test` — Expected: FAIL (functions missing).

- [ ] **Step 3: Implement**

Append to `src/lib/import-parsers.ts`:

```ts
export function parseExercises(bodyMd: string) {
  const m = bodyMd.match(/```exercises\r?\n([\s\S]*?)```/);
  if (!m) return [];
  const list = yaml.load(m[1], { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>[];
  if (!Array.isArray(list)) return [];
  return list.map((e) => ({
    type: String(e.type),
    prompt: String(e.prompt),
    answer: String(e.answer),
    accept: Array.isArray(e.accept) ? e.accept.map(String) : [],
    hint: e.hint != null ? String(e.hint) : null,
  }));
}
```

`src/lib/english-check.ts`:

```ts
import { levenshtein } from "./farsi";

const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();

export function checkEnglishAnswer(input: string, answer: string, accept: string[]): boolean {
  const a = norm(input);
  return [answer, ...accept].some((c) => {
    const b = norm(c);
    return a === b || levenshtein(a, b) <= 1;
  });
}
```

In `scripts/seed-lessons.ts`, wire exercises into the package assembly — inside the `lessons:` map, add after `vocab:`:

```ts
      exercises: (() => {
        const exs = parseExercises(l.body_md);
        return exs.length ? exs : undefined;   // undefined = leave existing alone
      })(),
```
(and import `parseExercises`). The engine (`importContentPackage`, Task 7) already handles the replace-per-lesson upsert — no other seed changes.

- [ ] **Step 4: Run tests**

Run: `npm test` — Expected: PASS.

- [ ] **Step 5: Exercise player**

`src/components/ExercisePlayer.tsx`:

```tsx
"use client";
import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { checkTypedAnswer, conjugatePresent, conjugatePast, PRONOUNS } from "@/lib/farsi";
import { checkEnglishAnswer } from "@/lib/english-check";
import { FaKeyboard } from "./FaKeyboard";
import { FarsiText } from "./FarsiText";
import { shuffle } from "./FlashcardDeck";

export type Ex = { id: string; type: "en_to_fa" | "fa_to_en" | "cloze" | "scramble";
  prompt: string; answer: string; accept: string[]; hint: string | null };
export type Verb = { farsi: string; transliteration: string;
  present_stem: string; past_stem: string | null };

type Item =
  | { kind: "stored"; ex: Ex }
  | { kind: "conj"; verb: Verb; pronounIdx: number; tense: "present" | "past"; expected: string };

function buildItems(exercises: Ex[], verbs: Verb[]): Item[] {
  const conj: Item[] = verbs.map((v, i) => {
    const tense = v.past_stem && i % 2 === 1 ? "past" as const : "present" as const;
    const pronounIdx = (i * 7 + 3) % 6; // deterministic spread, no Math.random in render
    const expected = tense === "past"
      ? conjugatePast(v.past_stem!)[pronounIdx]
      : conjugatePresent(v.present_stem)[pronounIdx];
    return { kind: "conj", verb: v, pronounIdx, tense, expected };
  });
  return [...exercises.map((ex) => ({ kind: "stored" as const, ex })), ...conj];
}

export function ExercisePlayer({ exercises, verbs }: { exercises: Ex[]; verbs: Verb[] }) {
  const supabase = useMemo(() => createBrowserClient(), []);
  const [items] = useState(() => buildItems(exercises, verbs));
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const [tiles, setTiles] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<"correct" | "close" | "wrong" | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const item = items[i];

  function next() {
    setI((v) => v + 1); setTyped(""); setResult(null); setPicked([]);
    const nxt = items[i + 1];
    if (nxt?.kind === "stored" && nxt.ex.type === "scramble")
      setTiles(shuffle(nxt.ex.answer.split(/\s+/), (i + 1) * 97 + 13));
  }
  // initialize tiles for a first-item scramble
  useState(() => {
    if (item?.kind === "stored" && item.ex.type === "scramble")
      setTiles(shuffle(item.ex.answer.split(/\s+/), 13));
  });

  function record(ok: boolean, given: string) {
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    if (item.kind === "stored")
      supabase.from("exercise_attempts")
        .insert({ exercise_id: item.ex.id, correct: ok, answer_given: given,
                  user_id: undefined as never })  // user_id defaulted below in page via RLS-checked insert
        .then(() => {});
  }

  function check() {
    if (result) return next();
    let ok = false, close = false;
    const given = item.kind === "stored" && item.ex.type === "scramble" ? picked.join(" ") : typed;
    if (item.kind === "conj") {
      const v = checkTypedAnswer(typed, item.expected).verdict;
      ok = v === "exact"; close = v === "close";
    } else if (item.ex.type === "fa_to_en") {
      ok = checkEnglishAnswer(typed, item.ex.answer, item.ex.accept);
    } else if (item.ex.type === "scramble") {
      ok = picked.join(" ") === item.ex.answer.split(/\s+/).join(" ");
    } else {
      const verdicts = [item.ex.answer, ...item.ex.accept]
        .map((a) => checkTypedAnswer(typed, a).verdict);
      ok = verdicts.includes("exact"); close = !ok && verdicts.includes("close");
    }
    setResult(ok ? "correct" : close ? "close" : "wrong");
    record(ok || close, given);
  }

  if (!item) return (
    <p className="rounded border p-6 text-center text-xl">
      Done — {score.right}/{score.total} correct.
    </p>
  );

  const needsFaInput = item.kind === "conj" ||
    (item.kind === "stored" && (item.ex.type === "en_to_fa" || item.ex.type === "cloze"));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">{i + 1} / {items.length} · {score.right} correct</p>

      <div className="rounded border p-5 text-xl">
        {item.kind === "conj" && (
          <p><FarsiText farsi={item.verb.farsi} translit={item.verb.transliteration} locked={!result} />
            {" + "}<span dir="rtl" lang="fa" className="font-fa">{PRONOUNS[item.pronounIdx]}</span>
            {" → "}{item.tense} tense?</p>
        )}
        {item.kind === "stored" && item.ex.type === "en_to_fa" && <p>Write in Farsi: <b>{item.ex.prompt}</b></p>}
        {item.kind === "stored" && item.ex.type === "fa_to_en" && (
          <p>Write in English: <FarsiText farsi={item.ex.prompt} locked /></p>)}
        {item.kind === "stored" && item.ex.type === "cloze" && (
          <p>Fill the blank: <span dir="rtl" lang="fa" className="font-fa">{item.ex.prompt}</span></p>)}
        {item.kind === "stored" && item.ex.type === "scramble" && (
          <div>
            <p className="mb-2 text-sm text-gray-500">Arrange: “{item.ex.prompt}”</p>
            <div dir="rtl" className="mb-2 min-h-10 rounded bg-gray-50 p-2 font-fa">
              {picked.map((w, wi) => (
                <button key={wi} className="m-1 rounded border bg-white px-2 py-1"
                  onClick={() => { setPicked(picked.filter((_, x) => x !== wi)); setTiles([...tiles, w]); }}>
                  {w}</button>))}
            </div>
            <div dir="rtl">
              {tiles.map((w, wi) => (
                <button key={wi} className="m-1 rounded border px-2 py-1 font-fa"
                  onClick={() => { setTiles(tiles.filter((_, x) => x !== wi)); setPicked([...picked, w]); }}>
                  {w}</button>))}
            </div>
          </div>
        )}
        {item.kind === "stored" && item.ex.hint && !result &&
          <p className="mt-2 text-sm text-gray-400">hint: {item.ex.hint}</p>}
      </div>

      {item.kind !== "stored" || item.ex.type !== "scramble" ? (
        <div className="flex flex-col gap-2">
          <input dir={needsFaInput ? "rtl" : "ltr"} lang={needsFaInput ? "fa" : "en"}
            value={typed} onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && check()}
            className={`rounded border p-3 text-xl ${needsFaInput ? "font-fa" : ""}`} autoComplete="off" />
          {needsFaInput && <FaKeyboard onKey={(ch) => setTyped((t) => t + ch)}
            onBackspace={() => setTyped((t) => t.slice(0, -1))} />}
        </div>
      ) : null}

      {result && (
        <p className={`rounded p-3 text-center ${result === "correct" ? "bg-green-50 text-green-800"
          : result === "close" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"}`}>
          {result === "correct" && "Correct"}
          {result === "close" && "Close — check the spelling"}
          {result === "wrong" && <>Answer: <FarsiText
            farsi={item.kind === "conj" ? item.expected : item.ex.answer} /></>}
        </p>
      )}
      <button onClick={check} className="rounded bg-black p-3 text-white">
        {result ? "Next" : "Check"}
      </button>
    </div>
  );
}
```

Implementation note on attempt logging: RLS requires `user_id = auth.uid()`; pass the user id into `ExercisePlayer` as a prop from the server page and use it in the insert (replace the `user_id: undefined as never` placeholder with `user_id: userId`).

`src/app/lessons/[slug]/practice/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ExercisePlayer, type Ex, type Verb } from "@/components/ExercisePlayer";

export default async function PracticePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("id, number, title").eq("slug", slug).single();
  if (!lesson) notFound();
  const { data: exercises } = await supabase.from("exercises")
    .select("id, type, prompt, answer, accept, hint").eq("lesson_id", lesson.id).order("position");
  const { data: verbs } = await supabase.from("vocab_items")
    .select("farsi, transliteration, present_stem, past_stem")
    .eq("lesson_id", lesson.id).eq("part_of_speech", "verb").not("present_stem", "is", null);
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-xl font-bold">Practice — L{String(lesson.number).padStart(2, "0")} {lesson.title}</h1>
      {(exercises ?? []).length === 0 && (verbs ?? []).length === 0
        ? <p className="text-gray-500">No exercises for this lesson yet. Regenerate the lesson with the exercises block, re-run the importer — or pick a lesson with verbs for auto conjugation drills.</p>
        : <ExercisePlayer exercises={(exercises ?? []) as Ex[]} verbs={(verbs ?? []) as Verb[]} userId={user!.id} />}
    </main>
  );
}
```

(Add `userId: string` to `ExercisePlayer` props per the note above.)

- [ ] **Step 6: Document the generator contract**

Append to the external generator prompt `C:\Users\mgrog\AppData\Local\Packages\CLAUDE~1\LOCALC~1\Roaming\Claude\LOCAL-~1\5C72FD~1\A99E97~1\LOCAL_~1\outputs\farsi\GENERATE_LESSONS.md`:

````markdown
## Exercises block (required in every lesson)

End each lesson file with a fenced `exercises` YAML block: 8–12 items mixing types.
Types: `en_to_fa` (prompt=English, answer=Farsi script), `fa_to_en` (prompt=Farsi,
answer=English, use `accept:` for alternate phrasings), `cloze` (prompt=Persian sentence
containing `___`, answer=the missing word), `scramble` (prompt=English gloss,
answer=the full Persian sentence in correct order, words space-separated).
Farsi answers must use correct ZWNJ (می‌روم not می روم). Example:

```exercises
- type: en_to_fa
  prompt: I am going home
  answer: من به خانه می‌روم
  accept: [به خانه می‌روم]
- type: cloze
  prompt: من کتاب ___ خواندم
  answer: را
  hint: object marker
- type: scramble
  prompt: Negar sees the teacher
  answer: نگار معلم را می‌بیند
```

Do not author conjugation drills — the app generates those from the vocab stems.
````

- [ ] **Step 7: Verify manually + build**

`npm run dev` → `/lessons/present-tense-i/practice`: 10 auto conjugation drills appear (L04 has 10 verbs); typing `می‌رویم` for رفتن + ما → Correct; typing with a plain space instead of ZWNJ still Correct (normalization); one wrong letter → "Close". To test stored exercises, paste the example block into `content/lessons/L04-present-tense-i.md`, `npm run seed`, reload — the en_to_fa/cloze/scramble items appear first, `select count(*) from exercise_attempts;` grows as you answer. Revert the L04 edit afterwards (`git checkout -- content/lessons/L04-present-tense-i.md`) and reseed. Run: `npm run build`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260809000007_exercises.sql src/lib/import-parsers.ts src/lib/english-check.ts scripts/seed-lessons.ts src/app/lessons src/components/ExercisePlayer.tsx tests
git commit -m "feat: lesson exercises - typed translation, cloze, scramble, auto conjugation drills"
```

---

### Task 16: Dashboard (`/`) + heatmap + JSON export

**Files:**
- Create: `src/components/Heatmap.tsx`, `src/components/CopyPromptButton.tsx`, `src/app/api/export/route.ts`
- Modify: `src/app/page.tssx` → replace scaffold `src/app/page.tsx`

**Interfaces:**
- Consumes: `current_streak` RPC (Task 5), `toPersianDigits` (Task 6).
- Produces: dashboard per spec §Screens; `Heatmap({ days }: { days: { day: string; count: number }[] })` renders 90 day cells; `GET /api/export` streams a JSON file of all the user's rows (profiles, lesson_completions, practice_sessions, skill_ratings, vocab_reviews, review_log, study_days, exercise_attempts + shared units/lessons/vocab_items/exercises).

- [ ] **Step 1: Heatmap + copy button**

`src/components/Heatmap.tsx`:

```tsx
export function Heatmap({ days }: { days: { day: string; count: number }[] }) {
  const byDay = new Map(days.map((d) => [d.day, d.count]));
  const cells: { key: string; count: number }[] = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push({ key, count: byDay.get(key) ?? 0 });
  }
  const shade = (c: number) =>
    c === 0 ? "bg-gray-100" : c < 10 ? "bg-green-200" : c < 40 ? "bg-green-400" : "bg-green-600";
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1" title="last 90 days">
      {cells.map((c) => (
        <div key={c.key} title={`${c.key}: ${c.count}`} className={`h-3 w-3 rounded-sm ${shade(c.count)}`} />
      ))}
    </div>
  );
}
```

`src/components/CopyPromptButton.tsx`:

```tsx
"use client";
import { useState } from "react";

export function CopyPromptButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className="rounded bg-black px-4 py-2 text-white"
      onClick={async () => { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
      {copied ? "Copied ✓" : "Copy tutor prompt"}
    </button>
  );
}
```

- [ ] **Step 2: Dashboard page**

`src/app/page.tsx`:

```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Heatmap } from "@/components/Heatmap";
import { CopyPromptButton } from "@/components/CopyPromptButton";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;

  const [{ data: streak }, { data: due }, { data: profile }, { data: days },
         { data: lessons }, { data: comps }] = await Promise.all([
    supabase.rpc("current_streak"),
    supabase.from("vocab_reviews").select("id", { count: "exact", head: true })
      .eq("user_id", uid).eq("suspended", false).lte("due_on", new Date().toISOString().slice(0, 10)),
    supabase.from("profiles").select("target_lessons_per_week").eq("id", uid).single(),
    supabase.from("study_days").select("day, cards_reviewed, lessons_completed")
      .eq("user_id", uid).gte("day", new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)),
    supabase.from("lessons").select("id, number, title, slug").order("number"),
    supabase.from("lesson_completions").select("lesson_id, completed_at").eq("user_id", uid),
  ]);

  const doneIds = new Set((comps ?? []).map((c) => c.lesson_id));
  const next = (lessons ?? []).find((l) => !doneIds.has(l.id));
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
  const thisWeek = (comps ?? []).filter((c) => new Date(c.completed_at) >= weekStart).length;
  const dueCount = (due as unknown as { count?: number })?.count ?? 0;
  const tutorPrompt = next
    ? `We're doing Lesson ${next.number} of my Farsi curriculum: "${next.title}". Teach it interactively per the lesson plan, correct my Persian ruthlessly, and end with a session log of my errors and strengths.`
    : "All lessons complete — run a free conversation session and log my errors.";

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded border p-4"><p className="text-3xl font-bold">{Number(streak ?? 0)}</p><p className="text-xs text-gray-500">day streak</p></div>
        <Link href="/review" className="rounded border p-4 hover:bg-gray-50"><p className="text-3xl font-bold">{dueCount}</p><p className="text-xs text-gray-500">cards due — review →</p></Link>
        <div className="rounded border p-4"><p className="text-3xl font-bold">{thisWeek}/{profile?.target_lessons_per_week ?? 5}</p><p className="text-xs text-gray-500">lessons this week</p></div>
      </div>
      {next && (
        <div className="rounded border p-4">
          <p className="text-xs text-gray-500">next lesson</p>
          <p className="mb-2 text-lg">L{String(next.number).padStart(2, "0")}: <Link className="underline" href={`/lessons/${next.slug}`}>{next.title}</Link></p>
          <CopyPromptButton prompt={tutorPrompt} />
        </div>
      )}
      <div className="rounded border p-4">
        <p className="mb-2 text-xs text-gray-500">last 90 days</p>
        <Heatmap days={(days ?? []).map((d) => ({ day: d.day, count: d.cards_reviewed + d.lessons_completed * 10 }))} />
      </div>
      <a href="/api/export" className="text-sm text-gray-500 underline">Export all my data (JSON)</a>
    </main>
  );
}
```

- [ ] **Step 3: Export route**

`src/app/api/export/route.ts`:

```ts
import { createClient } from "@/lib/supabase/server";

const USER_TABLES = ["profiles", "lesson_completions", "practice_sessions", "skill_ratings",
  "vocab_reviews", "review_log", "study_days", "exercise_attempts"];
const COURSE_TABLES = ["courses", "units", "lessons", "vocab_items", "exercises"]; // owner RLS scopes these too

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
  for (const t of [...USER_TABLES, ...COURSE_TABLES]) {
    const { data, error } = await supabase.from(t).select("*"); // RLS scopes user tables automatically
    if (error) return new Response(`export failed on ${t}: ${error.message}`, { status: 500 });
    out[t] = data;
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="farsi-tracker-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
```

- [ ] **Step 4: Verify + build + commit**

`npm run dev` → `/`: streak/due/week cards render with data from earlier testing; heatmap shows green cells on test days; export downloads a JSON containing your review_log rows and all vocab. Run: `npm run build`.

```bash
git add src/app/page.tsx src/components/Heatmap.tsx src/components/CopyPromptButton.tsx src/app/api/export
git commit -m "feat: dashboard with streak, due count, heatmap, tutor prompt, JSON export"
```

---

### Task 17: `/progress` + `/vocab`

**Files:**
- Create: `src/app/progress/page.tsx`, `src/components/SkillChart.tsx`, `src/app/vocab/page.tsx`, `src/components/VocabTable.tsx`, `src/app/vocab/actions.ts`

**Interfaces:**
- Consumes: `FarsiText` (Task 9), `FaKeyboard` (Task 9), service-role write path for `vocab_items` (spec decision 3).
- Produces:
  - `/progress`: line chart per skill from `skill_ratings` (recharts `LineChart`, x = rated_at, one `Line` per skill); ranked error list aggregated from `practice_sessions.errors`; retention rate = passed (grade ≥ 3) / total from `review_log` (last 30 days); total study time = sum `lesson_completions.minutes_spent` + `practice_sessions.duration_minutes`.
  - `/vocab`: server page with search (`?q=` → `.ilike("farsi_normalized", `%${faNormalize(q)}%`)` — trigram index serves this; also `.or()` against english/transliteration), filters `?lesson=&pos=&tag=`, table rows: `FarsiText` word, POS, lesson, SRS state (`due_on`, `ease`, `repetitions`, suspended), suspend/unsuspend toggle (updates own `vocab_reviews` row — insert one if the item is still unseen), manual add form (Farsi input with `FaKeyboard`).
  - `addVocabItem(formData)` server action: normal authenticated insert into the user's **active course** (`profiles.active_course_id`) — course-content RLS authorizes the owner, no service role involved. `toggleSuspend(vocabId, suspend)` upserts the user's `vocab_reviews` row with `suspended`.
  - `src/lib/supabase/admin.ts` (`createAdminClient()`) is still created here but is used ONLY by the unsubscribe route (Task 18), which runs without a session.

- [ ] **Step 1: `/progress` page** (single server component + one client chart)

`src/components/SkillChart.tsx`:

```tsx
"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function SkillChart({ data, skills }:
  { data: Record<string, string | number>[]; skills: string[] }) {
  const palette = ["#000", "#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed",
    "#0891b2", "#be185d", "#4d7c0f", "#b45309", "#6b7280"];
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <XAxis dataKey="date" fontSize={11} /><YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} fontSize={11} />
        <Tooltip /><Legend />
        {skills.map((s, i) => (
          <Line key={s} dataKey={s} stroke={palette[i % palette.length]} connectNulls dot />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

`src/app/progress/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { SkillChart } from "@/components/SkillChart";

export default async function ProgressPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user!.id;
  const [{ data: ratings }, { data: sessions }, { data: log }, { data: comps }] = await Promise.all([
    supabase.from("skill_ratings").select("skill, rating, rated_at").eq("user_id", uid).order("rated_at"),
    supabase.from("practice_sessions").select("errors, duration_minutes").eq("user_id", uid),
    supabase.from("review_log").select("grade").eq("user_id", uid)
      .gte("reviewed_at", new Date(Date.now() - 30 * 864e5).toISOString()),
    supabase.from("lesson_completions").select("minutes_spent").eq("user_id", uid),
  ]);

  // pivot ratings into per-date rows for recharts
  const skills = [...new Set((ratings ?? []).map((r) => r.skill))];
  const byDate = new Map<string, Record<string, string | number>>();
  for (const r of ratings ?? []) {
    const date = r.rated_at.slice(0, 10);
    const row = byDate.get(date) ?? { date };
    row[r.skill] = r.rating;
    byDate.set(date, row);
  }

  const errorCounts = new Map<string, number>();
  for (const s of sessions ?? [])
    for (const e of s.errors ?? []) errorCounts.set(e, (errorCounts.get(e) ?? 0) + 1);
  const rankedErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]);

  const total = (log ?? []).length;
  const passed = (log ?? []).filter((r) => r.grade >= 3).length;
  const minutes = (comps ?? []).reduce((a, c) => a + (c.minutes_spent ?? 0), 0)
    + (sessions ?? []).reduce((a, s) => a + (s.duration_minutes ?? 0), 0);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-bold">Progress</h1>
      <section>
        <h2 className="mb-2 font-semibold">Most frequent errors</h2>
        {rankedErrors.length === 0 ? <p className="text-sm text-gray-500">No tutor session logs yet.</p> : (
          <ol className="list-decimal pl-6">
            {rankedErrors.map(([e, n]) => <li key={e}>{e} <span className="text-gray-400">×{n}</span></li>)}
          </ol>)}
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Skill ratings over time</h2>
        {skills.length === 0 ? <p className="text-sm text-gray-500">Rate skills at your next assessment lesson.</p>
          : <SkillChart data={[...byDate.values()]} skills={skills} />}
      </section>
      <section className="grid grid-cols-2 gap-3 text-center">
        <div className="rounded border p-4">
          <p className="text-3xl font-bold">{total ? Math.round((passed / total) * 100) : 0}%</p>
          <p className="text-xs text-gray-500">retention (30 days, {total} reviews)</p></div>
        <div className="rounded border p-4">
          <p className="text-3xl font-bold">{Math.round(minutes / 60 * 10) / 10}h</p>
          <p className="text-xs text-gray-500">total study time</p></div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Service-role admin client**

`src/lib/supabase/admin.ts`:

```ts
import "server-only";
import { createClient as createSbClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
```

Run `npm i server-only`.

- [ ] **Step 3: `/vocab` actions + page**

`src/app/vocab/actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addVocabItem(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const farsi = String(formData.get("farsi") || "").trim();
  const translit = String(formData.get("transliteration") || "").trim();
  const english = String(formData.get("english") || "").trim();
  if (!farsi || !translit || !english) throw new Error("farsi, transliteration, english required");
  const { data: profile } = await supabase.from("profiles")
    .select("active_course_id").eq("id", user.id).single();
  if (!profile?.active_course_id) throw new Error("no active course — import one first");
  const { error } = await supabase.from("vocab_items").insert({
    course_id: profile.active_course_id,   // owner-only RLS authorizes this
    farsi, transliteration: translit, english,
    part_of_speech: String(formData.get("part_of_speech") || "") || null,
    lesson_id: Number(formData.get("lesson_id")) || null,
    tags: ["manual"],
  });
  if (error) throw error;
  revalidatePath("/vocab");
}

export async function toggleSuspend(vocabId: string, suspend: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const { error } = await supabase.from("vocab_reviews").upsert(
    { user_id: user.id, vocab_id: vocabId, suspended: suspend },
    { onConflict: "user_id,vocab_id" });
  if (error) throw error;
  revalidatePath("/vocab");
}
```

`src/app/vocab/page.tsx` (server: search + filters; renders `VocabTable`):

```tsx
import { createClient } from "@/lib/supabase/server";
import { faNormalize } from "@/lib/farsi";
import { VocabTable } from "@/components/VocabTable";

export default async function VocabPage({ searchParams }:
  { searchParams: Promise<{ q?: string; lesson?: string; pos?: string }> }) {
  const { q, lesson, pos } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase.from("vocab_items")
    .select("id, farsi, transliteration, english, part_of_speech, lesson_id, tags, lessons(number)")
    .order("farsi").limit(500);
  if (q) {
    const isFa = /[\u0600-\u06FF]/.test(q);
    query = isFa
      ? query.ilike("farsi_normalized", `%${faNormalize(q)}%`)
      : query.or(`english.ilike.%${q}%,transliteration.ilike.%${q}%`);
  }
  if (lesson) query = query.eq("lesson_id", Number(lesson));
  if (pos) query = query.eq("part_of_speech", pos);
  const { data: items } = await query;
  const { data: reviews } = await supabase.from("vocab_reviews")
    .select("vocab_id, due_on, ease, repetitions, suspended").eq("user_id", user!.id);
  const { data: lessons } = await supabase.from("lessons").select("id, number").order("number");

  return <VocabTable items={items ?? []} reviews={reviews ?? []} lessons={lessons ?? []}
    initialQuery={q ?? ""} />;
}
```

`src/components/VocabTable.tsx` (client): renders the search form (text input + `FaKeyboard` toggle button), lesson/POS `<select>` filters submitting via GET, the table (columns: word as `FarsiText`, POS, lesson number, due_on/ease/reps or "unseen", suspend button calling `toggleSuspend`), and a collapsed "Add word" form posting `addVocabItem` with a Farsi input + `FaKeyboard`. Table wrapped in `overflow-x-auto`. Persian column cells: `<FarsiText farsi={i.farsi} translit={i.transliteration} english={i.english} />`. Suspend button per row:

```tsx
<button onClick={() => toggleSuspend(item.id, !review?.suspended)}
  className="text-xs underline">{review?.suspended ? "unsuspend" : "suspend"}</button>
```

(complete file follows the same patterns as ReviewSession/FlashcardDeck: `"use client"`, props typed, no data fetching inside).

- [ ] **Step 4: Verify + build + commit**

`npm run dev` → `/vocab`: search `كتاب` (Arabic kaf, paste it) finds کتاب entries — proves normalization path; search `book` finds by English. Suspend a word → it stops appearing in `/review` queue. Add a manual word → appears with tag `manual`. `/progress` renders (mostly empty until real data). Run: `npm run build`.

```bash
git add src/app/progress src/app/vocab src/components/SkillChart.tsx src/components/VocabTable.tsx src/lib/supabase/admin.ts package.json
git commit -m "feat: progress analytics and vocab browser with Persian search, suspend, manual add"
```

---

### Task 18: Daily reminder + weekly digest emails, cron, unsubscribe

⚠️ **PAUSE POINT:** before this task, the user must create a **Resend account**, verify a sending domain, and provide `RESEND_API_KEY` + the from-address. Local testing can proceed against Resend's test mode (`onboarding@resend.dev` to the account owner's email) before domain verification.

**Files:**
- Create: `supabase/functions/daily-reminder/index.ts`, `supabase/functions/weekly-digest/index.ts`, `supabase/functions/_shared/email.ts`, `supabase/migrations/20260809000008_cron.sql`, `src/app/api/unsubscribe/route.ts`

**Interfaces:**
- Consumes: `email_log` table (Task 3), `current_streak`/`local_today` (Task 5).
- Produces:
  - Edge Function `daily-reminder` (verify `Authorization: Bearer <service_role>`): selects users via the spec's timezone-matching query, claims each send by inserting into `email_log` first (unique constraint is the dedup guarantee — skip user on conflict), builds HTML per spec §Daily reminder email (due count + `/review` link; today's lesson + tutor prompt; streak; 3-item warm-up drill with answers behind a link; Negar nudge when last completion has `negar_drill_done = false`; unsubscribe link), sends via Resend REST API.
  - Edge Function `weekly-digest` (same auth): for users whose local time is Sunday at `daily_email_hour`: lessons done vs target, retention % (7 days), top 3 errors, next week's lessons.
  - `GET /api/unsubscribe?uid=<uuid>&token=<hmac>` — verifies `token == HMAC_SHA256(uid, UNSUBSCRIBE_SECRET)` (hex), flips `daily_email_enabled` via admin client, renders "Unsubscribed."
  - Cron migration scheduling both functions hourly (digest function itself checks for Sunday-local).

- [ ] **Step 1: Shared email helpers**

`supabase/functions/_shared/email.ts`:

```ts
export async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM") ?? "onboarding@resend.dev", to, subject, html }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}

export async function unsubscribeUrl(userId: string): Promise<string> {
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET")!;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${Deno.env.get("SITE_URL")}/api/unsubscribe?uid=${userId}&token=${hex}`;
}

// Persian content needs dir=rtl + webfont with legible fallback (spec §Daily reminder email)
export const FA_SPAN = (t: string) =>
  `<span dir="rtl" lang="fa" style="font-family:Vazirmatn,'Times New Roman',serif">${t}</span>`;
export const EMAIL_HEAD = `<link href="https://fonts.googleapis.com/css2?family=Vazirmatn&display=swap" rel="stylesheet">`;
```

- [ ] **Step 2: Daily reminder function**

`supabase/functions/daily-reminder/index.ts`:

```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail, unsubscribeUrl, FA_SPAN, EMAIL_HEAD } from "../_shared/email.ts";

Deno.serve(async (req) => {
  const auth = req.headers.get("Authorization");
  if (auth !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`)
    return new Response("forbidden", { status: 403 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // spec's selection query, via rpc-free SQL over PostgREST:
  const { data: users, error } = await db.rpc("users_due_daily_email");
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const u of users ?? []) {
    // claim the send FIRST — the unique constraint on (user_id, kind, sent_on) is the real dedup
    const { error: claimErr } = await db.from("email_log")
      .insert({ user_id: u.id, kind: "daily_reminder", sent_on: u.local_date });
    if (claimErr) continue; // already claimed (conflict) — skip

    const [{ count: due }, { data: streak }, { data: warmup }, { data: nextLesson }, { data: lastComp }] =
      await Promise.all([
        db.from("vocab_reviews").select("id", { count: "exact", head: true })
          .eq("user_id", u.id).eq("suspended", false).lte("due_on", u.local_date),
        db.rpc("current_streak", { p_user: u.id }),
        db.from("vocab_reviews").select("vocab_items(farsi, transliteration, english)")
          .eq("user_id", u.id).eq("suspended", false).lte("due_on", u.local_date).limit(3),
        db.rpc("next_lesson_for", { p_user: u.id }),
        db.from("lesson_completions").select("negar_drill_done")
          .eq("user_id", u.id).order("completed_at", { ascending: false }).limit(1),
      ]);

    const site = Deno.env.get("SITE_URL");
    const nl = (nextLesson ?? [])[0];
    const drill = (warmup ?? [])
      .map((w) => {
        const v = w.vocab_items as unknown as { farsi: string; transliteration: string; english: string };
        return `<li>${FA_SPAN(v.farsi)} — <a href="${site}/review">show answer</a></li>`;
      }).join("");
    const html = `${EMAIL_HEAD}
      <p><b>${due ?? 0} cards due</b> — <a href="${site}/review">review now</a></p>
      ${nl ? `<p>Today's lesson: <b>L${nl.number} ${nl.title}</b> — <a href="${site}/lessons/${nl.slug}">open</a></p>` : ""}
      <p>Streak: ${Number(streak ?? 0)} days.</p>
      ${drill ? `<p>Warm-up:</p><ul>${drill}</ul>` : ""}
      ${(lastComp ?? [])[0]?.negar_drill_done === false ? `<p>The Negar drill for your last lesson is still open.</p>` : ""}
      <p style="color:#888;font-size:12px"><a href="${await unsubscribeUrl(u.id)}">unsubscribe</a></p>`;
    try {
      await sendEmail(u.email, `Farsi today: ${due ?? 0} cards due${nl ? `, L${nl.number}` : ""}`, html);
      sent++;
    } catch (e) {
      console.error(`send failed for ${u.id}: ${e}`); // claim row stays — no retry storm; next day sends again
    }
  }
  return Response.json({ sent, considered: (users ?? []).length });
});
```

Supporting SQL — append to `supabase/migrations/20260809000008_cron.sql` (before the cron.schedule):

```sql
-- selection per spec §Daily reminder email, plus the user's local date for claiming
create or replace function users_due_daily_email()
returns table (id uuid, email text, local_date date)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, (now() at time zone p.timezone)::date
  from profiles p
  where p.daily_email_enabled
    and extract(hour from (now() at time zone p.timezone)) = p.daily_email_hour
    and not exists (
      select 1 from email_log e
      where e.user_id = p.id and e.kind = 'daily_reminder'
        and e.sent_on = (now() at time zone p.timezone)::date);
$$;

create or replace function next_lesson_for(p_user uuid)
returns table (number smallint, title text, slug text)
language sql stable security definer set search_path = public as $$
  select l.number, l.title, l.slug
  from lessons l
  join courses c on c.id = l.course_id and c.owner_id = p_user
  where not exists (select 1 from lesson_completions lc
                    where lc.user_id = p_user and lc.lesson_id = l.id)
  order by l.number limit 1;
$$;

select cron.schedule('daily-study-reminder', '0 * * * *', $$
  select net.http_post(
    url     := current_setting('app.edge_url') || '/daily-reminder',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer ' || current_setting('app.service_role_key')),
    body    := '{}'::jsonb);
$$);

select cron.schedule('weekly-digest', '0 * * * 0', $$
  select net.http_post(
    url     := current_setting('app.edge_url') || '/weekly-digest',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer ' || current_setting('app.service_role_key')),
    body    := '{}'::jsonb);
$$);
```

(`app.edge_url` and `app.service_role_key` are set per-environment: locally via `alter database postgres set app.edge_url = 'http://host.docker.internal:54321/functions/v1'` etc.; on cloud in Task 19.)

- [ ] **Step 3: Weekly digest function**

`supabase/functions/weekly-digest/index.ts` — same auth/claim skeleton as daily-reminder with `kind: 'weekly_digest'`, selection = same query shape but additionally `extract(dow from (now() at time zone p.timezone)) = 0` (add function `users_due_weekly_digest()` to the migration, same body as `users_due_daily_email` with the dow condition and `kind = 'weekly_digest'`). Content per spec: lessons completed this week vs `target_lessons_per_week`; retention = grade≥3 share of `review_log` last 7 days; top 3 errors from `practice_sessions` last 7 days (unnest + count in SQL or JS-side aggregate like `/progress`); next 3 uncompleted lessons.

- [ ] **Step 4: Unsubscribe route**

`src/app/api/unsubscribe/route.ts`:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const uid = url.searchParams.get("uid") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const expected = createHmac("sha256", process.env.UNSUBSCRIBE_SECRET!).update(uid).digest("hex");
  const a = Buffer.from(token), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return new Response("invalid link", { status: 403 });
  const { error } = await createAdminClient().from("profiles")
    .update({ daily_email_enabled: false }).eq("id", uid);
  if (error) return new Response("failed", { status: 500 });
  return new Response("<h1>Unsubscribed</h1><p>Daily reminders are off. Re-enable them in Settings.</p>",
    { headers: { "Content-Type": "text/html" } });
}
```

- [ ] **Step 5: Test locally**

```bash
npx supabase db reset && npx supabase test db && npm run seed
# env for functions:
printf 'RESEND_API_KEY=<key>\nEMAIL_FROM=onboarding@resend.dev\nSITE_URL=http://localhost:3000\nUNSUBSCRIBE_SECRET=dev-secret-change-in-prod\n' > supabase/functions/.env
npx supabase functions serve --env-file supabase/functions/.env &
# force "now" to match: set your profile's daily_email_hour to the current LOCAL hour via /settings, then:
curl -s -X POST http://127.0.0.1:54321/functions/v1/daily-reminder \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | cat
```
Expected: `{"sent":1,"considered":1}`; a real email arrives (Resend test mode delivers to the account owner). Second curl within the hour: `{"sent":0,"considered":0}` — dedup works. Unsubscribe link in the email flips the setting (check `/settings`). `select * from email_log;` shows one row.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions supabase/migrations/20260809000008_cron.sql src/app/api/unsubscribe
git commit -m "feat: daily reminder and weekly digest emails with cron, dedup, unsubscribe"
```

---

### Task 19: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/review.spec.ts`
- Modify: `package.json` (script `"e2e": "playwright test"`)

**Interfaces:**
- Consumes: dev password login (Task 8), seeded data (Task 7), test user `mag@saf.com`/`localdev123` (Task 8 Step 3).

- [ ] **Step 1: Config + test**

```bash
npm i -D @playwright/test && npx playwright install chromium
```

`playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:3000" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true },
});
```

`e2e/review.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("login → dashboard → review a card with keyboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill("mag@saf.com");
  await page.getByPlaceholder("password (dev only)").fill("localdev123");
  await page.getByRole("button", { name: "Password sign-in" }).click();
  await expect(page.getByText("day streak")).toBeVisible();

  await page.goto("/review");
  // recognition card: space reveals, "3" grades Good and advances
  const counter = page.getByText(/1\/\d+/);
  await expect(counter).toBeVisible();
  await page.keyboard.press(" ");
  await page.keyboard.press("3");
  await expect(page.getByText(/2\/\d+/)).toBeVisible();
});

test("flashcards deck flips to conjugation table", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill("mag@saf.com");
  await page.getByPlaceholder("password (dev only)").fill("localdev123");
  await page.getByRole("button", { name: "Password sign-in" }).click();
  await page.goto("/flashcards?deck=conjugations");
  await page.keyboard.press(" ");
  await expect(page.locator("table")).toBeVisible();
});
```

- [ ] **Step 2: Run**

Run: `npx playwright test` — Expected: 2 passed. (Requires local supabase up + seeded + test user; the review test needs an unreviewed queue — run `npx supabase db reset && npm run seed` and recreate the test user first if prior manual testing consumed the daily limits.)

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts e2e package.json
git commit -m "test: playwright smoke for login, review keyboard flow, flashcards"
```

---

### Task 20: Deploy — cloud Supabase, Vercel, cron settings

⚠️ **PAUSE POINT:** user creates the cloud Supabase project and Vercel account, has Resend domain verified.

- [ ] **Step 1: Link + push database**

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push                    # applies all 8 migrations
npx supabase secrets set RESEND_API_KEY=<key> EMAIL_FROM=<verified-from> SITE_URL=<https://app-url> UNSUBSCRIBE_SECRET=<strong-random>
npx supabase functions deploy daily-reminder weekly-digest
```

- [ ] **Step 2: Seed cloud + configure cron settings**

Point `.env.local` at the cloud project (URL + keys), run `npm run seed`, then in the Supabase SQL editor:

```sql
alter database postgres set app.edge_url = 'https://<PROJECT_REF>.supabase.co/functions/v1';
alter database postgres set app.service_role_key = '<service-role-key>';
```
Enable `pg_cron` + `pg_net` in Dashboard → Database → Extensions if `db push` didn't. Verify: `select * from cron.job;` shows both jobs.

- [ ] **Step 3: Auth config**

Dashboard → Auth: set Site URL to the Vercel URL, add `/auth/callback` redirect; enable Google provider (client ID/secret from Google Cloud Console, authorized redirect `https://<PROJECT_REF>.supabase.co/auth/v1/callback`).

- [ ] **Step 4: Vercel**

```bash
npx vercel --prod
```
Env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `UNSUBSCRIBE_SECRET`, `NEXT_PUBLIC_SITE_URL` — and **do not set** `NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN` (password form stays dev-only).

- [ ] **Step 5: End-to-end verification**

Sign in via magic link on the production URL; complete the current lesson; run a review session on a phone; confirm the reminder email arrives at the configured hour (set `daily_email_hour` to the next upcoming hour to test same-day); `select * from email_log;` on cloud shows the send.

- [ ] **Step 6: Commit any deploy tweaks + tag**

```bash
git add -A && git commit -m "chore: deploy configuration" && git tag v1.0
```

---

### Task 21: `/import` — paste a content package

*(Execution order: any time after Tasks 7, 8, and 15 — before Task 19's e2e run. Numbering is historical.)*

**Files:**
- Create: `src/app/import/page.tsx`, `src/app/import/actions.ts`, `src/components/ImportForm.tsx`

**Interfaces:**
- Consumes: `ContentPackageSchema`, `importContentPackage`, `ImportResult` (Task 7); `createClient` (Task 8).
- Produces: `importPackage(raw: string, confirm: boolean): Promise<{ ok: true; preview?: Preview; result?: ImportResult } | { ok: false; errors: string[] }>` server action, where `Preview = { courseName: string; courseExists: boolean; units: number; lessons: { total: number; new: number; updated: number }; vocab: number; exercises: number }`. `confirm=false` validates + computes the preview against the DB (which lesson numbers already exist in the matching course); `confirm=true` runs `importContentPackage` as the authenticated user (owner RLS enforces everything). Zod errors are returned verbatim (`z.prettifyError` / issue list) so the user can paste them back to their agent.

- [ ] **Step 1: Server action**

`src/app/import/actions.ts`:

```ts
"use server";
import { createClient } from "@/lib/supabase/server";
import { ContentPackageSchema, importContentPackage, type ImportResult } from "@/lib/content-package";

export type Preview = {
  courseName: string; courseExists: boolean; units: number;
  lessons: { total: number; new: number; updated: number };
  vocab: number; exercises: number;
};
export type ImportOutcome =
  | { ok: true; preview?: Preview; result?: ImportResult }
  | { ok: false; errors: string[] };

export async function importPackage(raw: string, confirm: boolean): Promise<ImportOutcome> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, errors: ["not authenticated"] };

  let json: unknown;
  try { json = JSON.parse(raw); }
  catch (e) { return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] }; }
  const parsed = ContentPackageSchema.safeParse(json);
  if (!parsed.success)
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const pkg = parsed.data;

  if (!confirm) {
    const { data: course } = await supabase.from("courses")
      .select("id").eq("owner_id", user.id).eq("name", pkg.course.name).maybeSingle();
    let existingNumbers = new Set<number>();
    if (course) {
      const { data: ls } = await supabase.from("lessons")
        .select("number").eq("course_id", course.id);
      existingNumbers = new Set((ls ?? []).map((l) => l.number));
    }
    const newCount = pkg.lessons.filter((l) => !existingNumbers.has(l.number)).length;
    return { ok: true, preview: {
      courseName: pkg.course.name, courseExists: !!course,
      units: new Set([...pkg.units.map((u) => u.number),
                      ...pkg.lessons.flatMap((l) => l.unit ? [l.unit] : [])]).size,
      lessons: { total: pkg.lessons.length, new: newCount, updated: pkg.lessons.length - newCount },
      vocab: pkg.lessons.reduce((a, l) => a + (l.vocab?.length ?? 0), 0),
      exercises: pkg.lessons.reduce((a, l) => a + (l.exercises?.length ?? 0), 0),
    }};
  }

  try {
    const result = await importContentPackage(supabase, user.id, pkg);
    return { ok: true, result };
  } catch (e) { return { ok: false, errors: [(e as Error).message] }; }
}
```

- [ ] **Step 2: Import form + page**

`src/components/ImportForm.tsx`:

```tsx
"use client";
import { useState } from "react";
import { importPackage, type ImportOutcome } from "@/app/import/actions";

export function ImportForm() {
  const [raw, setRaw] = useState("");
  const [out, setOut] = useState<ImportOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(confirm: boolean) {
    setBusy(true);
    setOut(await importPackage(raw, confirm));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <textarea value={raw} onChange={(e) => { setRaw(e.target.value); setOut(null); }}
        placeholder='Paste your content-package JSON here ({"format":"farsi-tracker/content-package",...})'
        className="h-64 rounded border p-3 font-mono text-xs" />
      <input type="file" accept=".json" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (f) { setRaw(await f.text()); setOut(null); }
      }} />
      {!out?.ok || !out.preview ? (
        <button disabled={!raw || busy} onClick={() => run(false)}
          className="rounded bg-black p-3 text-white disabled:opacity-40">Validate</button>
      ) : null}
      {out && !out.ok && (
        <div className="rounded bg-red-50 p-3 text-sm text-red-800">
          <p className="mb-1 font-semibold">Validation failed — paste these errors back to your agent:</p>
          <ul className="list-disc pl-5">{out.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {out?.ok && out.preview && (
        <div className="rounded bg-gray-50 p-3 text-sm">
          <p>Course <b>{out.preview.courseName}</b>{out.preview.courseExists ? " (existing)" : " (new)"}:{" "}
            {out.preview.units} units · {out.preview.lessons.total} lessons
            ({out.preview.lessons.new} new, {out.preview.lessons.updated} updated) ·{" "}
            {out.preview.vocab} vocab · {out.preview.exercises} exercises</p>
          <p className="mt-1 text-gray-500">Your review history is never modified by imports.</p>
          <button disabled={busy} onClick={() => run(true)}
            className="mt-2 rounded bg-black px-4 py-2 text-white">Import</button>
        </div>
      )}
      {out?.ok && out.result && (
        <p className="rounded bg-green-50 p-3 text-green-800">
          Imported: {out.result.lessons} lessons, {out.result.vocab} vocab, {out.result.exercises} exercises.</p>
      )}
    </div>
  );
}
```

`src/app/import/page.tsx`:

```tsx
import Link from "next/link";
import { ImportForm } from "@/components/ImportForm";

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-2xl font-bold">Import content</h1>
      <p className="mb-6 text-sm text-gray-600">
        Paste a content-package JSON produced by your AI agent. Need one? Grab a
        generator prompt from <Link href="/prompts" className="underline">Prompts</Link>.
      </p>
      <ImportForm />
    </main>
  );
}
```

Add `["/import", "Import"], ["/prompts", "Prompts"]` to the `LINKS` array in `src/components/Nav.tsx` (Task 10).

- [ ] **Step 3: Verify + build + commit**

`npm run dev` → `/import`: paste `{"format":"farsi-tracker/content-package","version":1,"course":{"name":"Test"},"lessons":[{"number":1,"title":"Hello","vocab":[{"farsi":"سلام","transliteration":"salâm","english":"hello"}]}]}` → Validate shows "Course Test (new): … 1 lessons (1 new…)" → Import succeeds → the course exists (`select * from courses;`). Paste broken JSON → readable error list. Paste a package with an unknown exercise type → zod error names the path. Run: `npm run build`.

```bash
git add src/app/import src/components/ImportForm.tsx src/components/Nav.tsx
git commit -m "feat: /import - validate, preview, and import content-package JSON"
```

---

### Task 22: `/prompts` — agent prompt library

*(Execution order: after Task 21.)*

**Files:**
- Create: `src/lib/agent-prompts.ts`, `src/app/prompts/page.tsx`, `tests/agent-prompts.test.ts`

**Interfaces:**
- Consumes: `CopyPromptButton` (Task 16), `createClient` (Task 8).
- Produces (from `src/lib/agent-prompts.ts`, pure/testable):
  - `type CourseState = { courseName: string; maxLesson: number; unitTitles: string[]; grammarCovered: string[]; recentVocab: string[]; lessons: { number: number; title: string; grammar: string[]; vocab: string[] }[] }`
  - `buildCreateCoursePrompt(): string`
  - `buildNextLessonsPrompt(state: CourseState, count: number): string`
  - `buildExercisesPrompt(state: CourseState, lessonNumber: number): string`
  - `buildAddVocabPrompt(state: CourseState): string`
  - All four embed: the full JSON schema description (a `SCHEMA_DOC` string constant kept in this file, matching spec §Content packages), the Persian orthography rules (ZWNJ required inside می‌/plural/ezâfe forms, Persian ی/ک codepoints only, Persian digits), and the closing instruction "Output ONLY the JSON object, no prose, no markdown fences."

- [ ] **Step 1: Failing tests**

`tests/agent-prompts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCreateCoursePrompt, buildNextLessonsPrompt, buildExercisesPrompt,
  buildAddVocabPrompt, type CourseState } from "../src/lib/agent-prompts";

const state: CourseState = {
  courseName: "Farsi", maxLesson: 10, unitTitles: ["Unit 1"],
  grammarCovered: ["ezâfe", "را", "present stems"],
  recentVocab: ["رفتن", "کتاب"],
  lessons: [{ number: 4, title: "Present Tense I", grammar: ["می- prefix"], vocab: ["رفتن", "آمدن"] }],
};

describe("agent prompts", () => {
  it("every prompt embeds format id, schema and output rule", () => {
    for (const p of [buildCreateCoursePrompt(), buildNextLessonsPrompt(state, 5),
      buildExercisesPrompt(state, 4), buildAddVocabPrompt(state)]) {
      expect(p).toContain("farsi-tracker/content-package");
      expect(p).toContain('"version": 1');
      expect(p).toMatch(/ZWNJ|U\+200C/);
      expect(p).toContain("Output ONLY the JSON");
    }
  });
  it("next-lessons prompt embeds course position", () => {
    const p = buildNextLessonsPrompt(state, 5);
    expect(p).toContain("lesson 11");          // continues after maxLesson 10
    expect(p).toContain("ezâfe");              // covered grammar listed
    expect(p).toContain("رفتن");               // existing vocab to avoid duplicating
  });
  it("exercises prompt scopes to one lesson", () => {
    const p = buildExercisesPrompt(state, 4);
    expect(p).toContain("Present Tense I");
    expect(p).toContain("آمدن");
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/agent-prompts.ts` — `SCHEMA_DOC` is a readable schema description with one full example package (copy the JSON example from spec §Content packages verbatim into the constant), followed by the orthography rules block:

```ts
export const SCHEMA_DOC = `
You must return a single JSON object in the "farsi-tracker/content-package" format:
{ "format": "farsi-tracker/content-package", "version": 1, ... }
<paste the full schema example + field notes from the spec here>

Persian orthography rules (mandatory):
- Use ZWNJ (U+200C) inside words where Persian requires it: می‌روم, کتاب‌ها — never a plain space, never omitted.
- Use Persian codepoints only: ی (U+06CC) not ي, ک (U+06A9) not ك.
- Digits inside Persian text use the Persian block: ۰۱۲۳۴۵۶۷۸۹.
- exercises[].type must be one of: en_to_fa, fa_to_en, cloze, scramble.
`;

export type CourseState = {
  courseName: string; maxLesson: number; unitTitles: string[];
  grammarCovered: string[]; recentVocab: string[];
  lessons: { number: number; title: string; grammar: string[]; vocab: string[] }[];
};

const CLOSING = "Output ONLY the JSON object, no prose, no markdown fences.";

export function buildCreateCoursePrompt(): string {
  return `You are designing a complete beginner Farsi curriculum as a content package.
Design 2 units of 10 lessons each (numbers 1-20), each lesson with 12-18 vocab items
(verbs must include present_stem and past_stem) and 8-12 exercises mixing all four types.
${SCHEMA_DOC}
${CLOSING}`;
}

export function buildNextLessonsPrompt(s: CourseState, count: number): string {
  return `You are extending the Farsi course "${s.courseName}". It currently ends at lesson ${s.maxLesson}.
Generate lessons ${s.maxLesson + 1} through ${s.maxLesson + count} (start at lesson ${s.maxLesson + 1}).
Grammar already covered (build on it, do not re-teach): ${s.grammarCovered.join(", ")}.
Vocabulary already taught (do NOT duplicate): ${s.recentVocab.join("، ")}.
Each lesson: 12-18 new vocab items (verbs with stems) and 8-12 exercises mixing all four types.
${SCHEMA_DOC}
${CLOSING}`;
}

export function buildExercisesPrompt(s: CourseState, lessonNumber: number): string {
  const l = s.lessons.find((x) => x.number === lessonNumber);
  if (!l) throw new Error(`no lesson ${lessonNumber}`);
  return `Generate exercises for lesson ${l.number} "${l.title}" of the Farsi course "${s.courseName}".
Grammar points of this lesson: ${l.grammar.join(", ")}.
Vocabulary of this lesson (use these words): ${l.vocab.join("، ")}.
Return a package whose "lessons" array contains ONLY: {"number": ${l.number}, "title": "${l.title}", "exercises": [10-14 items mixing en_to_fa, fa_to_en, cloze, scramble]}.
${SCHEMA_DOC}
${CLOSING}`;
}

export function buildAddVocabPrompt(s: CourseState): string {
  return `Add supplementary vocabulary to the Farsi course "${s.courseName}".
Existing vocabulary sample (do NOT duplicate): ${s.recentVocab.join("، ")}.
Return a package whose lessons contain only "number", "title" and "vocab" arrays,
attaching new words to the existing lessons they fit best (lessons 1-${s.maxLesson}).
${SCHEMA_DOC}
${CLOSING}`;
}
```

Run: `npm test` — Expected: PASS.

- [ ] **Step 3: Page**

`src/app/prompts/page.tsx` — server component: load active course (`profiles.active_course_id` → `courses`), its lessons (number, title, grammar_points), vocab `farsi` list (cap `recentVocab` at the 60 most recent), assemble `CourseState`, render four sections each with a heading, a one-line "when to use this", a `<details>` block showing the prompt text in a `<pre className="whitespace-pre-wrap">`, and a `CopyPromptButton prompt={...}`. The next-lessons section includes a count `<select>` (1/5/10, default 5) driven by a `?count=` search param. Users with no course yet see only "Create a course".

- [ ] **Step 4: Verify + build + commit**

`npm run dev` → `/prompts`: copy "Generate the next lessons" → paste into any agent (or inspect): it names lesson 11, lists covered grammar, embeds the schema. Round-trip test: feed the copied prompt to an agent, paste its JSON into `/import` — validates and imports. Run: `npm run build`.

```bash
git add src/lib/agent-prompts.ts src/app/prompts tests/agent-prompts.test.ts
git commit -m "feat: /prompts - course-aware copy-paste generator prompts for AI agents"
```

---

## Self-Review Notes

- Spec coverage: every spec section maps to a task — Persian handling (T1/T2/T6/T9), data model incl. courses (T3/T14/T15), RLS owner-scoping (T4/T15), SRS (T5/T11/T12), content packages + import engine (T7/T21), agent prompts (T22), screens (T10 settings, T12 review, T13 flashcards, T14 lessons, T15 practice, T16 dashboard/export, T17 progress/vocab, T21 import, T22 prompts), email (T18), offline review (T11/T12), no-gamification (design-level, no XP anywhere), deploy (T20).
- Execution order note: tasks run 1→20 except T21/T22, which slot in after T15 and before T19 (the e2e task). T19's smoke tests and T20's deploy checklist come last.
- Known simplifications, accepted: `is_assessment` = number %10 == 0 heuristic (markdown seed path only; JSON packages set it explicitly); unit titles default to "Unit N" when not provided; scramble tiles keyed by index; Google OAuth untestable until Task 20; preview's new/updated split counts lessons only.
- Type consistency: `QueueCard` (T12) matches `get_review_queue` columns (T5); `PendingGrade`/`KVStore` names consistent between T11 tests and implementation; `Ex`/`Verb`/`DeckCard` defined where consumed; `ContentPackage`/`ImportResult` (T7) consumed by T21; `CourseState` (T22) self-contained.
- Course-scoping audit: content queries in T13/T14/T16/T17 rely on owner RLS (correct — users see only their own courses); `next_lesson_for` (T18) is security definer and therefore joins `courses.owner_id` explicitly; `get_review_queue`/`grade_card` (T5) are security invoker so RLS applies.
