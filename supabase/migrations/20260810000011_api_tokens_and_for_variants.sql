-- ============ api_tokens ============
create table api_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table api_tokens enable row level security;
create policy "own rows" on api_tokens for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on api_tokens to authenticated, service_role;

-- ============ definer variants for token-authenticated (MCP) calls ============
-- Bodies: copied from 20260809000010_timezone_guard.sql (grade_card, get_review_queue)
-- and 20260809000007_bump_study_day.sql (bump_study_day), substituting auth.uid() with
-- p_user throughout. Everything else is byte-identical.
create or replace function grade_card_for(
  p_user uuid,
  p_vocab_id uuid,
  p_grade smallint,
  p_direction text default 'fa_to_en',
  p_ms_taken int default null
) returns vocab_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v vocab_reviews;
  v_uid uuid := p_user;
  v_day date;
begin
  if p_user is null then raise exception 'p_user required'; end if;
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

create or replace function get_review_queue_for(p_user uuid)
returns table (
  vocab_id uuid, farsi text, transliteration text, english text,
  part_of_speech text, present_stem text, past_stem text, colloquial text,
  repetitions int, is_new boolean
) language sql stable
security definer
set search_path = public
as $$
  with prof as (select * from profiles where id = p_user),
  reviews_today as (
    select count(*)::int c from review_log r
    where r.user_id = p_user
      and (r.reviewed_at at time zone (select timezone from prof))::date
          = local_today(p_user)
  ),
  new_today as (
    select count(*)::int c from (
      select vocab_id, min(reviewed_at) fs from review_log
      where user_id = p_user group by vocab_id
    ) t
    where (fs at time zone (select timezone from prof))::date = local_today(p_user)
  ),
  due as (
    select v.id, v.farsi, v.transliteration, v.english, v.part_of_speech,
           v.present_stem, v.past_stem, v.colloquial, vr.repetitions, false as is_new
    from vocab_reviews vr
    join vocab_items v on v.id = vr.vocab_id
    where vr.user_id = p_user and not vr.suspended
      and vr.due_on <= local_today(p_user)
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
      where vr.vocab_id = v.id and vr.user_id = p_user)
    order by l.number nulls last, v.farsi
    limit greatest(0, (select daily_new_limit from prof) - (select c from new_today))
  )
  select * from due union all select * from new_cards;
$$;

-- bumps today's lesson-completion count for the given user, one row per local day
create or replace function bump_study_day_for(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into study_days (user_id, day, lessons_completed)
  values (p_user, local_today(p_user), 1)
  on conflict (user_id, day) do update
    set lessons_completed = study_days.lessons_completed + 1;
$$;

revoke execute on function grade_card_for(uuid, uuid, smallint, text, int) from public, anon, authenticated;
revoke execute on function get_review_queue_for(uuid) from public, anon, authenticated;
revoke execute on function bump_study_day_for(uuid) from public, anon, authenticated;
grant execute on function grade_card_for(uuid, uuid, smallint, text, int) to service_role;
grant execute on function get_review_queue_for(uuid) to service_role;
grant execute on function bump_study_day_for(uuid) to service_role;
