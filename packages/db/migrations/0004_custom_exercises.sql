-- 0003_custom_exercises.sql
-- User-authored custom exercises. Per-account (cascade-deleted with the
-- owner), tracked individually, and deliberately kept out of the global
-- code-defined catalog the generator draws from.

CREATE TABLE custom_exercises (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  primary_muscles jsonb NOT NULL,
  secondary_muscles jsonb NOT NULL,
  equipment jsonb NOT NULL,
  role text NOT NULL,
  unilateral boolean NOT NULL,
  cue text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX custom_exercises_user_id_idx ON custom_exercises(user_id);
