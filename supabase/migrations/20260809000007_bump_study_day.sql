-- bumps today's lesson-completion count for the calling user, one row per local day
create or replace function bump_study_day()
returns void
language sql
security invoker
as $$
  insert into study_days (user_id, day, lessons_completed)
  values (auth.uid(), local_today(auth.uid()), 1)
  on conflict (user_id, day) do update
    set lessons_completed = study_days.lessons_completed + 1;
$$;
