-- 0008_personal_records.sql
-- Per-user canonical-lift personal records and their derived 1RMs.

CREATE TABLE personal_records (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lift text NOT NULL,
  weight_kg double precision NOT NULL CHECK (weight_kg > 0),
  reps integer NOT NULL CHECK (reps >= 1),
  one_rep_max_kg double precision NOT NULL CHECK (one_rep_max_kg > 0),
  achieved_on date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lift)
);
