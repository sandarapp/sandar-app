CREATE TYPE account_type AS ENUM ('MEMBER', 'COMMUNITY');
CREATE TYPE user_status AS ENUM ('EMAIL_UNVERIFIED', 'EMAIL_VERIFIED', 'ONBOARDING_INCOMPLETE', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'DELETED');
CREATE TYPE consent_type AS ENUM ('TERMS', 'PRIVACY_NOTICE', 'COMMUNITY_GUIDELINES', 'LOCATION_OPTIONAL', 'MARKETING_OPTIONAL', 'RESEARCH_OPTIONAL');
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  account_type account_type NOT NULL,
  status user_status NOT NULL DEFAULT 'EMAIL_UNVERIFIED',
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE policies (
  id uuid PRIMARY KEY,
  type consent_type NOT NULL,
  version varchar(80) NOT NULL,
  locale varchar(12) NOT NULL,
  effective_at timestamptz NOT NULL,
  content_url text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  UNIQUE (type, version, locale)
);
CREATE UNIQUE INDEX one_active_policy ON policies(type, locale) WHERE active;
CREATE TABLE consent_records (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  consent_type consent_type NOT NULL,
  policy_version varchar(80) NOT NULL,
  locale varchar(12) NOT NULL,
  status text NOT NULL CHECK (status IN ('ACCEPTED', 'WITHDRAWN')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_at timestamptz,
  FOREIGN KEY (consent_type, policy_version, locale) REFERENCES policies(type, version, locale),
  UNIQUE(user_id, consent_type, policy_version, locale)
);
CREATE TABLE action_tokens (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL CHECK (purpose IN ('VERIFY_EMAIL', 'RESET_PASSWORD')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX action_tokens_user ON action_tokens(user_id, purpose);
CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  access_hash char(64) NOT NULL UNIQUE,
  access_expires_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE refresh_tokens (
  token_hash char(64) PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_session ON refresh_tokens(session_id);
CREATE TABLE rate_limits (
  key_hash char(64) PRIMARY KEY,
  attempts integer NOT NULL CHECK(attempts > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
