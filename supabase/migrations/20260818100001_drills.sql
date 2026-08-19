-- Drills: tutor-authored interactive exercise sets presented as MCP Apps
-- widgets. payload holds the validated Drill JSON (schema owned by the app;
-- the DB stores it opaquely). Attempts reference exercises by their id inside
-- the payload (exercise_id text), NOT the lesson-authoring `exercises` table.

create table drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  curriculum_id uuid references curriculums(id) on delete set null,
  language_code text not null references languages(code),
  title text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index drills_user_created_idx on drills (user_id, created_at desc);

create table drill_attempts (
  id bigserial primary key,
  drill_id uuid not null references drills(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  exercise_id text not null,
  correct boolean not null,
  answer_given text,
  ms_taken int,
  attempted_at timestamptz not null default now()
);
create index drill_attempts_drill_idx on drill_attempts (drill_id, attempted_at);

alter table drills enable row level security;
alter table drill_attempts enable row level security;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $pol$create policy "own drills" on drills for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id)$pol$;
    execute $pol$create policy "own drill attempts" on drill_attempts for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id)$pol$;
  else
    raise notice 'skipping drills policies: auth schema not present (bare scratch DB)';
  end if;
end $$;

grant select, insert, update, delete on drills to authenticated;
grant select, insert, update, delete on drills to service_role;
grant select, insert, update, delete on drill_attempts to authenticated;
grant select, insert, update, delete on drill_attempts to service_role;
grant usage, select on sequence drill_attempts_id_seq to authenticated, service_role;
