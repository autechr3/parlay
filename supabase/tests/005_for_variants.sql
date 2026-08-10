begin;
create extension if not exists pgtap;
select plan(11);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000bb', 'mcp@example.com');
insert into courses (id, owner_id, name) values
  ('c0000000-0000-0000-0000-0000000000bb', '00000000-0000-0000-0000-0000000000bb', 'Farsi');
insert into lessons (course_id, number, title, slug) values
  ('c0000000-0000-0000-0000-0000000000bb', 1, 'L1', 'l1');
insert into vocab_items (id, course_id, farsi, transliteration, english, lesson_id) values
  ('20000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-0000000000bb', 'کتاب', 'ketâb', 'book',
   (select id from lessons where slug = 'l1'));

select has_table('api_tokens');

-- definer variant works WITHOUT any auth context (superuser here stands in for service_role caller)
select is( (grade_card_for('00000000-0000-0000-0000-0000000000bb',
                           '20000000-0000-0000-0000-000000000001', 4::smallint)).repetitions,
           1, 'grade_card_for first pass reps=1');
select is( (select interval_days from vocab_reviews
            where user_id='00000000-0000-0000-0000-0000000000bb'), 1, 'interval 1');
select is( (select count(*)::int from review_log
            where user_id='00000000-0000-0000-0000-0000000000bb'), 1, 'review logged');
select is( (select cards_reviewed from study_days
            where user_id='00000000-0000-0000-0000-0000000000bb'), 1::smallint, 'study day bumped');

-- queue variant sees the user's course content and excludes the just-graded card from new
select is( (select count(*)::int from get_review_queue_for('00000000-0000-0000-0000-0000000000bb')),
           0, 'queue empty: only card was just graded (due tomorrow), none new');

-- privilege boundary: authenticated role may NOT execute the definer variants
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000bb', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$select grade_card_for('00000000-0000-0000-0000-0000000000bb',
                          '20000000-0000-0000-0000-000000000001', 4::smallint)$$,
  '42501', null, 'authenticated cannot execute grade_card_for');
select throws_ok(
  $$select * from get_review_queue_for('00000000-0000-0000-0000-0000000000bb')$$,
  '42501', null, 'authenticated cannot execute get_review_queue_for');

-- second tenant: their content must be invisible to the first user's variants
reset role;  -- ensure superuser context for these direct calls/inserts
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000cc', 'other@example.com');
insert into courses (id, owner_id, name) values
  ('c0000000-0000-0000-0000-0000000000cc', '00000000-0000-0000-0000-0000000000cc', 'Farsi');
insert into lessons (course_id, number, title, slug) values
  ('c0000000-0000-0000-0000-0000000000cc', 1, 'L1', 'l1');
insert into vocab_items (id, course_id, farsi, transliteration, english) values
  ('20000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-0000000000cc', 'خانه', 'khâne', 'house');

select is( (select count(*)::int from get_review_queue_for('00000000-0000-0000-0000-0000000000bb')),
           0, 'user B''s vocab never appears in user A''s queue');
select is( (select count(*)::int from get_review_queue_for('00000000-0000-0000-0000-0000000000cc')),
           1, 'user B sees exactly their own new card');
select throws_ok(
  $$select grade_card_for('00000000-0000-0000-0000-0000000000bb',
                          '20000000-0000-0000-0000-000000000002', 4::smallint)$$,
  'vocab item not found in caller''s courses',
  'A cannot grade B''s vocab');

select * from finish();
rollback;
