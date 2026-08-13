-- SRS + queue function suite. Structure copied from supabase/tests/004_grade_card.sql (grade_card
-- SM-2 math) with the Rename Map applied, plus new coverage for get_review_queue's active-
-- curriculum scoping (a v2-only behavior — the old queue scoped to every course/curriculum the
-- user owned via RLS alone; v2 additionally scopes to profiles.active_curriculum_id so only one
-- curriculum's cards surface at a time). Like 002_rls.sql, this needs a real `auth` schema
-- (auth.users, auth.uid(), the on_auth_user_created trigger) to execute, so it's parse/structure-
-- validated only for now; full execution is Task 11/12's job against the real local stack.
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'srs@example.com');

insert into curriculums (id, owner_id, name, language_code) values
  ('c0000000-0000-0000-0000-0000000000aa', '00000000-0000-0000-0000-0000000000aa', 'Farsi', 'fa');

-- active-curriculum scoping requires this to be set explicitly: profiles auto-created by the
-- on_auth_user_created trigger start with active_curriculum_id = null.
update profiles set active_curriculum_id = 'c0000000-0000-0000-0000-0000000000aa'
  where id = '00000000-0000-0000-0000-0000000000aa';

insert into lessons (curriculum_id, number, title, slug) values
  ('c0000000-0000-0000-0000-0000000000aa', 1, 'L1', 'l1');

insert into vocab_items (id, curriculum_id, term, transliteration, translation, lesson_id) values
  ('10000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000aa', 'سلام', 'salâm', 'hello', (select id from lessons where number=1)),
  ('10000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000aa', 'رفتن', 'raftan', 'to go', (select id from lessons where number=1));

-- vocab item 1: already reviewed once, due as of the user's local today (uses local_today()
-- itself rather than current_date, so this can't flake around a UTC/local day-boundary skew).
insert into vocab_reviews (user_id, vocab_id, due_on) values
  ('00000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-000000000001',
   local_today('00000000-0000-0000-0000-0000000000aa'));
-- vocab item 2: never reviewed — surfaces via get_review_queue's new_cards CTE.

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000aa', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*)::int from get_review_queue()), 2,
  'queue returns the due card + the new card, both from the active curriculum');

-- a second curriculum for the same user, with its own vocab item, must NOT affect the queue
-- while curriculum 1 remains active — active-only scoping, not "everything the user owns"
insert into curriculums (id, owner_id, name, language_code) values
  ('c0000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000aa', 'Farsi (second)', 'fa');
insert into vocab_items (curriculum_id, term, transliteration, translation) values
  ('c0000000-0000-0000-0000-0000000000bb', 'کتاب', 'ketâb', 'book');

select is((select count(*)::int from get_review_queue()), 2,
  'queue still returns 2 — second (inactive) curriculum not scoped in');

-- SM-2 grading: first pass on vocab item 1 (existing row, repetitions=0), grade 5
select is( (grade_card('10000000-0000-0000-0000-000000000001', 5::smallint)).repetitions, 1, 'first pass reps=1');
select is( (select interval_days from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 1, 'first pass interval 1');
select is( (select ease from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 2.60, 'grade 5 ease +0.10');

-- fail: lapse reset
select is( (grade_card('10000000-0000-0000-0000-000000000001', 1::smallint)).repetitions, 0, 'fail resets repetitions (lapse reset)');
select is( (select lapses from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 1, 'lapse counted');
select is( (select ease from vocab_reviews where vocab_id='10000000-0000-0000-0000-000000000001'), 2.40, 'fail ease -0.20');

reset role;
select * from finish();
rollback;
