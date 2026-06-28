-- 0002_session_idle.sql
-- Add a sliding idle-timeout to sessions. last_used_at is bumped on each
-- authenticated request. A session left unused for longer than the idle
-- window counts as expired even before its absolute 30-day expiry is reached.
-- Existing rows default to now() so the migration itself logs nobody out.

ALTER TABLE sessions ADD COLUMN last_used_at timestamptz NOT NULL DEFAULT now();
