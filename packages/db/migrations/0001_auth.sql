-- 0001_auth.sql
-- Accounts, sessions, and the audit trail. Turns the single-user MVP
-- into a multi-user app: every plan/setting is already keyed by user_id,
-- so this migration only adds the identity tables alongside them.

CREATE TABLE users (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);

CREATE TABLE audit_log (
  id text PRIMARY KEY,
  action text NOT NULL,
  actor_user_id text,
  target_user_id text,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_target_user_id_idx ON audit_log(target_user_id);
CREATE INDEX audit_log_created_at_idx ON audit_log(created_at);
