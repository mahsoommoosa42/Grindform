-- 0000_initial.sql
-- Initial Grindform schema: plans, their days, logged sets, and settings.

CREATE TABLE plans (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  goal text NOT NULL,
  experience text NOT NULL,
  variation text NOT NULL,
  time_budget jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_days (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  position integer NOT NULL,
  weekday text NOT NULL,
  activity text,
  label text,
  focus jsonb NOT NULL,
  blocks jsonb NOT NULL,
  est_minutes integer NOT NULL
);

CREATE INDEX plan_days_plan_id_idx ON plan_days(plan_id);

CREATE TABLE set_logs (
  id text PRIMARY KEY,
  day_id text NOT NULL,
  slot_id text NOT NULL,
  exercise_slug text NOT NULL,
  set_number integer NOT NULL,
  reps integer NOT NULL,
  load_kg double precision NOT NULL,
  rpe double precision,
  completed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX set_logs_day_id_idx ON set_logs(day_id);
CREATE INDEX set_logs_exercise_slug_idx ON set_logs(exercise_slug);

CREATE TABLE settings (
  user_id text PRIMARY KEY,
  theme text NOT NULL,
  preferences jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
