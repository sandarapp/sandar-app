-- Spaces started by members. A space stays visible only to its host until a
-- Sandar moderator approves it. Hosts get no extra access to who wrote what.
ALTER TABLE support_spaces DROP CONSTRAINT support_spaces_kind_check;
ALTER TABLE support_spaces ADD CONSTRAINT support_spaces_kind_check CHECK(kind IN ('OFFICIAL_SANDAR','PARTNER_COMMUNITY','MEMBER_SPACE'));
ALTER TABLE support_spaces DROP CONSTRAINT support_spaces_status_check;
ALTER TABLE support_spaces ADD CONSTRAINT support_spaces_status_check CHECK(status IN ('ACTIVE','RESTRICTED','IN_REVIEW','NEEDS_CHANGES','NOT_APPROVED'));
ALTER TABLE support_spaces
 ADD COLUMN host_user_id uuid REFERENCES users(id),
 ADD COLUMN topics text[],
 ADD COLUMN rules text[],
 ADD COLUMN review_note varchar(300),
 ADD COLUMN request_id uuid,
 ADD CONSTRAINT member_space_has_host CHECK((kind='MEMBER_SPACE')=(host_user_id IS NOT NULL));
CREATE UNIQUE INDEX member_space_request ON support_spaces(host_user_id,request_id);
CREATE UNIQUE INDEX member_space_name ON support_spaces(lower(name)) WHERE kind='MEMBER_SPACE' AND status<>'NOT_APPROVED';
CREATE INDEX member_space_review ON support_spaces(created_at) WHERE status='IN_REVIEW';

ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_action_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_action_check CHECK(action IN ('APPROVE_POST','REMOVE_POST','DISMISS_REPORT','APPROVE_SPACE','REQUEST_SPACE_CHANGES','REJECT_SPACE'));
ALTER TABLE moderation_actions ADD COLUMN space_id uuid REFERENCES support_spaces(id);
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_check;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_check CHECK(num_nonnulls(post_id,report_id,space_id)>=1);
