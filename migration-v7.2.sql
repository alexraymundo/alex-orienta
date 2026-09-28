PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS person_data_context (
  person_id TEXT PRIMARY KEY,
  context_type TEXT NOT NULL DEFAULT 'private',
  institution_name TEXT,
  archive_reason TEXT,
  archived_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_person_data_context_type ON person_data_context(context_type, institution_name);
