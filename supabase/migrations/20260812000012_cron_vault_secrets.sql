-- Hosted Supabase denies `alter database ... set app.*` to the postgres role, so the
-- cron jobs can't rely on current_setting(). Switch to the documented Vault pattern:
-- secrets named 'edge_url' and 'service_role_key' are stored per-environment via
-- `select vault.create_secret(<value>, <name>)` (never in a migration), and the cron
-- commands read them at fire time. Jobs error harmlessly until the secrets exist.

select cron.unschedule('daily-study-reminder');
select cron.unschedule('weekly-digest');

select cron.schedule('daily-study-reminder', '0 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url') || '/daily-reminder',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer ' ||
               (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb);
$$);

select cron.schedule('weekly-digest', '0 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url') || '/weekly-digest',
    headers := jsonb_build_object('Content-Type','application/json',
               'Authorization','Bearer ' ||
               (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body    := '{}'::jsonb);
$$);
