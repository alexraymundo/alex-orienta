PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS person_programs (
  person_id TEXT PRIMARY KEY,
  therapy_with_alex INTEGER NOT NULL DEFAULT 0,
  school_followup INTEGER NOT NULL DEFAULT 0,
  school_name TEXT,
  grade_level TEXT,
  school_year TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  school_name TEXT,
  access_hash TEXT NOT NULL,
  access_hint TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  agreement_version TEXT NOT NULL DEFAULT '1.0',
  agreement_accepted_at TEXT,
  agreement_signed_name TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  teacher_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  school_year TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY(teacher_id, person_id, school_year),
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_teacher_assignments_person
ON teacher_assignments(person_id, active);

CREATE TABLE IF NOT EXISTS teacher_observations (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  observation_date TEXT NOT NULL,
  subject TEXT,
  context TEXT,
  attention_support INTEGER,
  instructions_support INTEGER,
  organization_support INTEGER,
  peer_support INTEGER,
  frustration_support INTEGER,
  transitions_support INTEGER,
  autonomy_support INTEGER,
  help_seeking_support INTEGER,
  description TEXT NOT NULL,
  antecedent TEXT,
  strategy_used TEXT,
  result_text TEXT,
  additional_comments TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  professional_comment TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_teacher_observations_person
ON teacher_observations(person_id, observation_date);

CREATE INDEX IF NOT EXISTS idx_teacher_observations_status
ON teacher_observations(status, created_at);

CREATE TABLE IF NOT EXISTS school_continuity (
  person_id TEXT PRIMARY KEY,
  general_description TEXT,
  strengths TEXT,
  support_needs TEXT,
  strategies TEXT,
  watch_items TEXT,
  approved_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  relationship TEXT,
  email TEXT,
  access_hash TEXT NOT NULL,
  access_hint TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  agreement_version TEXT NOT NULL DEFAULT '1.0',
  agreement_accepted_at TEXT,
  agreement_signed_name TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guardians_person
ON guardians(person_id, active);

CREATE TABLE IF NOT EXISTS family_profiles (
  person_id TEXT PRIMARY KEY,
  summary TEXT,
  strengths TEXT,
  current_goals TEXT,
  recommendations_home TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_observations (
  id TEXT PRIMARY KEY,
  guardian_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  observation_date TEXT NOT NULL,
  context TEXT,
  observation_text TEXT NOT NULL,
  what_helped TEXT,
  questions TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  professional_comment TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(guardian_id) REFERENCES guardians(id) ON DELETE CASCADE,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_family_observations_person
ON family_observations(person_id, observation_date);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_role TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  person_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_person
ON audit_log(person_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_actor
ON audit_log(actor_role, actor_id, created_at);
