CREATE TABLE email_outbox (
  id uuid PRIMARY KEY,
  payload_encrypted text,
  token_hash char(64) REFERENCES action_tokens(token_hash),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED','CANCELLED')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);
CREATE INDEX email_outbox_pending ON email_outbox(next_attempt_at) WHERE status='PENDING';
CREATE TABLE web_sessions (
  cookie_hash char(64) PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id),
  credentials_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX web_sessions_expiry ON web_sessions(expires_at);
