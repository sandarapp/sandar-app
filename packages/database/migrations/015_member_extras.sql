-- Profile bio, private mood check-ins, feedback, Events interest, notification marker.
ALTER TABLE member_profiles
 ADD COLUMN bio varchar(160),
 ADD COLUMN mood_check_enabled boolean NOT NULL DEFAULT true,
 ADD COLUMN notifications_seen_at timestamptz;
-- The mood and words are sealed by the app, so staff and database access can't read them.
CREATE TABLE mood_checkins (
 user_id uuid NOT NULL REFERENCES users(id), day date NOT NULL, sealed text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,day)
);
CREATE TABLE member_feedback (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('IDEA','BROKEN','OTHER','HELPFUL','NOT_HELPFUL')),
 page varchar(80), moment varchar(40), body varchar(1000), contact_ok boolean NOT NULL DEFAULT false,
 device text NOT NULL CHECK(device IN ('PHONE','DESKTOP')), status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','READ')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX member_feedback_new ON member_feedback(created_at DESC);
CREATE TABLE event_interest (user_id uuid PRIMARY KEY REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());

-- Hosted Postgres exposes the public schema to these roles through its data API.
-- The app connects as the owner, which row security doesn't limit, so this closes
-- that path for every table, now and in later migrations.
DO $$
DECLARE t record;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.tablename);
  END LOOP;
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon,authenticated;
  REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon,authenticated;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon,authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon,authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon,authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon,authenticated;
 END IF;
END $$;
