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
