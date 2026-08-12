begin;
create extension if not exists pgtap;
select plan(4);

select has_table('oauth_clients');
select has_table('oauth_codes');

-- privilege boundary: authenticated role may NOT read oauth tables (RLS enabled, zero policies)
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000dd', 'oauth@example.com');
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000dd', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok(
  $$select * from oauth_clients$$,
  '42501', null, 'authenticated cannot select oauth_clients');
select throws_ok(
  $$select * from oauth_codes$$,
  '42501', null, 'authenticated cannot select oauth_codes');

select * from finish();
rollback;
