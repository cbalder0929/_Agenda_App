# Agendi

A Canvas LMS assignment tracker for Columbia College Chicago. Pulls your assignments, tracks grades, and sends you alerts when deadlines approach or grades are posted — all running locally with no cloud service required.

Built for `canvas.colum.edu`.

---

## What it does

- Shows all assignments from your active Canvas courses, sorted newest first
- Groups them by status: **Overdue**, **Due this week**, **Upcoming**, **No due date**
- Displays your current letter grade (A/B+/C- etc.) per course using standard plus/minus scale
- Shows grade percentage with color coding (green ≥80%, yellow 60–79%, red <60%) on each assignment card
- Shows submission feedback when your professor leaves a comment
- Filters by course, status tab, or free-text search
- **Notification center** (bell icon) — alerts for new assignments, posted grades, and approaching deadlines
- **Background scheduler** — deadline alerts fire server-side every 15 minutes (24h warning, 3h warning, overdue)
- **Student info header** — shows your name, semester, and unweighted GPA (pulled live from Canvas)
- Persists assignment and notification data in PostgreSQL (Neon)

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- A Canvas API token from your school account
- A PostgreSQL database (free tier on [Neon](https://neon.tech) works)

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Get your Canvas API token

1. Log in to Canvas at [canvas.colum.edu](https://canvas.colum.edu)
2. Go to **Account → Settings → Approved Integrations**
3. Click **+ New Access Token**, give it a name, and copy the token

### 3. Create a `.env` file

Create `.env` in the project root (already gitignored):

```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
CANVAS_TOKEN=your_token_here
```

`DATABASE_URL` is required — the server exits at startup if it's missing. Get a free Postgres database at [neon.tech](https://neon.tech) and paste the connection string.

`CANVAS_TOKEN` can also be set as a shell environment variable instead.

### 4. Open the app

```
http://localhost:3001
```

On first load the app syncs all your Canvas assignments into the local database. The bell icon will show a count of new notifications — hit **Mark all read** to clear the first-run batch.

---

## How it works

```
Browser → POST /api/sync → AssignmentWatcher + GradeWatcher → PostgreSQL
Browser → GET  /proxy/api/v1/... → canvas.colum.edu/api/v1/...
Server  → setInterval (15 min) → scheduler → PostgreSQL notifications
```

- **Proxy** — all Canvas API calls go through the local server to avoid CORS. The server attaches your token before forwarding.
- **Sync** — after every page load the browser POSTs the normalized assignment list to `/api/sync`. The server diffs it against the database and creates notifications for anything new or changed.
- **Watchers** — `AssignmentWatcher` detects new assignments; `GradeWatcher` detects posted or changed grades. They run on every sync.
- **Scheduler** — runs server-side every 15 minutes, checks due dates, fires deadline alerts once per assignment per threshold (deduped).
- **Notification center** — bell icon in the header with live unread count. Click to open the panel; click a notification to mark it read.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | required | PostgreSQL connection string |
| `CANVAS_TOKEN` | fallback in server.js | Your Canvas API token |
| `PORT` | `3001` | Port the server listens on |

All three can be set in `.env` or as shell environment variables. On Render, set them in the service's **Environment** tab.

---

## File structure

```
.
├── server.js                   # HTTP server, proxy, API routes
├── canvas-assignments.html     # App shell
├── script.js                   # All frontend logic
├── styles.css                  # Styles
├── package.json
├── .env                        # Local env vars (gitignored)
├── db/
│   ├── index.js                # pg Pool, init() applies schema idempotently
│   └── schema.sql              # assignments + notifications tables
└── services/
    ├── assignmentWatcher.js    # Detects new assignments, writes to DB
    ├── gradeWatcher.js         # Detects grade changes, writes notifications
    └── scheduler.js            # Background deadline alert engine
```

---

## Notes

- Do not commit credentials. Use `.env` locally; use Render's Environment tab in production. `.env` is gitignored.
- `DOMAIN` is defined in both `server.js` and `script.js` — keep them in sync if changing Canvas instances.
- The app is currently single-user. Sprint 3 adds accounts and per-user Canvas tokens.
