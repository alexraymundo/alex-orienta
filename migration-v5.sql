PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS client_access (
  person_id TEXT PRIMARY KEY,
  access_hash TEXT NOT NULL,
  access_hint TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  consent_confirmed INTEGER NOT NULL DEFAULT 0,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS followups (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  followup_date TEXT NOT NULL,
  title TEXT,
  private_notes TEXT,
  shared_summary TEXT,
  agreements TEXT,
  next_steps TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_followups_person
ON followups(person_id, followup_date);

CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  field_value TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_person
ON custom_fields(person_id);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  shared INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_exercises_person
ON exercises(person_id, status);

CREATE TABLE IF NOT EXISTS client_ai_messages (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  risk_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_client_ai_messages_person
ON client_ai_messages(person_id, created_at);
