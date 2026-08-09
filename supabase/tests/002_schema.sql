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
