-- ============ profiles ============
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text,
  timezone text not null default 'America/New_York',
  daily_email_enabled boolean not null default true,
  daily_email_hour smallint not null default 7,   -- local hour, 0–23
  target_lessons_per_week smallint not null default 5,
  daily_new_limit smallint not null default 20,
  daily_review_limit smallint not null default 120,
  created_at timestamptz not null default now()
);

-- ============ curriculum (user-owned via courses) ============
create table courses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- set after the first course exists for a user; all curriculum screens read this
alter table profiles add column active_course_id uuid references courses(id) on delete set null;

create table units (
  id serial primary key,
  course_id uuid not null references courses(id) on delete cascade,
  number smallint not null,
  title text not null,
  description text,
  unique (course_id, number)
);

create table lessons (
  id serial primary key,
  course_id uuid not null references courses(id) on delete cascade,
  number smallint not null,                 -- 1..N within the course, matches L01 etc.
  unit_id int references units(id),
  title text not null,
  slug text not null,                       -- 'ezafe-the-persian-glue'; unique per course
  filename text,                            -- 'L03-ezafe-the-persian-glue.md'
  grammar_points text[] not null default '{}',
  new_vocab_count smallint,
  estimated_minutes smallint not null default 60,
  is_review boolean not null default false,
  is_assessment boolean not null default false,
  body_md text,                             -- full markdown; always populated by importer
  unique (course_id, number),
  unique (course_id, slug)
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
  course_id uuid not null references courses(id) on delete cascade,
  farsi text not null,
  farsi_normalized text generated always as (fa_normalize(farsi)) stored,
  transliteration text not null,
  english text not null,
  part_of_speech text,                    -- noun | verb | adj | adv | prep | phrase | number
  present_stem text,                      -- verbs only
  past_stem text,                         -- verbs only
  colloquial text,                        -- spoken form if it differs
  lesson_id int references lessons(id),
  tags text[] not null default '{}',
  notes text,
  unique (course_id, lesson_id, farsi)
);

create index on vocab_items using gin (farsi_normalized gin_trgm_ops);
create index on vocab_items (course_id);

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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
