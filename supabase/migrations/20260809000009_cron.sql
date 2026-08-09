-- ============ Task 18: daily reminder + weekly digest emails, cron, unsubscribe ============

-- selection per spec §Daily reminder email, plus the user's local date for claiming
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
  join courses c on c.id = l.course_id and c.owner_id = p_user
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

select cron.schedule('daily-study-reminder', '0 * * * *', $$
  select net.http_post(
    url     := current_setting('app.edge_url') || '/daily-reminder',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer ' || current_setting('app.service_role_key')),
    body    := '{}'::jsonb);
$$);

select cron.schedule('weekly-digest', '0 * * * *', $$
  select net.http_post(
    url     := current_setting('app.edge_url') || '/weekly-digest',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer ' || current_setting('app.service_role_key')),
    body    := '{}'::jsonb);
$$);

-- defense-in-depth: these functions are security definer and only meant to be called
-- via the edge functions using the service_role key; revoke the default PostgREST-exposed
-- execute grants from public/anon/authenticated.
-- NOTE: unlike Postgres superusers, `service_role` here does NOT bypass GRANT/REVOKE — it only
-- has BYPASSRLS (see 20260809000006_service_role_grants.sql for the same caveat on table grants).
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

-- app.edge_url / app.service_role_key are set per-environment:
--   locally:  alter database postgres set app.edge_url = 'http://host.docker.internal:54321/functions/v1';
--             alter database postgres set app.service_role_key = '<service role key>';
--   on cloud: Task 19.
-- Until set, the scheduled jobs above will error harmlessly in cron.job_run_details
-- (current_setting() raises "unrecognized configuration parameter") — expected local behavior.
