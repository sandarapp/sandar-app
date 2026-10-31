-- The Ops second factor is now a short-lived code sent to the staff member's email.
-- Only a digest is stored. The unused authenticator keys go with the old table.
DROP TABLE staff_2fa;
CREATE TABLE ops_email_codes (
 user_id uuid PRIMARY KEY REFERENCES users(id), code_hash char(64) NOT NULL, expires_at timestamptz NOT NULL
);
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  ALTER TABLE ops_email_codes ENABLE ROW LEVEL SECURITY;
 END IF;
END $$;
