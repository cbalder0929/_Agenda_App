CREATE TABLE IF NOT EXISTS assignments (
  id              TEXT PRIMARY KEY,
  course_id       TEXT NOT NULL,
  course_name     TEXT,
  name            TEXT NOT NULL,
  due_at          TEXT,
  created_at      TEXT,
  description     TEXT,
  points_possible REAL,
  submission_type TEXT,
  grade           TEXT,
  score           REAL,
  is_turned_in    INTEGER DEFAULT 0,
  first_seen_at   TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE TABLE IF NOT EXISTS notifications (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL,
  assignment_id TEXT REFERENCES assignments(id),
  message       TEXT NOT NULL,
  read          INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS google_tokens (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  access_token  TEXT NOT NULL,
  refresh_token TEXT,
  expiry_date   BIGINT,
  scope         TEXT,
  updated_at    TEXT NOT NULL,
  CONSTRAINT google_tokens_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS google_calendar (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  calendar_id   TEXT NOT NULL,
  CONSTRAINT google_calendar_single_row CHECK (id = 1)
);
