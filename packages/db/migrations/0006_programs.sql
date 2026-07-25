-- 0006_programs.sql
-- Reproducible multi-week programs and explicit break-week assignments.

CREATE TABLE programs (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  start_week date NOT NULL,
  week_count integer NOT NULL CHECK (week_count BETWEEN 1 AND 16),
  input jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (extract(isodow FROM start_week) = 1)
);

CREATE INDEX programs_user_id_idx ON programs(user_id);

ALTER TABLE plans ADD COLUMN program_id text REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE plans ADD COLUMN program_week_index integer;
ALTER TABLE plans ADD COLUMN program_kind text;
ALTER TABLE plans ADD COLUMN program_load_index double precision;
CREATE INDEX plans_program_id_idx ON plans(program_id);

ALTER TABLE week_assignments ADD COLUMN program_id text REFERENCES programs(id) ON DELETE CASCADE;
ALTER TABLE week_assignments ADD COLUMN kind text NOT NULL DEFAULT 'train';
ALTER TABLE week_assignments ALTER COLUMN plan_id DROP NOT NULL;
CREATE INDEX week_assignments_program_id_idx ON week_assignments(program_id);
