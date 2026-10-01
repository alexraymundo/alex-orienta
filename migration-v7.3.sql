PRAGMA foreign_keys = ON;
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
