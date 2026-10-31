-- Sandar Ops: staff roles with an end date, a second factor for every staff
-- member, and an append-only audit log. Mood data has no place here.
ALTER TABLE staff_roles DROP CONSTRAINT staff_roles_pkey;
ALTER TABLE staff_roles ADD PRIMARY KEY(user_id,role);
ALTER TABLE staff_roles DROP CONSTRAINT staff_roles_role_check;
ALTER TABLE staff_roles ADD CONSTRAINT staff_roles_role_check CHECK(role IN ('MODERATOR','ADMIN','SUPER_ADMIN'));
ALTER TABLE staff_roles ADD COLUMN expires_at timestamptz, ADD COLUMN granted_by uuid REFERENCES users(id);
CREATE TABLE staff_2fa (
 user_id uuid PRIMARY KEY REFERENCES users(id), secret_sealed text NOT NULL,
 confirmed_at timestamptz, last_step bigint NOT NULL DEFAULT 0
);
ALTER TABLE sessions ADD COLUMN ops_verified_at timestamptz, ADD COLUMN ops_seen_at timestamptz;
CREATE TABLE ops_audit (
 id uuid PRIMARY KEY, actor_user_id uuid NOT NULL REFERENCES users(id), action text NOT NULL,
 target_type text NOT NULL, target_id text NOT NULL, reason varchar(300), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ops_audit_recent ON ops_audit(created_at DESC);
CREATE FUNCTION ops_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ops_audit is append-only'; END $$;
CREATE TRIGGER ops_audit_no_change BEFORE UPDATE OR DELETE ON ops_audit
 FOR EACH ROW EXECUTE FUNCTION ops_audit_append_only();
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_action_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_check CHECK(action IN ('APPROVE_POST','REMOVE_POST','DISMISS_REPORT','APPROVE_SPACE','REQUEST_SPACE_CHANGES','REJECT_SPACE','REMOVE_COMMENT'));
ALTER TABLE moderation_actions ADD COLUMN comment_id uuid REFERENCES space_comments(id);
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_check CHECK(num_nonnulls(post_id,report_id,space_id,comment_id)>=1);
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_check1;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_check1 CHECK((action IN ('REMOVE_POST','REMOVE_COMMENT'))=(rule IS NOT NULL));
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  ALTER TABLE staff_2fa ENABLE ROW LEVEL SECURITY;
  ALTER TABLE ops_audit ENABLE ROW LEVEL SECURITY;
 END IF;
END $$;
