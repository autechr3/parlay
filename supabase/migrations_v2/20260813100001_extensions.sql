create extension if not exists pg_trgm;
create extension if not exists pg_net;
-- pg_cron is enabled via config on hosted Supabase; enable locally too. pg_cron can only be
-- created in the database named by the cron.database_name GUC (normally 'postgres' on the
-- local/hosted stack); guard so this file also applies cleanly to a bare scratch database
-- created under a different name for isolated validation.
do $$
begin
  if current_setting('cron.database_name', true) is null
     or current_setting('cron.database_name', true) = current_database() then
    create extension if not exists pg_cron;
  else
    raise notice 'skipping pg_cron: this database (%) is not cron.database_name (%)',
      current_database(), current_setting('cron.database_name', true);
  end if;
end $$;

create or replace function fa_normalize(input text)
returns text
language sql
immutable
strict
as $$
  select trim(
    regexp_replace(          -- collapse runs of whitespace
      regexp_replace(        -- ZWNJ -> space
        regexp_replace(      -- strip harakat U+064B..U+0652
          translate(input, 'يكةأإآؤئ', 'یکهاااوی'),
          '[ً-ْ]', '', 'g'
        ),
        '‌', ' ', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;
