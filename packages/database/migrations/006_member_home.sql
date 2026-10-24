-- Home owns navigation history and metrics only, never memberships/content copies.
CREATE TABLE member_home_visits (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 visit_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,visit_id)
);
CREATE INDEX member_home_visits_user ON member_home_visits(user_id,created_at DESC);
CREATE TABLE member_home_context (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 space_id uuid NOT NULL REFERENCES support_spaces(id) ON DELETE CASCADE,
 post_id uuid REFERENCES space_posts(id) ON DELETE CASCADE,
 visited_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE member_home_analytics (
 id uuid PRIMARY KEY, event text NOT NULL CHECK(event IN (
 'member_home_viewed','member_home_first_view','member_home_return_view',
 'home_read_quietly_clicked','home_share_experience_clicked','home_find_support_clicked','home_upcoming_events_clicked',
 'official_spaces_section_viewed','recommended_communities_section_viewed','my_spaces_section_viewed',
 'upcoming_events_section_viewed','continue_context_viewed','recent_activity_section_viewed',
 'home_space_card_clicked','home_community_card_clicked','home_event_clicked','home_continue_clicked')),
 resource_id uuid REFERENCES support_spaces(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
