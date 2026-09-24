PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  age INTEGER,
  client_email TEXT,
  client_phone TEXT,
  is_minor INTEGER NOT NULL DEFAULT 0,
  guardian_name TEXT,
  guardian_email TEXT,
  guardian_phone TEXT,
  service_type TEXT NOT NULL DEFAULT 'orientacion_vocacional',
  reason_summary TEXT,
  preferred_date TEXT NOT NULL,
  preferred_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_date
ON appointments(preferred_date, preferred_time);

CREATE INDEX IF NOT EXISTS idx_appointments_status
ON appointments(status);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  age INTEGER,
  email TEXT,
  phone TEXT,
  is_minor INTEGER NOT NULL DEFAULT 0,
  guardian_name TEXT,
  guardian_email TEXT,
  guardian_phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS private_notes (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  note_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_private_notes_person
ON private_notes(person_id);

CREATE TABLE IF NOT EXISTS vocational_profiles (
  person_id TEXT PRIMARY KEY,
  interests TEXT,
  strengths TEXT,
  values_text TEXT,
  favorite_subjects TEXT,
  work_style TEXT,
  careers_considered TEXT,
  open_questions TEXT,
  guidance_plan TEXT,
  ai_context TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  risk_flag INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_person
ON ai_messages(person_id, created_at);


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


CREATE TABLE IF NOT EXISTS ai_daily_usage (
  person_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  extra_messages INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(person_id, usage_date),
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_daily_usage_date
ON ai_daily_usage(usage_date);
