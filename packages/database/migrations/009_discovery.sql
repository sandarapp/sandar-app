-- Discovery metadata only. No membership, profile-detail or trust claims.
CREATE TABLE discovery_profiles (
 space_id uuid PRIMARY KEY REFERENCES support_spaces(id) ON DELETE CASCADE,
 owner_user_id uuid REFERENCES users(id),
 published boolean NOT NULL DEFAULT false,
 topics text[] NOT NULL DEFAULT '{}' CHECK(topics <@ ARRAY['ANXIETY_STRESS','BURNOUT','OVERWHELMED','LONELINESS','GRIEF_LOSS','RELATIONSHIPS','PARENTING','LIFE_CHANGES','RECOVERY','WORK_PRESSURE','GENERAL_SUPPORT','OTHER']::text[]),
 participation text[] NOT NULL DEFAULT '{}' CHECK(participation <@ ARRAY['READ_QUIETLY','SHARE_EXPERIENCES','ATTEND_EVENTS','JOIN_PROGRAMS','LEARN_PEER_SUPPORT']::text[]),
 format text CHECK(format IN ('ONLINE','IN_PERSON','HYBRID')),
 country char(2) CHECK(country ~ '^[A-Z]{2}$'), city varchar(100),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(city IS NULL OR country IS NOT NULL)
);
CREATE INDEX discovery_published ON discovery_profiles(space_id) WHERE published;
CREATE TABLE discovery_analytics (
 id uuid PRIMARY KEY,
 event text NOT NULL CHECK(event IN ('community_discovery_opened','community_discovery_search_performed','community_discovery_filter_applied','community_discovery_filter_cleared','community_discovery_no_results','community_discovery_result_selected')),
 result_type text, has_search boolean, has_location_filter boolean, result_count_bucket text,
 topics text[] NOT NULL DEFAULT '{}', participation text[] NOT NULL DEFAULT '{}', format text, entity_type text,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- Metadata for already-existing, explicitly marked Official development samples only.
INSERT INTO discovery_profiles(space_id,published,topics,participation,format)
SELECT id,true,CASE id::text
 WHEN 'f0100000-0000-4000-8000-000000000001' THEN ARRAY['BURNOUT','WORK_PRESSURE']
 WHEN 'f0100000-0000-4000-8000-000000000002' THEN ARRAY['OVERWHELMED']
 WHEN 'f0100000-0000-4000-8000-000000000003' THEN ARRAY['LONELINESS']
 WHEN 'f0100000-0000-4000-8000-000000000004' THEN ARRAY['LIFE_CHANGES']
 ELSE ARRAY['GENERAL_SUPPORT'] END,ARRAY['READ_QUIETLY','SHARE_EXPERIENCES'],'ONLINE'
FROM support_spaces WHERE kind='OFFICIAL_SANDAR' AND development_sample AND id::text IN ('f0100000-0000-4000-8000-000000000001','f0100000-0000-4000-8000-000000000002','f0100000-0000-4000-8000-000000000003','f0100000-0000-4000-8000-000000000004','f0100000-0000-4000-8000-000000000005');
