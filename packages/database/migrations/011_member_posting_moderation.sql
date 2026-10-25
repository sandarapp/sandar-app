-- Member posting with human review. Every member post waits in a queue until
-- a Sandar moderator approves or removes it; each decision is kept in an
-- append-only log.
CREATE TABLE staff_roles (
 user_id uuid PRIMARY KEY REFERENCES users(id),
 role text NOT NULL CHECK(role IN ('MODERATOR')),
 granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE moderation_actions (
 id uuid PRIMARY KEY, moderator_user_id uuid NOT NULL REFERENCES users(id),
 action text NOT NULL CHECK(action IN ('APPROVE_POST','REMOVE_POST','DISMISS_REPORT')),
 post_id uuid REFERENCES space_posts(id), report_id uuid REFERENCES content_reports(id),
 rule text CHECK(rule IN ('RULE_1','RULE_2','RULE_3','RULE_4','RULE_5','OTHER')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(post_id,report_id)>=1),
 CHECK((action='REMOVE_POST')=(rule IS NOT NULL))
);
CREATE INDEX moderation_actions_post ON moderation_actions(post_id);
CREATE FUNCTION moderation_actions_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'moderation_actions is append-only'; END $$;
CREATE TRIGGER moderation_actions_no_change BEFORE UPDATE OR DELETE ON moderation_actions
 FOR EACH ROW EXECUTE FUNCTION moderation_actions_append_only();
CREATE INDEX space_posts_review ON space_posts(created_at) WHERE status='PENDING_REVIEW';
ALTER TABLE space_analytics DROP CONSTRAINT space_analytics_event_check;
ALTER TABLE space_analytics ADD CONSTRAINT space_analytics_event_check CHECK(event IN ('official_spaces_viewed','official_space_card_viewed','official_space_profile_viewed','official_space_guidelines_viewed','official_space_join_started','official_space_join_completed','official_space_join_failed','official_space_left','space_feed_viewed','support_reaction_added','comment_created','post_create_started','post_created_named','post_created_anonymous','content_report_started','content_report_submitted','member_blocked','post_approved','post_removed'));
