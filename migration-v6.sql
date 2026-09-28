PRAGMA foreign_keys = ON;


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
