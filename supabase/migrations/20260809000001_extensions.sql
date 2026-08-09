create extension if not exists pg_trgm;
create extension if not exists pg_net;
-- pg_cron is enabled via config on hosted Supabase; enable locally too:
create extension if not exists pg_cron;
