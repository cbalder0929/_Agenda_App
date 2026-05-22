CREATE TABLE IF NOT EXISTS assignments (
  id           TEXT PRIMARY KEY,
  course_id    TEXT NOT NULL,
  course_name  TEXT,
  name         TEXT NOT NULL,
  due_at       TEXT,
  created_at   TEXT,
  points_possible REAL,
  submission_type TEXT,
  grade        TEXT,
  score        REAL,
  is_turned_in INTEGER DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,
  assignment_id TEXT,
  message       TEXT NOT NULL,
  read          INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id)
);
