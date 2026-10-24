-- Launch scope: members read and react; posting and commenting open per space
-- once moderation is staffed. Closed is the default so a new space never opens
-- posting by accident.
ALTER TABLE support_spaces ALTER COLUMN posting_enabled SET DEFAULT false;
ALTER TABLE support_spaces ALTER COLUMN commenting_enabled SET DEFAULT false;
UPDATE support_spaces SET posting_enabled = false, commenting_enabled = false, updated_at = now();
