-- ===== base table grants for the service_role =====
-- 20260809000004_rls.sql granted base table privileges to `authenticated` only. `service_role`
-- has BYPASSRLS (it skips row-level security policies), but RLS bypass is orthogonal to Postgres's
-- GRANT system: without an explicit table-level grant, service_role still gets "permission denied"
-- on SELECT/INSERT/UPDATE/DELETE. The seed importer (Task 7) and future service-role tooling need
-- full CRUD here, so mirror the same tables/privileges already granted to `authenticated`.
grant select, insert, update, delete on
  profiles, courses, units, lessons, vocab_items,
  lesson_completions, practice_sessions, skill_ratings,
  vocab_reviews, review_log, study_days, email_log
  to service_role;

grant usage on sequence
  units_id_seq, lessons_id_seq, review_log_id_seq, email_log_id_seq
  to service_role;
