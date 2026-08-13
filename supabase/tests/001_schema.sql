begin;
create extension if not exists pgtap;
select plan(17);

select has_table('languages');
select has_table('curriculums');
select has_table('units');
select has_table('lessons');
select has_table('vocab_items');
select has_table('exercises');
select has_table('exercise_attempts');
select has_table('vocab_reviews');
select has_table('review_log');
select has_table('study_days');
select has_table('lesson_completions');
select has_table('email_log');

select has_column('vocab_items', 'term');
select has_column('vocab_items', 'morphology');
select has_column('profiles', 'onboarded_at');

select results_eq(
  $$select normalize_term('fa', 'كتابِ  خوب')$$,
  $$select fa_normalize('كتابِ  خوب')$$,
  'normalize_term dispatches fa to fa_normalize'
);
select results_eq(
  $$select normalize_term('es', '  Hola   Mundo ')$$,
  $$select 'hola mundo'::text$$,
  'normalize_term default branch lowers/trims/collapses whitespace'
);

select * from finish();
rollback;
