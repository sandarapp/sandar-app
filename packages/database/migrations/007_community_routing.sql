-- Owner-scoped routing state only; application editing/review remains a later feature.
CREATE TABLE community_application_states (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SUBMITTED','UNDER_REVIEW','NEEDS_MORE_INFORMATION','APPROVED','REJECTED')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO community_application_states(user_id) SELECT id FROM users WHERE account_type='COMMUNITY' AND deleted_at IS NULL;
