-- ============ Task 18: daily reminder + weekly digest emails, cron, unsubscribe ============
-- Copied from 20260809000009_cron.sql (email-selection functions + next_lesson_for/top_errors_for)
-- with the Rename Map applied to next_lesson_for (courses -> curriculums, *.course_id ->
-- *.curriculum_id); users_due_daily_email/users_due_weekly_digest/top_errors_for have no
-- course/curriculum reference and are copied verbatim. None of these five functions reference
-- auth.* (they take p_user as an explicit parameter or operate on profiles directly), so unlike
-- 20260813100004_functions.sql's guarded functions, none need the pg_namespace guard to apply
-- cleanly on a bare scratch database.
--
-- The two cron.schedule blocks below are copied verbatim from 20260812000012_cron_vault_secrets.sql
-- (the current authoritative version — reads Vault secrets 'edge_url'/'service_role_key' instead of
-- current_setting('app.*'), since hosted Supabase denies `alter database ... set app.*` to the
-- postgres role) WITHOUT its leading cron.unschedule calls, since a fresh database has no
-- pre-existing jobs to unschedule. pg_cron can only be created in the database named by
-- cron.database_name (see 20260813100001_extensions.sql's guard for the same root cause), so
-- cron.schedule is guarded on pg_cron actually being installed, letting this file also apply
-- cleanly to a bare scratch database validated under a different database name.

-- selection per spec Daily reminder email, plus the user's local date for claiming
create or replace function users_due_daily_email()
returns table (id uuid, email text, local_date date)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, (now() at time zone p.timezone)::date
  from profiles p
  where p.daily_email_enabled
    and extract(hour from (now() at time zone p.timezone)) = p.daily_email_hour
    and not exists (
      select 1 from email_log e
      where e.user_id = p.id and e.kind = 'daily_reminder'
        and e.sent_on = (now() at time zone p.timezone)::date);
$$;

-- same shape as users_due_daily_email, additionally gated to local Sunday, dedup on weekly_digest
create or replace function users_due_weekly_digest()
returns table (id uuid, email text, local_date date)
language sql stable security definer set search_path = public as $$
  select p.id, p.email, (now() at time zone p.timezone)::date
  from profiles p
  where p.daily_email_enabled
    and extract(hour from (now() at time zone p.timezone)) = p.daily_email_hour
    and extract(dow from (now() at time zone p.timezone)) = 0
    and not exists (
      select 1 from email_log e
      where e.user_id = p.id and e.kind = 'weekly_digest'
        and e.sent_on = (now() at time zone p.timezone)::date);
$$;

-- p_limit lets weekly-digest ask for the next 3 uncompleted lessons; daily-reminder uses the default (1)
create or replace function next_lesson_for(p_user uuid, p_limit int default 1)
returns table (number smallint, title text, slug text)
language sql stable security definer set search_path = public as $$
  select l.number, l.title, l.slug
  from lessons l
  join curriculums c on c.id = l.curriculum_id and c.owner_id = p_user
  where not exists (select 1 from lesson_completions lc
                    where lc.user_id = p_user and lc.lesson_id = l.id)
  order by l.number limit p_limit;
$$;

-- top errors from practice_sessions.errors (text[]) in the last 7 local days
create or replace function top_errors_for(p_user uuid, p_since timestamptz, p_limit int default 3)
returns table (error text, occurrences bigint)
language sql stable security definer set search_path = public as $$
  select e, count(*) as occurrences
  from practice_sessions ps, unnest(ps.errors) as e
  where ps.user_id = p_user and ps.occurred_at >= p_since
  group by e
  order by occurrences desc, e
  limit p_limit;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('daily-study-reminder', '0 * * * *', $sched$
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url') || '/daily-reminder',
        headers := jsonb_build_object('Content-Type','application/json',
                   'Authorization','Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
        body    := '{}'::jsonb);
    $sched$);

    perform cron.schedule('weekly-digest', '0 * * * *', $sched$
      select net.http_post(
        url     := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url') || '/weekly-digest',
        headers := jsonb_build_object('Content-Type','application/json',
                   'Authorization','Bearer ' ||
                   (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
        body    := '{}'::jsonb);
    $sched$);
  else
    raise notice 'skipping cron.schedule (daily-study-reminder, weekly-digest): pg_cron not installed (bare scratch DB)';
  end if;
end $$;

-- defense-in-depth: these functions are security definer and only meant to be called
-- via the edge functions using the service_role key; revoke the default PostgREST-exposed
-- execute grants from public/anon/authenticated.
-- NOTE: unlike Postgres superusers, `service_role` here does NOT bypass GRANT/REVOKE — it only
-- has BYPASSRLS (see 20260813100003_rls_grants.sql for the same caveat on table grants).
-- Verified locally: `select has_function_privilege('service_role', 'users_due_daily_email()', 'execute')`
-- returns false immediately after a bare `revoke ... from public, anon, authenticated` (function owner
-- is `postgres`, not `service_role`), and the daily-reminder edge function fails with
-- "permission denied for function users_due_daily_email" until the explicit grant below is added.
-- So each revoke is paired with an explicit re-grant to service_role.
revoke execute on function users_due_daily_email() from public, anon, authenticated;
revoke execute on function users_due_weekly_digest() from public, anon, authenticated;
revoke execute on function next_lesson_for(uuid, int) from public, anon, authenticated;
revoke execute on function top_errors_for(uuid, timestamptz, int) from public, anon, authenticated;

grant execute on function users_due_daily_email() to service_role;
grant execute on function users_due_weekly_digest() to service_role;
grant execute on function next_lesson_for(uuid, int) to service_role;
grant execute on function top_errors_for(uuid, timestamptz, int) to service_role;

-- Vault secrets 'edge_url' / 'service_role_key' are created per-environment via
--   select vault.create_secret(<value>, <name>);
-- (never in a migration — see 20260812000012_cron_vault_secrets.sql). Until they exist, the
-- scheduled jobs above will error harmlessly in cron.job_run_details — expected local behavior.
