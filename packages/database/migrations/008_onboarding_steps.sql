-- Additive F03 progress and canonical taxonomy; legacy API values remain valid.
ALTER TABLE member_profiles ADD COLUMN country_name text;
ALTER TABLE member_profiles ADD COLUMN progress_step integer NOT NULL DEFAULT 0 CHECK(progress_step BETWEEN 0 AND 9);
ALTER TABLE member_profiles ADD COLUMN interests_saved_at timestamptz;
ALTER TABLE member_profiles ADD COLUMN participation_saved_at timestamptz;
ALTER TABLE member_profiles ADD COLUMN format_saved_at timestamptz;
UPDATE member_profiles SET interests_saved_at=preferences_saved_at,participation_saved_at=preferences_saved_at,format_saved_at=preferences_saved_at;
-- Find constraint names by their definitions because the original migration used anonymous checks.
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='member_profiles'::regclass AND contype='c' AND (pg_get_constraintdef(oid) LIKE '%needs <@%' OR pg_get_constraintdef(oid) LIKE '%goals <@%' OR pg_get_constraintdef(oid) LIKE '%location_source%') LOOP
  EXECUTE format('ALTER TABLE member_profiles DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE member_profiles ADD CHECK(location_source IN ('SKIPPED','MANUAL','DEVICE','DIRECTORY'));
ALTER TABLE member_profiles ADD CHECK(location_source IS DISTINCT FROM 'SKIPPED' OR (country IS NULL AND city IS NULL AND country_name IS NULL));
ALTER TABLE member_profiles ADD CHECK(location_source NOT IN ('MANUAL','DEVICE','DIRECTORY') OR (country IS NOT NULL AND city IS NOT NULL));
ALTER TABLE member_profiles ADD CHECK(needs <@ ARRAY['ANXIETY_STRESS','BURNOUT','OVERWHELMED','LONELINESS','GRIEF_LOSS','RELATIONSHIPS','PARENTING','LIFE_CHANGES','RECOVERY','WORK_PRESSURE','GENERAL_SUPPORT','OTHER','PREFER_NOT_TO_SAY','CONNECTION','BE_HEARD','EVERYDAY_STRESS','LIFE_TRANSITIONS']::text[]);
ALTER TABLE member_profiles ADD CHECK(goals <@ ARRAY['FIND_COMMUNITIES','READ_QUIETLY','SHARE_EXPERIENCES','ATTEND_EVENTS','JOIN_PROGRAMS','LEARN_PEER_SUPPORT','STILL_FIGURING_OUT','LISTEN','SHARE','LEARN','PARTICIPATE']::text[]);
ALTER TABLE member_profiles ADD CHECK(NOT ('PREFER_NOT_TO_SAY'=ANY(needs)) OR cardinality(needs)=1);
CREATE TABLE onboarding_analytics(id uuid PRIMARY KEY,event text NOT NULL,step smallint CHECK(step BETWEEN 0 AND 10),created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX onboarding_analytics_created_idx ON onboarding_analytics(created_at);
