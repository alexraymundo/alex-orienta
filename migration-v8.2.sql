PRAGMA foreign_keys = ON;

-- NORTIA v8.2 Audit Fix
-- IMPORTANT: The Worker also performs these additions safely at runtime.
-- If a column already exists, do not re-run that ALTER statement manually.

ALTER TABLE appointments ADD COLUMN person_id TEXT;
ALTER TABLE appointments ADD COLUMN privacy_consent_version TEXT;
ALTER TABLE appointments ADD COLUMN privacy_accepted_at TEXT;
ALTER TABLE client_access ADD COLUMN consent_version TEXT;
ALTER TABLE client_access ADD COLUMN consent_confirmed_at TEXT;
ALTER TABLE client_access ADD COLUMN consent_confirmed_by TEXT;

CREATE TABLE IF NOT EXISTS school_continuity_drafts (
  person_id TEXT PRIMARY KEY,
  general_description TEXT,
  strengths TEXT,
  support_needs TEXT,
  strategies TEXT,
  watch_items TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS security_action_limits (
  action_key TEXT PRIMARY KEY,
  action_scope TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_person_v82
ON appointments(person_id);

CREATE INDEX IF NOT EXISTS idx_continuity_drafts_updated_v82
ON school_continuity_drafts(updated_at);
