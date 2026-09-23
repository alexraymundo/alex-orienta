PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY, client_name TEXT NOT NULL, age INTEGER, client_email TEXT, client_phone TEXT,
  is_minor INTEGER NOT NULL DEFAULT 0, guardian_name TEXT, guardian_email TEXT, guardian_phone TEXT,
  service_type TEXT NOT NULL DEFAULT 'orientacion_vocacional', reason_summary TEXT,
  preferred_date TEXT NOT NULL, preferred_time TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'requested',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY, full_name TEXT NOT NULL, age INTEGER, email TEXT, phone TEXT,
  is_minor INTEGER NOT NULL DEFAULT 0, guardian_name TEXT, guardian_email TEXT, guardian_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS private_notes (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, note_text TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vocational_profiles (
  person_id TEXT PRIMARY KEY, interests TEXT, strengths TEXT, values_text TEXT, favorite_subjects TEXT,
  work_style TEXT, careers_considered TEXT, open_questions TEXT, guidance_plan TEXT, ai_context TEXT, updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY, person_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
  risk_flag INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);
