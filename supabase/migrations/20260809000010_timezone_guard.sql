-- ============ final review: timezone hardening + user-local SRS day boundary ============

-- local_today previously did `now() at time zone coalesce(timezone, 'UTC')`, which
-- throws for any profiles.timezone value Postgres doesn't recognize as a zone name.
-- App-level validation (src/app/settings/actions.ts) now rejects unknown zones before
-- they're ever stored, but this is defense-in-depth: local_today is used by grade_card,
-- get_review_queue and current_streak for every user, so one bad row must not be able to
-- break those functions for everyone. Fall back to UTC if the stored zone can't be applied.
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

-- grade_card / get_review_queue: use the user's local calendar day instead of the
-- server's `current_date` for SRS due-date math, so a card due "today" lines up with
-- the user's own day boundary rather than UTC (or wherever the DB host happens to be).
-- Bodies copied verbatim from 20260809000005_functions.sql with only the current_date
-- lines changed.
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

create or replace function get_review_queue()
returns table (
  vocab_id uuid, farsi text, transliteration text, english text,
  part_of_speech text, present_stem text, past_stem text, colloquial text,
  repetitions int, is_new boolean
) language sql stable as $$
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
    select v.id, v.farsi, v.transliteration, v.english, v.part_of_speech,
           v.present_stem, v.past_stem, v.colloquial, vr.repetitions, false as is_new
    from vocab_reviews vr
    join vocab_items v on v.id = vr.vocab_id
    where vr.user_id = auth.uid() and not vr.suspended
      and vr.due_on <= local_today(auth.uid())
    order by vr.due_on
    limit greatest(0, (select daily_review_limit from prof) - (select c from reviews_today))
  ),
  new_cards as (
    select v.id, v.farsi, v.transliteration, v.english, v.part_of_speech,
           v.present_stem, v.past_stem, v.colloquial, 0 as repetitions, true as is_new
    from vocab_items v
    left join lessons l on l.id = v.lesson_id
    where not exists (
      select 1 from vocab_reviews vr
      where vr.vocab_id = v.id and vr.user_id = auth.uid())
    order by l.number nulls last, v.farsi
    limit greatest(0, (select daily_new_limit from prof) - (select c from new_today))
  )
  select * from due union all select * from new_cards;
$$;
