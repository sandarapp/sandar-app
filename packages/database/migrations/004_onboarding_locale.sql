-- Keep historical Indonesian acceptance intact; new profiles default to English.
ALTER TABLE member_profiles ALTER COLUMN language SET DEFAULT 'en';
ALTER TABLE member_profiles ADD COLUMN boundaries_locale varchar(12);
UPDATE member_profiles SET boundaries_locale='id-ID' WHERE boundaries_version IS NOT NULL;
