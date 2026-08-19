begin;
create extension if not exists pgtap;
select plan(10);

select has_table('drills');
select has_table('drill_attempts');
select col_is_pk('drills', 'id');
select col_not_null('drills', 'payload');
select col_not_null('drills', 'language_code');
select has_column('drill_attempts', 'exercise_id');
select has_column('drill_attempts', 'ms_taken');
select ok((select relrowsecurity from pg_class where relname = 'drills'), 'drills has RLS enabled');
select ok((select relrowsecurity from pg_class where relname = 'drill_attempts'), 'drill_attempts has RLS enabled');
select fk_ok('drill_attempts', 'drill_id', 'drills', 'id');

select * from finish();
rollback;
