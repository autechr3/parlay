-- Three functions below (current_streak, get_review_queue, bump_study_day) are `language sql`
-- and reference auth.uid() either in a body statement or a parameter default. Unlike plpgsql
-- (which resolves identifiers lazily, at first call), CREATE FUNCTION for `language sql` parses
-- and analyzes the body immediately, and a default-argument expression is always evaluated at
-- creation time regardless of language — confirmed empirically against the baseline_v2 scratch
-- DB, which has no `auth` schema (see 20260813100002_schema.sql's guard for the same root cause).
-- Each is wrapped in the same `pg_namespace` guard Task 1 used, so this file also applies cleanly
-- to a bare scratch database; on the real local/hosted stack the guard's condition is true and
-- behavior is unchanged. local_today and grade_card are plain plpgsql and need no guard — verified
-- they create successfully on the bare scratch DB despite calling/referencing auth.uid().

-- user-local date helper
-- Copied from 20260809000010_timezone_guard.sql (the current authoritative version — falls back
-- to UTC if the stored zone can't be applied). Renamed: none needed (no course/curriculum refs).
create or replace function local_today(p_user uuid)
returns date language plpgsql stable as $$
declare
  tz text;
  d date;
begin
  select timezone into tz from profiles where id = p_user;
  begin
    d := (now() at time zone coalesce(tz, 'UTC'))::date;
  exception when others then
    d := (now() at time zone 'UTC')::date;
  end;
  return d;
end;
$$;

-- SM-2 spaced-repetition grading. Copied from 20260809000010_timezone_guard.sql (uses
-- local_today() for due_on instead of the server's current_date). Renamed: none needed
-- (grade_card has no course/curriculum reference — ownership of vocab_id is implied by the
-- caller's own vocab_reviews row and enforced by RLS on vocab_items via vocab_reviews's FK join
-- elsewhere; this invoker function relies on RLS, same as the original).
create or replace function grade_card(
  p_vocab_id uuid,
  p_grade smallint,
  p_direction text default 'fa_to_en',
  p_ms_taken int default null
) returns vocab_reviews
language plpgsql
security invoker
as $$
declare
  v vocab_reviews;
  v_uid uuid := auth.uid();
  v_day date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_grade < 0 or p_grade > 5 then raise exception 'grade out of range'; end if;

  insert into vocab_reviews (user_id, vocab_id) values (v_uid, p_vocab_id)
    on conflict (user_id, vocab_id) do nothing;
  select * into v from vocab_reviews
    where user_id = v_uid and vocab_id = p_vocab_id for update;

  if p_grade <= 2 then
    v.repetitions   := 0;
    v.interval_days := 1;
    v.lapses        := v.lapses + 1;
    v.ease          := greatest(1.3, v.ease - 0.20);
  else
    v.repetitions   := v.repetitions + 1;
    v.interval_days := case v.repetitions
                         when 1 then 1
                         when 2 then 6
                         else round(v.interval_days * v.ease)::int
                       end;
    v.ease := least(2.8, greatest(1.3,
      v.ease + (0.1 - (5 - p_grade) * (0.08 + (5 - p_grade) * 0.02))));
  end if;

  v.interval_days    := least(v.interval_days, 365);
  v.due_on           := local_today(v_uid) + v.interval_days;
  v.last_reviewed_at := now();

  update vocab_reviews set
    repetitions = v.repetitions, interval_days = v.interval_days,
    lapses = v.lapses, ease = v.ease, due_on = v.due_on,
    last_reviewed_at = v.last_reviewed_at
  where id = v.id;

  insert into review_log (user_id, vocab_id, grade, direction, ms_taken)
  values (v_uid, p_vocab_id, p_grade, p_direction, p_ms_taken);

  v_day := local_today(v_uid);
  insert into study_days (user_id, day, cards_reviewed) values (v_uid, v_day, 1)
  on conflict (user_id, day) do update
    set cards_reviewed = study_days.cards_reviewed + 1;

  return v;
end;
$$;

-- Copied from 20260809000005_functions.sql, unchanged (no course/curriculum reference).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $fn$
      create or replace function current_streak(p_user uuid default auth.uid())
      returns int language sql stable as $body$
        with d as (
          select distinct day from study_days
          where user_id = p_user and (cards_reviewed > 0 or lessons_completed > 0)
        ),
        t as (select day, (row_number() over (order by day desc))::int rn from d),
        anchor as (
          select case
            when exists (select 1 from d where day = local_today(p_user)) then local_today(p_user)
            when exists (select 1 from d where day = local_today(p_user) - 1) then local_today(p_user) - 1
          end as a
        )
        select coalesce((select count(*)::int from t, anchor
                         where a is not null and t.day = a - (t.rn - 1)), 0);
      $body$;
    $fn$;
  else
    raise notice 'skipping current_streak: auth schema not present (bare scratch DB)';
  end if;
end $$;

-- Copied from 20260809000010_timezone_guard.sql (get_review_queue body), with the Rename Map
-- applied to columns/tables (farsi -> term, english -> translation, present_stem/past_stem ->
-- morphology, course_id -> curriculum_id) plus the active-curriculum scoping change: both the
-- `due` and `new_cards` CTEs add `v.curriculum_id = (select active_curriculum_id from prof)` so
-- the queue only ever returns cards from the user's currently-active curriculum, not every
-- curriculum they own. `term_vocalized` is added to the return shape (diacritics live only
-- there per the global constraints); `present_stem`/`past_stem` are dropped in favor of
-- `morphology`.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $fn$
      create or replace function get_review_queue()
      returns table (
        vocab_id uuid, term text, term_vocalized text, transliteration text, translation text,
        part_of_speech text, morphology jsonb, colloquial text,
        repetitions int, is_new boolean
      ) language sql stable as $body$
        with prof as (select * from profiles where id = auth.uid()),
        reviews_today as (
          select count(*)::int c from review_log r
          where r.user_id = auth.uid()
            and (r.reviewed_at at time zone (select timezone from prof))::date
                = local_today(auth.uid())
        ),
        new_today as (
          select count(*)::int c from (
            select vocab_id, min(reviewed_at) fs from review_log
            where user_id = auth.uid() group by vocab_id
          ) t
          where (fs at time zone (select timezone from prof))::date = local_today(auth.uid())
        ),
        due as (
          select v.id, v.term, v.term_vocalized, v.transliteration, v.translation, v.part_of_speech,
                 v.morphology, v.colloquial, vr.repetitions, false as is_new
          from vocab_reviews vr
          join vocab_items v on v.id = vr.vocab_id
          where vr.user_id = auth.uid() and not vr.suspended
            and vr.due_on <= local_today(auth.uid())
            and v.curriculum_id = (select active_curriculum_id from prof)
          order by vr.due_on
          limit greatest(0, (select daily_review_limit from prof) - (select c from reviews_today))
        ),
        new_cards as (
          select v.id, v.term, v.term_vocalized, v.transliteration, v.translation, v.part_of_speech,
                 v.morphology, v.colloquial, 0 as repetitions, true as is_new
          from vocab_items v
          left join lessons l on l.id = v.lesson_id
          where not exists (
            select 1 from vocab_reviews vr
            where vr.vocab_id = v.id and vr.user_id = auth.uid())
            and v.curriculum_id = (select active_curriculum_id from prof)
          order by l.number nulls last, v.term
          limit greatest(0, (select daily_new_limit from prof) - (select c from new_today))
        )
        select * from due union all select * from new_cards;
      $body$;
    $fn$;
  else
    raise notice 'skipping get_review_queue: auth schema not present (bare scratch DB)';
  end if;
end $$;

-- bumps today's lesson-completion count for the calling user, one row per local day
-- Copied from 20260809000007_bump_study_day.sql, unchanged (no course/curriculum reference).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'auth') then
    execute $fn$
      create or replace function bump_study_day()
      returns void
      language sql
      security invoker
      as $body$
        insert into study_days (user_id, day, lessons_completed)
        values (auth.uid(), local_today(auth.uid()), 1)
        on conflict (user_id, day) do update
          set lessons_completed = study_days.lessons_completed + 1;
      $body$;
    $fn$;
  else
    raise notice 'skipping bump_study_day: auth schema not present (bare scratch DB)';
  end if;
end $$;
