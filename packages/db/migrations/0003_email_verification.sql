-- 0003_email_verification.sql
-- Add email verification support: a boolean flag on users and a table for
-- hashed verification tokens. Existing users default to true (grandfathered).

ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT true;

CREATE TABLE verification_tokens (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
