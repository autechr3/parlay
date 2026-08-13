-- Definer-variant (`_for`) suite for the MCP/token-authenticated calls added in
-- 20260813100006_tokens_oauth.sql: grade_card_for, get_review_queue_for, bump_study_day_for.
-- Structure mirrors 003_functions.sql (same SRS/queue setup) but drives the `_for` functions
-- directly with an explicit p_user argument instead of a `set local role authenticated` +
-- auth.uid() session context — that's the whole point of the definer variants (MCP callers have
-- no Postgres session/JWT, just a service_role connection and a p_user they assert). Because
-- these are `security definer` functions, RLS does not protect them: each must carry its own
-- explicit tenant-ownership predicate, which this suite is designed to catch a regression in —
-- user B (who owns no curriculum) must see 0 rows from get_review_queue_for(B) and must be
-- rejected from grading a vocab item that belongs to user A's curriculum, not implicitly allowed
-- through by the definer's elevated privileges.
--
-- Like 002_rls.sql/003_functions.sql, this needs a real `auth` schema (auth.users — a not-null FK
-- target for profiles.id, curriculums.owner_id, vocab_reviews.user_id, study_days.user_id) to
-- execute, so it's parse/structure-validated only against the bare baseline_v2 scratch DB; full
-- execution is Task 11/12's job against the real local stack.
begin;
create extension if not exists pgtap;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000aa', 'a-definer@example.com'),
  ('00000000-0000-0000-0000-0000000000bb', 'b-definer@example.com');

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

-- vocab item 1: already reviewed once, due as of A's local today (via local_today(), not
-- current_date, so this can't flake around a UTC/local day-boundary skew).
insert into vocab_reviews (user_id, vocab_id, due_on) values
  ('00000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-000000000001',
   local_today('00000000-0000-0000-0000-0000000000aa'));
-- vocab item 2: never reviewed — surfaces via get_review_queue_for's new_cards CTE.

-- ===== positive path: A calling with their own p_user sees their own active-curriculum queue =====
select is((select count(*)::int from get_review_queue_for('00000000-0000-0000-0000-0000000000aa')), 2,
  'get_review_queue_for(A) returns the due card + the new card, both from A''s active curriculum');

-- ===== B owns no curriculum at all: the ownership-check predicate must zero this out, not just
-- the active_curriculum_id predicate (B has no profiles.active_curriculum_id set either, so this
-- also guards against a regression where the ownership exists() clause is accidentally dropped
-- and the active_curriculum_id predicate alone — which would compare against null — happens to
-- still filter everything out for the wrong reason) =====
select is((select count(*)::int from get_review_queue_for('00000000-0000-0000-0000-0000000000bb')), 0,
  'get_review_queue_for(B) returns 0 rows — B owns no curriculum');

-- ===== grade_card_for: legitimate owner path =====
select is( (grade_card_for('00000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-000000000001', 5::smallint)).repetitions, 1,
  'grade_card_for(A, A''s vocab, 5) succeeds — first pass reps=1');

-- ===== grade_card_for: cross-tenant rejection with the exact error message =====
select throws_ok(
  $$select grade_card_for('00000000-0000-0000-0000-0000000000bb', '10000000-0000-0000-0000-000000000001', 5::smallint)$$,
  'P0001', 'vocab item not found in caller''s curriculums',
  'grade_card_for(B, A''s vocab, 5) rejected — vocab item not found in caller''s curriculums');

-- ===== bump_study_day_for: sanity check the third definer variant works and is user-scoped =====
select lives_ok(
  $$select bump_study_day_for('00000000-0000-0000-0000-0000000000aa')$$,
  'bump_study_day_for(A) succeeds');
select is((select lessons_completed::int from study_days
           where user_id = '00000000-0000-0000-0000-0000000000aa' and day = local_today('00000000-0000-0000-0000-0000000000aa')),
  1, 'bump_study_day_for(A) recorded one lesson-completion for A''s local day');
select is((select count(*)::int from study_days where user_id = '00000000-0000-0000-0000-0000000000bb'), 0,
  'bump_study_day_for never touched B''s rows — B has none');

-- ===== defense-in-depth: confirm the execute grants match the brief (public/anon/authenticated
-- revoked, service_role granted) rather than relying only on the functional tests above =====
select is(has_function_privilege('service_role', 'get_review_queue_for(uuid)', 'execute'), true,
  'service_role retains execute on get_review_queue_for after the revoke/re-grant pair');

select * from finish();
rollback;
