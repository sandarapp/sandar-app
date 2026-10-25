-- English text for official spaces and their Sandar announcements. The rows in
-- support_spaces and space_posts stay the Indonesian original; a request in
-- English reads these and falls back to the original when one is missing.
-- Member posts are never translated.
CREATE TABLE support_space_translations (
 space_id uuid NOT NULL REFERENCES support_spaces(id), locale text NOT NULL CHECK(locale IN ('en')),
 name varchar(100) NOT NULL, purpose text NOT NULL, audience text NOT NULL, topic varchar(80) NOT NULL,
 PRIMARY KEY(space_id,locale)
);
CREATE TABLE space_post_translations (
 post_id uuid NOT NULL REFERENCES space_posts(id), locale text NOT NULL CHECK(locale IN ('en')),
 body varchar(1000) NOT NULL CHECK(length(trim(body))>0),
 PRIMARY KEY(post_id,locale)
);
-- Only Sandar announcements carry translations.
CREATE FUNCTION space_post_translations_announcement_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM space_posts WHERE id=NEW.post_id AND identity_mode='ANNOUNCEMENT') THEN
  RAISE EXCEPTION 'only announcements can be translated';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER space_post_translations_check BEFORE INSERT OR UPDATE ON space_post_translations
 FOR EACH ROW EXECUTE FUNCTION space_post_translations_announcement_only();
