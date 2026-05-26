# Agendi 📚

**Agendi** is a personal assignment tracker for Columbia College Chicago students. It connects to your Canvas account, pulls in all your assignments and grades, and sends you alerts before deadlines hit — all in one clean dashboard that runs in your browser.

Built for `canvas.colum.edu`.

---

## What does it do?

Think of it as a smarter view of Canvas. Instead of clicking through course by course, everything shows up in one place:

- 📋 **All your assignments in one list** — sorted newest first, grouped into *Overdue*, *Due this week*, *Upcoming*, and *No due date*
- 🎓 **Grades at a glance** — each assignment card shows your score with color coding (🟢 ≥80%, 🟡 60–79%, 🔴 <60%), and each course shows a letter grade
- 💬 **Professor feedback** — if your professor left a comment on a submission, it shows up on the card
- 🔍 **Filter & search** — filter by course or status tab, or just type to search
- 🔔 **Notification center** — the bell icon in the top corner tracks:
  - New assignments posted to Canvas
  - Grades that just got posted
  - Deadline warnings (24 hours out, 3 hours out, and overdue)
- 📊 **Your GPA** — calculated live from your Canvas scores using a standard 4.0 unweighted scale

---

## How does it work? (Plain English)

The app has two parts:

1. **A small web server** that runs on your computer (or in the cloud). It acts as a go-between for your browser and Canvas — your Canvas API token lives on the server so it never gets exposed in your browser.

2. **A webpage** (the actual dashboard) that your browser opens. When you load it, it asks the server to fetch your courses and assignments from Canvas, then displays them.

Here's the flow in plain steps:

```
You open the app in your browser
  → Your browser asks the server for your Canvas data
  → The server fetches it from canvas.colum.edu using your token
  → Your browser displays the assignments
  → Your browser saves a snapshot to the database (so the app can detect what's new next time)
  → Every 15 minutes, the server quietly checks due dates and creates alerts if needed
```

The database (PostgreSQL) stores your assignments and notifications so the app can tell you "hey, this is new!" and "your grade just changed!" on future loads.

---

## What you need before starting

| Thing | Why | Where to get it |
|---|---|---|
| [Node.js](https://nodejs.org/) v18+ | Runs the server | nodejs.org — download the LTS version |
| A Canvas API token | Proves to Canvas you're you | See instructions below |
| A PostgreSQL database | Stores your data between sessions | Free at [neon.tech](https://neon.tech) — no credit card |

---

## Setup (step by step)

### Step 1 — Download the code and install packages

```bash
# In the project folder:
npm install
```

This downloads the two packages the app needs (`pg` for the database and `dotenv` for config).

---

### Step 2 — Get your Canvas API token

Your Canvas API token is like a password that lets the app read your Canvas data without you having to log in every time.

1. Log in to Canvas at [canvas.colum.edu](https://canvas.colum.edu)
2. Click your profile picture (top-left) → **Account** → **Settings**
3. Scroll down to **Approved Integrations**
4. Click **+ New Access Token**, give it a name like "Agendi", and click **Generate Token**
5. **Copy the token** — you won't be able to see it again after you close that dialog

> ⚠️ Treat this token like a password. Don't share it or commit it to Git.

---

### Step 3 — Get a free database

The app needs a PostgreSQL database to store your assignments and notifications.

1. Go to [neon.tech](https://neon.tech) and sign up (GitHub login works, no card needed)
2. Create a new project — accept the defaults
3. On the project dashboard, find the **Connection string** and copy it — it looks like:
   ```
   postgresql://user:password@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

The app automatically creates its database tables on first run, so you don't need to do anything else here.

---

### Step 4 — Create a `.env` config file

In the project root folder, create a file called **`.env`** (just a dot, then "env", no extension) and paste in:

```
DATABASE_URL=postgresql://...your neon connection string...
CANVAS_TOKEN=your_token_here
```

- Replace the database URL with the one you copied from Neon
- Replace the token with the one you copied from Canvas

This file is already in `.gitignore`, so it will never accidentally get committed to GitHub.

---

### Step 5 — Start the server

```bash
npm start
```

You should see:
```
[startup] Postgres schema ready
[startup] Server running at http://0.0.0.0:3001
[scheduler] Running deadline checks every 15 min
```

---

### Step 6 — Open the app

Open your browser and go to:

```
http://localhost:3001
```

The app will load and pull in all your Canvas courses and assignments. The first load takes a few seconds. The bell icon may show a bunch of notifications — that's normal on first run (every assignment looks "new"). Hit **Mark all read** to clear them.

---

## Deploying online (optional)

If you want to access the app from any device instead of just your computer, you can deploy it for free using **Render** (web host) + **Neon** (database). See **[deploy.md](deploy.md)** for a full step-by-step guide — takes about 20 minutes.

---

## Project file map

Here's what each file does, in plain English:

```
server.js                   The server — handles all requests, fetches Canvas data, runs the API
canvas-assignments.html     The webpage your browser loads (just the skeleton HTML)
script.js                   All the browser-side logic — fetches data, builds the page
styles.css                  All the visual styling
package.json                Lists the app's dependencies
.env                        Your secret config (token + database URL) — never commit this
db/
  index.js                  Connects to the database; creates tables if they don't exist yet
  schema.sql                The table definitions (assignments + notifications)
services/
  assignmentWatcher.js      Compares incoming assignments to the database; flags new ones
  gradeWatcher.js           Compares incoming grades to the database; flags changes
  scheduler.js              Runs every 15 min; fires deadline alerts (24h / 3h / overdue)
```

---

## Notification types

| Notification | When it fires |
|---|---|
| 🆕 New assignment | An assignment appeared in Canvas that wasn't there last time |
| ✅ Grade posted | A grade was posted or changed since the last sync |
| ⏰ Due in 24 hours | Assignment is unsubmitted and due within 24 hours |
| 🚨 Due in 3 hours | Assignment is unsubmitted and due within 3 hours |
| ❌ Overdue | Assignment is past due and still unsubmitted |

Each alert fires **once per assignment** — the scheduler won't spam you.

---

## Configuration reference

| Variable | Required? | Default | What it does |
|---|---|---|---|
| `DATABASE_URL` | ✅ Yes | — | PostgreSQL connection string (from Neon) |
| `CANVAS_TOKEN` | ✅ Yes | — | Your Canvas API token |
| `PORT` | No | `3001` | Port the server listens on |

Set these in your `.env` file locally, or in your hosting platform's environment settings when deploying.

---

## Troubleshooting

| Problem | Likely fix |
|---|---|
| Page loads but shows no assignments | Check the browser console (F12) for errors; make sure `CANVAS_TOKEN` is correct |
| `DATABASE_URL is not set` on startup | Your `.env` file is missing or in the wrong folder |
| Postgres connection error | Double-check the Neon connection string; make sure it ends with `?sslmode=require` |
| `401 Unauthorized` in the network tab | Your Canvas token is missing or expired — generate a new one |
| Bell shows tons of notifications on first load | Normal — hit **Mark all read** to clear the first-run batch |

---

## Notes

- The app is currently **single-user** — one Canvas token, one database. Multi-user support with individual logins is planned for a future update.
- `DOMAIN` is defined in both `server.js` and `script.js` — if you ever point this at a different Canvas instance, update both files.
- Never commit your `.env` file or your Canvas token to Git.
