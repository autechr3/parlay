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
