-- NORTIA v8.6
-- Teacher input becomes supplementary by default.
-- Alex explicitly decides whether a reviewed teacher comment is included in the school record.
ALTER TABLE teacher_observations ADD COLUMN included_in_record INTEGER NOT NULL DEFAULT 0;
