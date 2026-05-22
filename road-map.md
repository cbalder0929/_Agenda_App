# Agendi V2 — Integration Roadmap

This roadmap turns the plan in `v2.txt` into an actionable build sequence. Every step is split into:

- **YOU** — things only a human can do: decisions, accounts, credentials, testing, approvals.
- **AI** — things you hand to Claude: writing code, refactoring, creating files, schemas.

Work top to bottom. Do not skip the **Decisions** step — a few of them block later sprints.

---

## Reality check before you start

The current app has a deliberate "**zero npm dependencies, no build step**" design. V2 breaks that. Adding a database, auth, and a scheduler means `npm install` becomes real and `package.json` gains dependencies. That is fine and expected — just know it is a one-way door. Once you commit to it, the "just run `node server.js`" simplicity is gone.

---

## Decisions (do these first — they block later work)

These are **YOU** tasks. Claude can advise, but you must choose.

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| D1 | Where to store data | localStorage / JSON file / SQLite | **SQLite** (per `v2.txt`) |
| D2 | How to run SQLite in Node | `better-sqlite3` (npm, needs build tools) / `node:sqlite` built-in (needs Node ≥ 22) | **`better-sqlite3`** — simplest API, well-documented |
| D3 | Auth method | JWT / session cookies | **Session cookies** — simpler, revocable, fine for one server |
| D4 | When to do the big refactor (Phase 7 folder structure) | Before Sprint 1 / gradually / before Sprint 3 | **Gradually** — restructure as each sprint needs it, fully done before auth |

> If you pick D2 = `node:sqlite`, you must upgrade Node to v22+ and change `engines` in `package.json`. Tell Claude which you chose.

---

## Sprint 1 — Grades & Change Detection

Goal: grades become first-class data; the app notices new assignments and posted grades.

### Step 1.1 — Refactor the data model (Phase 1)

This is the **single most important task** — everything else builds on it.

**AI tasks:**
- Create a `normalizeAssignment(rawAssignment)` function that produces a clean, flat object:
  `{ id, name, course, dueDate, status, grade, score, feedback }`
- Pull `submission.score`, `submission.grade`, `submission.submission_comments` into that model.
- Refactor `script.js` so `render()` only *reads* normalized data — **no grade/status logic inside DOM rendering** (this is the explicit pushback in `v2.txt`).
- Update the assignment card UI to show **Grade**, **Score**, and **Feedback**.

**YOU tasks:**
- Run the app, open a course where you have graded work, and confirm grades + feedback display correctly.
- Spot-check an ungraded assignment — it should not show a fake/blank grade.

**Done when:** every card shows grade/feedback when it exists, and `render()` contains no conditional grade math.

### Step 1.2 — Set up the database

**YOU tasks:**
- Confirm decision D2.
- If `better-sqlite3`: run `npm install better-sqlite3`. On Windows this needs build tools — if it fails, install [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (C++ workload) or Python, then retry. Tell Claude if it fails.

**AI tasks:**
- Create `db/schema.sql` with tables: `assignments`, `notifications` (later sprints add `users`, `canvas_connections`, `grades`).
- Create a `db/` module that opens the SQLite file and runs the schema on first start.

**Done when:** `node server.js` creates the `.db` file with no errors.

### Step 1.3 — New assignment detection (Phase 2)

**AI tasks:**
- Build the **assignment diff engine**: on each Canvas pull, compare fetched assignment IDs against stored IDs.
- Any ID not in the DB → insert it + create a `New Assignment` notification row.
- Save the current pull to the DB.

**YOU tasks:**
- Test: delete a row from the DB manually, restart, confirm it is re-detected as "new."

### Step 1.4 — Grade-posted detection (Phase 4)

**AI tasks:**
- Build a **separate** `GradeWatcher` (do **not** merge into assignment polling — explicit pushback in `v2.txt`).
- Compare previous stored `score`/`grade` vs new. Trigger on `null → value`, letter change, or number change.
- Insert a `Grade Posted` notification row.

**YOU tasks:**
- Verify against a real course where a grade recently changed.

**Sprint 1 deliverable:** normalized data model + SQLite + `AssignmentWatcher` + `GradeWatcher`.

---

## Sprint 2 — Alerts & Notification Center

### Step 2.1 — Deadline approaching alerts (Phase 3)

**YOU tasks:**
- Decide thresholds (default from `v2.txt`: 24h, 3h, overdue).
- Decide scheduler: `node-cron` package vs a plain server-side `setInterval`. Recommendation: `node-cron`. If chosen, `npm install node-cron`.

**AI tasks:**
- Build a **Node-side** background scheduler (`services/scheduler.js`). **Not** browser `setInterval` — explicit pushback in `v2.txt`.
- On each tick: read assignments from DB, check due dates against thresholds, insert `Deadline Soon` / `Overdue` notification rows (dedupe so the same alert is not created twice).

**Done when:** the server logs alerts on schedule even with no browser open.

### Step 2.2 — Notification Center UI (Phase 6)

**AI tasks:**
- Add a bell icon 🔔 to the header with an unread count.
- Build a notification panel rendering the 4 types: New Assignment, Grade Posted, Deadline Soon, Overdue.
- Add a `/proxy`-style API route to fetch notifications and mark them read.
- Notification schema: `{ id, userId, type, message, read, createdAt }`.

**YOU tasks:**
- Click through: open panel, mark read, confirm count updates and persists after refresh.

**Sprint 2 deliverable:** notification scheduler + notification center UI.

---

## Sprint 3 — Accounts & Per-User Canvas

This is the **biggest architecture jump** and the **biggest engineering risk** (`v2.txt`). Do not start until Sprints 1–2 are stable.

### Step 3.1 — App restructure (Phase 7)

**AI tasks:**
- Move to the folder structure from `v2.txt`:
  ```
  /server  → server.js, routes/{auth,canvas,notifications}.js, services/{assignmentWatcher,gradeWatcher,scheduler}.js, db/schema.sql
  /client  → index.html, script.js, ui/{assignmentRenderer,notificationRenderer,authUI}.js
  ```
- Keep it **vanilla JS — do not introduce React** (explicit pushback in `v2.txt`).

**YOU tasks:**
- Confirm the app still runs after the move before adding auth.

### Step 3.2 — User accounts & auth (Phase 5)

**YOU tasks:**
- Confirm D3 (session cookies vs JWT).
- Approve the DB tables: `users`, `canvas_connections`, `assignments`, `notifications`, `grades`.
- Generate and store a session/JWT secret in a `.env` file — **never commit it**.

**AI tasks:**
- Add `npm install` deps for password hashing (`bcrypt`) and sessions/JWT.
- Build sign-up / login / logout routes and an `authUI.js` frontend.
- Build "Connect Canvas" flow: user pastes their **own** Canvas token → stored (encrypted) in `canvas_connections`, keyed to their user.
- **Remove the hardcoded token** in `server.js`. The proxy now uses the logged-in user's token.
- Scope every assignment/notification query to `userId`.

**YOU tasks:**
- Create 2 test accounts, connect different Canvas tokens, confirm data does not leak between users.
- Confirm logging out blocks access.

**Sprint 3 deliverable:** multi-user app, per-user Canvas tokens, no hardcoded secrets.

---

## Sprint 4 — Push & Multi-Device

### Step 4.1 — External notification channels

**YOU tasks (account setup — only a human can do these):**
- Email: create an SMTP/SendGrid account, get credentials.
- Web push: generate VAPID keys.
- SMS (optional): create a Twilio account, get a number + credentials.
- Put all of these in `.env`.

**AI tasks:**
- Extend the notification engine to also dispatch via email / web push / SMS based on user preference.
- Add a notification-preferences UI.

### Step 4.2 — Multi-device sync

This mostly comes free once data lives in the DB and is scoped per user (Sprint 3). 

**AI tasks:**
- Verify any remaining `localStorage` use is removed in favor of DB-backed state.
- Optionally add polling or SSE so an open tab refreshes when new notifications land.

---

## North-Star Architecture (target end state)

```
Canvas API
   ↓
Node Proxy / API  (per-user tokens)
   ↓
Watchers (assignment + grade + deadline)
   ↓
SQLite  (→ Postgres if it ever needs to scale)
   ↓
Notification Engine
   ↓
Frontend Dashboard
```

---

## Risk register (watch these)

| Risk | Mitigation |
|------|------------|
| **Biggest engineering risk:** auth + per-user tokens | Don't start Sprint 3 until 1–2 are solid; encrypt stored tokens; never commit `.env` |
| **Biggest tech-debt risk:** all logic in `script.js` | Do the Step 1.1 normalization refactor properly; split UI into `ui/*.js` in Sprint 3 |
| Native module build failures (`better-sqlite3`) | Decision D2 — have the `node:sqlite` fallback ready |
| Duplicate notifications from the scheduler | Dedupe logic in Step 2.1 |
| Secrets in the repo | `.env` + add it to `.gitignore` before Sprint 3 |

## First task to hand Claude

> "Do Step 1.1 — create `normalizeAssignment()` and refactor `render()` so grades are first-class data and no grade logic lives in DOM rendering."

Everything else builds on that.
