-- ===== user-scoped tables =====
alter table profiles enable row level security;
create policy "own profile" on profiles for all
  using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['lesson_completions','practice_sessions','skill_ratings',
                           'vocab_reviews','review_log','study_days','email_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ===== course content: owner only =====
alter table courses enable row level security;
create policy "own courses" on courses for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['units','lessons','vocab_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own course content" on %I for all
         using (course_id in (select id from courses where owner_id = auth.uid()))
         with check (course_id in (select id from courses where owner_id = auth.uid()))', t);
  end loop;
end $$;

-- ===== base table grants for the authenticated role =====
-- This local CLI's config.toml has `auto_expose_new_tables` unset, which matches the current
-- Supabase cloud default: tables get NO base privileges for anon/authenticated until granted
-- explicitly (RLS policies only ever narrow rows within privileges already granted at the table
-- level; they never grant access on their own). Every table above needs an explicit GRANT so its
-- new RLS policy has something to filter.
grant select, insert, update, delete on
  profiles, courses, units, lessons, vocab_items,
  lesson_completions, practice_sessions, skill_ratings,
  vocab_reviews, review_log, study_days, email_log
  to authenticated;

grant usage on sequence
  units_id_seq, lessons_id_seq, review_log_id_seq, email_log_id_seq
  to authenticated;
