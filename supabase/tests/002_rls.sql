-- Two-tenant RLS suite. Structure copied from supabase/tests/003_rls.sql (the old two-tenant
-- suite) with the Rename Map applied (courses -> curriculums, farsi/english -> term/translation,
-- etc.), plus an anon-denied check the old suite didn't have. This file needs a real `auth`
-- schema (auth.users, auth.uid(), the on_auth_user_created trigger) to execute — the v2 baseline
-- scratch DB (baseline_v2) is intentionally bare of the auth schema for Tasks 1/2's isolated
-- validation (see 20260813100002_schema.sql's guards), so running this file end-to-end is
-- Task 12's job, against the real local Supabase stack. For now this is parse/structure-validated
-- only.
begin;
create extension if not exists pgtap;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');
insert into curriculums (id, owner_id, name, language_code) values
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Farsi', 'fa');
insert into lessons (curriculum_id, number, title, slug) values
  ('c0000000-0000-0000-0000-000000000001', 1, 'Greetings', 'greetings');
insert into vocab_items (curriculum_id, term, transliteration, translation, lesson_id)
  values ('c0000000-0000-0000-0000-000000000001', 'سلام', 'salâm', 'hello',
          (select id from lessons where number = 1));
insert into vocab_reviews (user_id, vocab_id)
  values ('00000000-0000-0000-0000-00000000000a', (select id from vocab_items limit 1));

-- act as user A (the curriculum owner)
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000a', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*)::int from profiles), 1, 'A sees only own profile');
select is((select count(*)::int from vocab_reviews), 1, 'A sees own review row');
select is((select count(*)::int from curriculums), 1, 'A sees own curriculum');
select is((select count(*)::int from vocab_items), 1, 'A reads own curriculum content');
select lives_ok(
  $$insert into vocab_items (curriculum_id, term, transliteration, translation)
    values ('c0000000-0000-0000-0000-000000000001','تست','test','test')$$,
  'owner can write own curriculum content');

-- act as user B (not the owner)
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-00000000000b', 'role', 'authenticated')::text, true);
select is((select count(*)::int from vocab_reviews), 0, 'B cannot see A''s reviews');
select is((select count(*)::int from lessons), 0, 'B cannot see A''s curriculum content');
select throws_ok(
  $$insert into vocab_items (curriculum_id, term, transliteration, translation)
    values ('c0000000-0000-0000-0000-000000000001','x','x','x')$$,
  '42501', null, 'B cannot write into A''s curriculum');

-- act as anon (no table grants at all — anon was never granted select/insert/update/delete
-- in 20260813100003_rls_grants.sql, unlike authenticated/service_role)
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$select * from curriculums$$,
  '42501', null, 'anon denied select on curriculums (no grant)');
select throws_ok(
  $$select * from vocab_items$$,
  '42501', null, 'anon denied select on vocab_items (no grant)');

reset role;
select is((select count(*)::int from profiles), 2, 'service context sees all');

select * from finish();
rollback;
