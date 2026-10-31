-- A display name can change once every 30 days after onboarding.
ALTER TABLE member_profiles ADD COLUMN display_name_changed_at timestamptz;
