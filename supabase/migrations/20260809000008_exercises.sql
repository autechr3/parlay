-- ============ exercises ============
-- Authored per lesson by the lesson generator (fenced ```exercises yaml block in the
-- lesson markdown); imported by the seed script. Conjugation drills are NOT stored —
-- the app auto-generates them from that lesson's verb stems.
create table exercises (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  lesson_id int not null references lessons(id) on delete cascade,
  position smallint not null,
  type text not null check (type in ('en_to_fa','fa_to_en','cloze','scramble')),
  prompt text not null,     -- en_to_fa: English source · fa_to_en: Farsi source ·
                            -- cloze: Persian sentence containing ___ · scramble: English gloss
  answer text not null,     -- expected answer (Farsi except fa_to_en; scramble: full Persian sentence)
  accept text[] not null default '{}',  -- alternative accepted answers
  hint text,
  unique (lesson_id, position)
);

create table exercise_attempts (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  exercise_id uuid not null references exercises(id) on delete cascade,
  correct boolean not null,
  answer_given text,
  attempted_at timestamptz not null default now()
);

alter table exercises enable row level security;
create policy "own course content" on exercises for all
  using (course_id in (select id from courses where owner_id = auth.uid()))
  with check (course_id in (select id from courses where owner_id = auth.uid()));
alter table exercise_attempts enable row level security;
create policy "own rows" on exercise_attempts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== base table grants =====
-- This local CLI's config.toml has `auto_expose_new_tables` unset, matching the Supabase
-- cloud default: tables get NO base privileges for anon/authenticated until granted
-- explicitly (see 20260809000004_rls.sql). service_role has BYPASSRLS but that's orthogonal
-- to the GRANT system too (see 20260809000006_service_role_grants.sql), so mirror both.
grant select, insert, update, delete on exercises, exercise_attempts to authenticated;
grant select, insert, update, delete on exercises, exercise_attempts to service_role;

grant usage, select on sequence exercise_attempts_id_seq to authenticated, service_role;
