-- Every `create policy` below references auth.uid() (directly, or via dynamic SQL in a loop).
-- Postgres parses/analyzes a CREATE POLICY's USING/WITH CHECK expressions immediately, so on a
-- bare scratch database with no `auth` schema (see 20260813100002_schema.sql's header comment
-- and guard for the same issue) these fail at creation time with "schema auth does not exist" —
-- confirmed empirically against the baseline_v2 scratch DB. Each policy-creating block below is
-- therefore wrapped in the same `pg_namespace` guard Task 1 used for objects touching the auth
-- schema, so this file also applies cleanly to a bare scratch database; on the real local/hosted
-- stack (auth schema present) every guard's condition is true and behavior is unchanged.

-- ===== user-scoped tables =====
-- Copied from 20260809000004_rls.sql with the Rename Map applied
-- (courses -> curriculums, *.course_id -> *.curriculum_id).
alter table profiles enable row level security;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $pol$create policy "own profile" on profiles for all
      using (auth.uid() = id) with check (auth.uid() = id)$pol$;
  else
    raise notice 'skipping policy "own profile": auth schema not present (bare scratch DB)';
  end if;
end $$;

do $$
declare
  t text;
  v_has_auth boolean := exists (select 1 from pg_namespace where nspname = 'auth');
begin
  foreach t in array array['lesson_completions','practice_sessions','skill_ratings',
                           'vocab_reviews','review_log','study_days','email_log']
  loop
    execute format('alter table %I enable row level security', t);
    if v_has_auth then
      execute format(
        'create policy "own rows" on %I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    end if;
  end loop;
  if not v_has_auth then
    raise notice 'skipping "own rows" policies (lesson_completions etc.): auth schema not present (bare scratch DB)';
  end if;
end $$;

-- ===== curriculum content: owner only =====
alter table curriculums enable row level security;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $pol$create policy "own curriculums" on curriculums for all
      using (owner_id = auth.uid()) with check (owner_id = auth.uid())$pol$;
  else
    raise notice 'skipping policy "own curriculums": auth schema not present (bare scratch DB)';
  end if;
end $$;

do $$
declare
  t text;
  v_has_auth boolean := exists (select 1 from pg_namespace where nspname = 'auth');
begin
  foreach t in array array['units','lessons','vocab_items']
  loop
    execute format('alter table %I enable row level security', t);
    if v_has_auth then
      execute format(
        'create policy "own curriculum content" on %I for all
           using (curriculum_id in (select id from curriculums where owner_id = auth.uid()))
           with check (curriculum_id in (select id from curriculums where owner_id = auth.uid()))', t);
    end if;
  end loop;
  if not v_has_auth then
    raise notice 'skipping "own curriculum content" policies (units/lessons/vocab_items): auth schema not present (bare scratch DB)';
  end if;
end $$;

-- ===== base table grants for the authenticated role =====
-- This local CLI's config.toml has `auto_expose_new_tables` unset, which matches the current
-- Supabase cloud default: tables get NO base privileges for anon/authenticated until granted
-- explicitly (RLS policies only ever narrow rows within privileges already granted at the table
-- level; they never grant access on their own). Every table above needs an explicit GRANT so its
-- new RLS policy has something to filter. Roles (`authenticated`, `service_role`) are cluster-wide
-- in Postgres, not per-database, so these grants apply cleanly even on a bare scratch database
-- created inside the same Supabase Postgres image (see Task 1's report) — no guard needed here.
grant select, insert, update, delete on
  profiles, curriculums, units, lessons, vocab_items,
  lesson_completions, practice_sessions, skill_ratings,
  vocab_reviews, review_log, study_days, email_log
  to authenticated;

grant usage on sequence
  units_id_seq, lessons_id_seq, review_log_id_seq, email_log_id_seq
  to authenticated;

-- ===== base table grants for the service_role =====
-- Copied from 20260809000006_service_role_grants.sql with the Rename Map applied.
-- 20260809000004_rls.sql granted base table privileges to `authenticated` only. `service_role`
-- has BYPASSRLS (it skips row-level security policies), but RLS bypass is orthogonal to Postgres's
-- GRANT system: without an explicit table-level grant, service_role still gets "permission denied"
-- on SELECT/INSERT/UPDATE/DELETE. The seed importer and future service-role tooling need
-- full CRUD here, so mirror the same tables/privileges already granted to `authenticated`.
grant select, insert, update, delete on
  profiles, curriculums, units, lessons, vocab_items,
  lesson_completions, practice_sessions, skill_ratings,
  vocab_reviews, review_log, study_days, email_log
  to service_role;

grant usage on sequence
  units_id_seq, lessons_id_seq, review_log_id_seq, email_log_id_seq
  to service_role;

-- ===== exercises / exercise_attempts =====
-- Copied from 20260809000008_exercises.sql lines ~28-45 with the Rename Map applied. The v2
-- schema file (20260813100002_schema.sql) created both tables but deliberately left their RLS
-- policy and grants for this file, per Task 2's brief.
alter table exercises enable row level security;
alter table exercise_attempts enable row level security;
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $pol$create policy "own curriculum content" on exercises for all
      using (curriculum_id in (select id from curriculums where owner_id = auth.uid()))
      with check (curriculum_id in (select id from curriculums where owner_id = auth.uid()))$pol$;
    execute $pol$create policy "own rows" on exercise_attempts for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id)$pol$;
  else
    raise notice 'skipping exercises/exercise_attempts policies: auth schema not present (bare scratch DB)';
  end if;
end $$;

grant select, insert, update, delete on exercises, exercise_attempts to authenticated;
grant select, insert, update, delete on exercises, exercise_attempts to service_role;

grant usage, select on sequence exercise_attempts_id_seq to authenticated, service_role;

-- ===== languages: shared reference data, read-only =====
-- New in v2 (brief Step 1) — not present in the old schema. Config facts seeded by migration;
-- no tenant scoping, no write access for authenticated. service_role also gets only select:
-- it bypasses RLS by design, but the GRANT system is orthogonal to that (see above), and there's
-- no write path that needs it for this table. `using (true)` doesn't reference auth.uid(), so
-- (unlike every policy above) this one needs no bare-scratch-DB guard.
alter table languages enable row level security;
create policy "read languages" on languages for select to authenticated using (true);
grant select on languages to authenticated, service_role;
