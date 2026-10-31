-- When a member last opened a joined space, so My spaces can say what's new.
ALTER TABLE space_memberships ADD COLUMN last_read_at timestamptz;
