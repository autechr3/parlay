-- Farsi script at prose size is hard for a new reader to decode; per-user scale
-- (percent of surrounding text size) is applied site-wide through the --fa-scale
-- CSS variable on every .font-fa element. 125% default so script is larger out
-- of the box; bounded so a typo can't blow up the layout.
alter table profiles add column fa_scale smallint not null default 125
  constraint profiles_fa_scale_range check (fa_scale between 100 and 200);
