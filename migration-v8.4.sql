PRAGMA foreign_keys = ON;
-- NORTIA v8.4 · Coordinación CIDEB + transferencia de docente
CREATE TABLE IF NOT EXISTS coordinators (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  school_name TEXT NOT NULL DEFAULT 'CIDEB',
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

CREATE TABLE IF NOT EXISTS teacher_transfers (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  from_teacher_id TEXT,
  to_teacher_id TEXT NOT NULL,
  transfer_date TEXT NOT NULL,
  school_period TEXT,
  general_description TEXT,
  strengths TEXT,
  support_needs TEXT,
  strategies TEXT,
  watch_items TEXT,
  transfer_note TEXT,
  created_by_role TEXT NOT NULL,
  created_by_id TEXT,
  created_at TEXT NOT NULL,
  undone_at TEXT,
  undone_by_role TEXT,
  undone_by_id TEXT,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE,
  FOREIGN KEY(from_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  FOREIGN KEY(to_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_teacher_transfers_person
ON teacher_transfers(person_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_teacher_transfers_to_teacher
ON teacher_transfers(to_teacher_id, person_id, created_at DESC);
