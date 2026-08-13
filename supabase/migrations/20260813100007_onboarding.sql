-- Onboarding wizard: profiles.onboarded_at tracks whether the setup wizard has been completed
-- (or explicitly skipped) for a user. null = show the setup wizard; set (to now()) on finish OR
-- skip. Additive-only migration — no existing data touched.
alter table profiles add column onboarded_at timestamptz;
comment on column profiles.onboarded_at is
  'null = show setup wizard; timestamp set when the user finishes or skips onboarding';
