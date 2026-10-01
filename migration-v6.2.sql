PRAGMA foreign_keys = ON;
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
