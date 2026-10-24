CREATE TABLE support_spaces (
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('OFFICIAL_SANDAR','PARTNER_COMMUNITY')),
 name varchar(100) NOT NULL, purpose text NOT NULL, audience text NOT NULL, topic varchar(80) NOT NULL,
 operator_name varchar(100) NOT NULL, status text NOT NULL CHECK(status IN ('ACTIVE','RESTRICTED')),
 guidelines_version varchar(80) NOT NULL, posting_enabled boolean NOT NULL DEFAULT true,
 commenting_enabled boolean NOT NULL DEFAULT true, anonymous_allowed boolean NOT NULL DEFAULT true,
 development_sample boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE space_memberships (
 space_id uuid NOT NULL REFERENCES support_spaces(id), user_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL CHECK(status IN ('JOINED','LEFT','RESTRICTED','BANNED')),
 guidelines_version varchar(80) NOT NULL, joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(space_id,user_id)
);
CREATE TABLE space_posts (
 id uuid PRIMARY KEY, space_id uuid NOT NULL REFERENCES support_spaces(id), author_user_id uuid REFERENCES users(id),
 identity_mode text NOT NULL CHECK(identity_mode IN ('PROFILE','ANONYMOUS','ANNOUNCEMENT')),
 body varchar(1000) NOT NULL CHECK(length(trim(body))>0), status text NOT NULL DEFAULT 'VISIBLE' CHECK(status IN ('VISIBLE','REMOVED','PENDING_REVIEW')),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((identity_mode='ANNOUNCEMENT')=(author_user_id IS NULL)), UNIQUE(author_user_id,request_id)
);
CREATE INDEX space_posts_feed ON space_posts(space_id,created_at DESC);
CREATE TABLE space_comments (
 id uuid PRIMARY KEY, post_id uuid NOT NULL REFERENCES space_posts(id), author_user_id uuid NOT NULL REFERENCES users(id),
 body varchar(1000) NOT NULL CHECK(length(trim(body))>0), status text NOT NULL DEFAULT 'VISIBLE' CHECK(status IN ('VISIBLE','REMOVED','PENDING_REVIEW')),
 request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(author_user_id,request_id)
);
CREATE INDEX space_comments_post ON space_comments(post_id,created_at);
CREATE TABLE space_reactions (
 post_id uuid NOT NULL REFERENCES space_posts(id), user_id uuid NOT NULL REFERENCES users(id),
 type text NOT NULL CHECK(type IN ('SUPPORT','RELATE','ENCOURAGEMENT')), created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(post_id,user_id,type)
);
CREATE TABLE member_blocks (
 blocker_user_id uuid NOT NULL REFERENCES users(id), blocked_user_id uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), CHECK(blocker_user_id<>blocked_user_id), PRIMARY KEY(blocker_user_id,blocked_user_id)
);
CREATE TABLE content_reports (
 id uuid PRIMARY KEY, reporter_user_id uuid NOT NULL REFERENCES users(id),
 post_id uuid REFERENCES space_posts(id), comment_id uuid REFERENCES space_comments(id),
 reason text NOT NULL CHECK(reason IN ('HARMFUL_CONTENT','HARASSMENT','PRIVACY','MISINFORMATION','OTHER')),
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(num_nonnulls(post_id,comment_id)=1)
);
CREATE UNIQUE INDEX report_post_once ON content_reports(reporter_user_id,post_id) WHERE post_id IS NOT NULL;
CREATE UNIQUE INDEX report_comment_once ON content_reports(reporter_user_id,comment_id) WHERE comment_id IS NOT NULL;
CREATE TABLE space_safety_cases (
 id uuid PRIMARY KEY, space_id uuid NOT NULL REFERENCES support_spaces(id), post_id uuid REFERENCES space_posts(id), comment_id uuid REFERENCES space_comments(id),
 report_id uuid UNIQUE REFERENCES content_reports(id), classification text NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','CLOSED')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE space_analytics (
 id uuid PRIMARY KEY, event text NOT NULL, space_id uuid REFERENCES support_spaces(id), created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(event IN ('official_spaces_viewed','official_space_card_viewed','official_space_profile_viewed','official_space_guidelines_viewed','official_space_join_started','official_space_join_completed','official_space_join_failed','official_space_left','space_feed_viewed','support_reaction_added','comment_created','post_create_started','post_created_named','post_created_anonymous','content_report_started','content_report_submitted','member_blocked'))
);
