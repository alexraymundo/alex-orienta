PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS school_enrollments (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  institution_name TEXT NOT NULL DEFAULT 'CIDEB',
  student_number TEXT,
  grade_level TEXT,
  group_name TEXT,
  school_year TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  is_current INTEGER NOT NULL DEFAULT 1,
  needs_review INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_school_enrollments_person
ON school_enrollments(person_id, is_current);

CREATE INDEX IF NOT EXISTS idx_school_enrollments_directory
ON school_enrollments(institution_name, school_year, grade_level, group_name, status);

CREATE INDEX IF NOT EXISTS idx_school_enrollments_student_number
ON school_enrollments(institution_name, student_number);

CREATE TABLE IF NOT EXISTS school_continuity_versions (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  general_description TEXT,
  strengths TEXT,
  support_needs TEXT,
  strategies TEXT,
  watch_items TEXT,
  published_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_continuity_versions_unique
ON school_continuity_versions(person_id, version_number);
