-- 0005_week_calendar.sql
-- Calendar-week assignments and a per-user default plan.

ALTER TABLE plans ADD COLUMN is_default boolean NOT NULL DEFAULT false;

CREATE TABLE week_assignments (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  plan_id text NOT NULL,
  week_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (extract(isodow FROM week_start) = 1),
  UNIQUE (user_id, week_start)
);

CREATE INDEX week_assignments_user_week_idx ON week_assignments(user_id, week_start);
