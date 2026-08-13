-- ============ languages (config facts; behavior lives in the TS registry) ============
create table languages (
  code text primary key,
  name text not null,
  native_name text not null,
  rtl boolean not null default false,
  has_diacritics boolean not null default false,
  script_font text
);
insert into languages (code, name, native_name, rtl, has_diacritics, script_font)
values ('fa', 'Persian', 'فارسی', true, true, 'estedad');

create or replace function normalize_term(p_lang text, p_text text)
returns text language sql immutable as $$
  select case p_lang
    when 'fa' then fa_normalize(p_text)
    else lower(btrim(regexp_replace(p_text, '\s+', ' ', 'g')))
  end;
$$;

-- ============ profiles ============
-- id's FK to auth.users is added below via a guarded ALTER TABLE so this file
-- also applies cleanly to a bare scratch database (no auth schema present).
create table profiles (
  id uuid primary key,
  email text not null,
  display_name text,
  timezone text not null default 'America/New_York',
  daily_email_enabled boolean not null default true,
  daily_email_hour smallint not null default 7,   -- local hour, 0–23
  target_lessons_per_week smallint not null default 5,
  daily_new_limit smallint not null default 20,
  daily_review_limit smallint not null default 120,
  show_diacritics boolean not null default true,
  script_scale smallint not null default 125
    constraint profiles_script_scale_range check (script_scale between 100 and 200),
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    alter table profiles
      add constraint profiles_id_fkey foreign key (id) references auth.users (id) on delete cascade;
  end if;
end $$;

-- ============ curriculum (user-owned via curriculums) ============
create table curriculums (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  language_code text not null references languages(code),
  visibility text not null default 'private' check (visibility in ('private','public')),
  cloned_from uuid references curriculums(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- set after the first curriculum exists for a user; all curriculum screens read this
alter table profiles add column active_curriculum_id uuid references curriculums(id) on delete set null;

create table units (
  id serial primary key,
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  number smallint not null,
  title text not null,
  description text,
  unique (curriculum_id, number)
);

create table lessons (
  id serial primary key,
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  number smallint not null,                 -- 1..N within the curriculum, matches L01 etc.
  unit_id int references units(id),
  title text not null,
  slug text not null,                       -- 'ezafe-the-persian-glue'; unique per curriculum
  filename text,                            -- 'L03-ezafe-the-persian-glue.md'
  grammar_points text[] not null default '{}',
  new_vocab_count smallint,
  estimated_minutes smallint not null default 60,
  is_review boolean not null default false,
  is_assessment boolean not null default false,
  body_md text,                             -- full markdown; always populated by importer
  unique (curriculum_id, number),
  unique (curriculum_id, slug)
);

-- ============ progress ============
create table lesson_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_id int not null references lessons(id),
  completed_at timestamptz not null default now(),
  minutes_spent smallint,
  homework_done boolean not null default false,
  negar_drill_done boolean not null default false,
  confidence smallint check (confidence between 1 and 5),
  notes text,
  unique (user_id, lesson_id)
);

-- free-form log the AI tutor writes at the end of a session
create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_id int references lessons(id),
  occurred_at timestamptz not null default now(),
  duration_minutes smallint,
  mode text not null default 'lesson',   -- lesson | quiz | conversation | negar
  errors text[],                          -- ['dropped را', 'verb not final']
  strengths text[],
  raw_log text
);

-- self-ratings from assessment lessons; one row per skill per assessment
create table skill_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_id int references lessons(id),
  skill text not null,                    -- 'ezafe', 'ra', 'present_stems', ...
  rating smallint not null check (rating between 1 and 5),
  rated_at timestamptz not null default now()
);

-- ============ vocabulary + SRS ============
create table vocab_items (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  term text not null,
  term_vocalized text,                    -- optional fully-vocalized (diacritics) display form
  term_normalized text,                   -- kept fresh by the vocab_items_normalize trigger below
  transliteration text not null,
  translation text not null,
  morphology jsonb,                       -- e.g. {"present_stem":"رو","past_stem":"رفت"}; language-defined shape
  part_of_speech text,                    -- noun | verb | adj | adv | prep | phrase | number
  colloquial text,                        -- spoken form if it differs
  lesson_id int references lessons(id),
  tags text[] not null default '{}',
  notes text,
  unique (curriculum_id, lesson_id, term)
);

create index on vocab_items using gin (term_normalized gin_trgm_ops);
create index on vocab_items (curriculum_id);

-- SM-2 state, one row per user per item
create table vocab_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  vocab_id uuid not null references vocab_items(id) on delete cascade,
  ease numeric(4,2) not null default 2.5,
  interval_days int not null default 0,
  repetitions int not null default 0,
  due_on date not null default current_date,
  last_reviewed_at timestamptz,
  lapses int not null default 0,
  suspended boolean not null default false,
  unique (user_id, vocab_id)
);

create index on vocab_reviews (user_id, due_on) where not suspended;

create table review_log (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  vocab_id uuid not null references vocab_items(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  grade smallint not null check (grade between 0 and 5),
  direction text not null,                -- 'fa_to_en' | 'en_to_fa' | 'stem' | 'audio'
  ms_taken int
);

-- ============ streaks ============
create table study_days (
  user_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  lessons_completed smallint not null default 0,
  cards_reviewed smallint not null default 0,
  primary key (user_id, day)
);

-- ============ email dedup ============
create table email_log (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null,                     -- 'daily_reminder' | 'weekly_digest'
  sent_on date not null,                  -- user-local date
  sent_at timestamptz not null default now(),
  unique (user_id, kind, sent_on)
);

-- ============ exercises ============
-- Authored per lesson by the lesson generator (fenced ```exercises yaml block in the
-- lesson markdown); imported by the seed script. Conjugation drills are NOT stored —
-- the app auto-generates them from that lesson's verb stems.
create table exercises (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references curriculums(id) on delete cascade,
  lesson_id int not null references lessons(id) on delete cascade,
  position smallint not null,
  type text not null check (type in ('to_target','from_target','cloze','scramble')),
  prompt text not null,     -- to_target: source in the base language · from_target: source in the target language ·
                            -- cloze: target-language sentence containing ___ · scramble: base-language gloss
  answer text not null,     -- expected answer (target language except from_target; scramble: full target-language sentence)
  accept text[] not null default '{}',  -- alternative accepted answers
  hint text,
  unique (lesson_id, position)
);

-- ============ term normalization trigger ============
create or replace function vocab_items_normalize() returns trigger
language plpgsql as $$
begin
  new.term_normalized := normalize_term(
    (select language_code from curriculums where id = new.curriculum_id), new.term);
  return new;
end; $$;
create trigger vocab_items_normalize before insert or update of term, curriculum_id
  on vocab_items for each row execute function vocab_items_normalize();

-- auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, coalesce(new.email, ''));
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end $$;
