# Agendi — AI Context

## What this is

A Canvas LMS assignment tracker for Columbia College Chicago (`canvas.colum.edu`). Runs as a Node.js HTTP server that proxies Canvas API requests, persists data in PostgreSQL, and serves a vanilla JS frontend. Deploys free on Render + Neon (see `deploy.md`).

Dependencies: `pg` (PostgreSQL client), `dotenv` (loads `.env` at startup). `node-cron` planned but not yet installed — scheduler uses `setInterval`. No frontend framework, no bundler, no TypeScript.

## File map

```
server.js                   HTTP server, Canvas proxy, all API routes
canvas-assignments.html     App shell — minimal HTML, no inline logic
script.js                   All frontend logic
styles.css                  All styles, CSS custom properties in :root
db/
  index.js                  Creates pg Pool, init() runs schema idempotently, exports { pool, query, init }
  schema.sql                assignments + notifications tables
services/
  assignmentWatcher.js      Diffs incoming assignments vs DB, creates new_assignment notifications
  gradeWatcher.js           Diffs incoming grades vs DB, creates grade_posted notifications
  scheduler.js              setInterval (15 min), deadline_soon / deadline_3h / overdue alerts
```

## Architecture

### Request flow

```
Browser fetch(/proxy/api/v1/...) → server.js strips /proxy → HTTPS to canvas.colum.edu → pipe back
Browser POST /api/sync          → await gradeWatcher.check() → await assignmentWatcher.sync() → Postgres
Browser GET  /api/notifications → SELECT notifications ORDER BY created_at DESC
Browser POST /api/notifications/read → UPDATE read=1
Server setInterval              → scheduler.checkDeadlines() → INSERT notifications
```

### Key constants

- `server.js` — `DOMAIN`, `TOKEN` (env var `CANVAS_TOKEN`, fallback hardcoded — do not log), `PORT` (env var `PORT`, default 3001 — Render injects it). `require('dotenv').config()` runs at the top.
- `db/index.js` — `DATABASE_URL` env var is **required** (Postgres connection string); process exits at startup if unset
- `script.js:1` — `DOMAIN` must match server.js
- `script.js:2` — `PROXY_BASE` auto-switches between `localhost:3001` and `window.location.origin`

## Database

PostgreSQL, accessed via `pg`. `db/index.js` exports a connection `pool`, a `query(text, params)` helper, and `init()` which applies `schema.sql` idempotently (`CREATE TABLE IF NOT EXISTS`). `server.js` awaits `db.init()` before `server.listen`. SSL is on for remote hosts, off for `localhost`. **All DB access is async** — watchers and route handlers `await` every query; positional params are `$1, $2, …`.

**assignments** — canonical store for Canvas assignment state. Key fields:
- `id` TEXT PRIMARY KEY — Canvas assignment ID (string)
- `grade`, `score` — current grade state; GradeWatcher diffs against these before AssignmentWatcher overwrites them
- `is_turned_in` INTEGER 0/1
- `first_seen_at` — set on INSERT, never updated — used to detect new assignments
- `updated_at` — updated on every sync

**notifications** — append-only event log.
- `type`: `new_assignment` | `grade_posted` | `deadline_soon` | `deadline_3h` | `overdue`
- `read` INTEGER 0/1, default 0
- Deduped: AssignmentWatcher checks `first_seen_at` existence; GradeWatcher checks grade diff; Scheduler checks `hasNotif` before inserting

## Frontend logic (script.js)

**Header — student info:**
- `.header-left` wraps `.notif-wrapper` (bell) + `.student-info` (semester, name, GPA)
- Semester pulled from `courseList[0]?.term?.name` — courses URL includes `&include[]=term`, fallback "Spring 2026"
- Name fetched from `${BASE}/users/self/profile` (single object, not fetchAll) — `.name` or `.short_name`, escaped with `escHtml()`
- GPA computed via `scoreToGpaPoints()` (standard 4.0 unweighted scale) averaged over courses with a numeric `computed_current_score`; displayed as "GPA 3.xx" or "GPA —"
- Profile fetch is fire-and-forget — failure leaves name blank, does not affect assignment load
- Filter tabs live in `<main>` (below the search bar), not in the header

**Data pipeline:**
1. `load()` — fetches courses (`include[]=total_scores&include[]=term`), then assignments per course in parallel with `include[]=submission&include[]=submission_comments`
2. Each raw Canvas object → `normalizeAssignment()` → clean flat model stored in `allAssignments[]`
3. `render()` reads only normalized fields — no Canvas API shape leaks into the DOM layer
4. After render: `syncWithServer(allAssignments)` POSTs to `/api/sync` (fire-and-forget, non-blocking)

**Normalized assignment model:**
```js
{ id, name, courseId, courseName, dueAt, createdAt, dueStatus, dueFormatted,
  isTurnedIn, grade, score, pointsPossible, percentage, submissionType, feedback, url }
```

**`dueStatus`** values: `overdue` | `soon` (≤7 days) | `upcoming` | `no-date` — computed once in `normalizeAssignment`, never recomputed in `render()`

**Sort:** `createdAt` descending (newest assignments first). Groups maintained: Overdue → Due this week → Upcoming → No due date.

**Grade display:**
- `percentage` = `Math.round(score / pointsPossible * 100)` — green ≥80%, yellow 60–79%, red <60%
- Falls back to raw `grade` string (letter grade) if no numeric score

**Course cards:** `scoreToLetterGrade(score)` — standard A+/A/A-/.../F scale

**GPA helper:** `scoreToGpaPoints(score)` — maps 0-100 percentage to 4.0 scale (93+ → 4.0, 90-92 → 3.7, … below 60 → 0.0)

**Notifications:** `loadNotifications()` on page init + panel open. `TYPE_LABEL` maps type strings to display labels. `relativeTime()` for timestamps.

## Watcher order — critical

In `/api/sync`, `gradeWatcher.check()` runs BEFORE `assignmentWatcher.sync()`. GradeWatcher reads the old grade from DB; AssignmentWatcher overwrites it. Reversing this order would cause GradeWatcher to always see the new grade and never detect changes.

## What to watch out for

- `escHtml()` is used on all Canvas-sourced strings in the DOM — keep it that way
- Directory traversal guard in server.js — do not weaken it
- `DOMAIN` in two files — keep in sync
- The hardcoded token fallback in server.js is a real token — never log or expose it
- DB access is async — never call a query without `await`; `assignmentWatcher.sync()` wraps its work in a `BEGIN`/`COMMIT` transaction on a dedicated client
- No React, no bundler, no TypeScript — keep it vanilla until Sprint 3 explicitly decides otherwise
- Sprint 3 (auth + per-user tokens) is the next major milestone — the current app is single-user with one hardcoded token
