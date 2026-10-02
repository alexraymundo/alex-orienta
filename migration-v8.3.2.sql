PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS professional_school_observations (
  id TEXT PRIMARY KEY,
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
  strategy_used TEXT,
  recommendation_text TEXT,
  visible_to_teachers INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(person_id) REFERENCES people(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_professional_school_observations_person
ON professional_school_observations(person_id, observation_date);

CREATE INDEX IF NOT EXISTS idx_professional_school_observations_visible
ON professional_school_observations(person_id, visible_to_teachers, observation_date);
