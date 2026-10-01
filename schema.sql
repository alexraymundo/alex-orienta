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


CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  person_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal',
  is_read INTEGER NOT NULL DEFAULT 0,
  email_status TEXT NOT NULL DEFAULT 'pending',
  email_error TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_created
ON notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread
ON notifications(is_read, created_at DESC);


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


CREATE TABLE IF NOT EXISTS security_login_attempts (
  attempt_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  fail_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_login_attempts_updated
ON security_login_attempts(updated_at);


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
