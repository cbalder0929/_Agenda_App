# Deploying Agendi for free (Render + Neon)

This guide deploys the app on **Render** (web host) with a **Neon** Postgres database. Both have genuinely free tiers — no credit card, no expiring trial credits.

**Why not Azure:** Azure's free trial gives $200 of credits for 30 days. When that runs out, Azure disables the whole subscription, which blocks *all* deploys — even the "free" F1 tier. Render's free tier doesn't expire.

**Why Postgres instead of SQLite:** Render's free tier has an ephemeral filesystem — a local SQLite file would be wiped on every restart, resetting notification history and re-flagging every assignment as "new." Neon's free Postgres persists permanently.

**Time to complete:** ~20 minutes

---

## Step 1 — Create the database (Neon)

1. Go to [neon.tech](https://neon.tech) and sign up (GitHub login works, no card needed).
2. Create a new project — accept the defaults. A database is created for you.
3. On the project dashboard, find the **Connection string** and copy it. It looks like:

   ```
   postgresql://user:password@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

   Save this — it's your `DATABASE_URL`. The app creates its tables automatically on first start, so there's nothing else to set up here.

---

## Step 2 — Push the code to GitHub

Render deploys from a GitHub repo.

```bash
git add .
git commit -m "Migrate to Postgres for Render deployment"
git push
```

If you don't have a GitHub repo yet, create one at [github.com/new](https://github.com/new), then:

```bash
git remote add origin https://github.com/YOUR_USERNAME/agendi.git
git branch -M main
git push -u origin main
```

> The Canvas token is read from an environment variable in production — never commit it. `.env` is already gitignored.

---

## Step 3 — Create the web service on Render

1. Go to [render.com](https://render.com) and sign up (GitHub login, no card needed).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account and select the `agendi` repo.
4. Fill in the settings:

   | Setting | Value |
   |---------|-------|
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance Type | **Free** |

   (If the repo contains `render.yaml`, Render fills these in automatically — just confirm.)

5. **Don't deploy yet** — set the environment variables first (Step 4).

---

## Step 4 — Set environment variables

In the Render service settings, open the **Environment** section and add:

| Key | Value |
|-----|-------|
| `CANVAS_TOKEN` | your Canvas API token (Account → Settings → New Access Token) |
| `DATABASE_URL` | the Neon connection string from Step 1 |
| `NODE_ENV` | `production` |

Do **not** set `PORT` — Render injects it automatically, and `server.js` already reads `process.env.PORT`.

Click **Create Web Service**. Render runs `npm install` (no native build — `pg` is pure JavaScript) and starts the app. The first deploy takes 2–3 minutes.

---

## Step 5 — Verify

Render shows a URL like `https://agendi.onrender.com`. Open it.

If assignments load, the deployment worked. To watch what's happening, open the **Logs** tab in Render. On a healthy start you'll see:

```
[startup] Postgres schema ready
[startup] Server running at http://0.0.0.0:10000
[scheduler] Running deadline checks every 15 min
```

Common issues:

| Symptom | Fix |
|---------|-----|
| `DATABASE_URL is not set` | The env var is missing — recheck Step 4. |
| Logs show a Postgres connection/SSL error | Re-copy the Neon connection string; keep the `?sslmode=require` suffix. |
| `401 Unauthorized` from Canvas | `CANVAS_TOKEN` is missing or expired. |
| Blank page, no assignments | Open browser devtools → Network tab, look for failed requests. |

---

## Free tier behavior to know about

- **Spin-down:** a free Render service sleeps after 15 minutes of inactivity. The next visit takes ~30–60 seconds to wake up. While asleep, the 15-minute deadline scheduler doesn't run — so deadline alerts catch up the next time you open the app, rather than firing in real time.
- **Neon autosuspend:** the free database also pauses when idle and resumes on the next query (a second or two). No data is lost.
- Both are fine for a personal assignment tracker. To remove spin-down, upgrade the Render service to a paid instance (~$7/month) — no code change needed.

---

## Redeploying after changes

Render auto-deploys on every push to the connected branch:

```bash
git add .
git commit -m "describe your change"
git push
```

The Neon database is separate from the web service, so redeploys never touch your data.

---

## Running locally

The app needs a `DATABASE_URL` even locally. Easiest option: reuse the same Neon string (or create a second Neon project as a dev database).

Create a `.env` file in the project root (already gitignored):

```
CANVAS_TOKEN=your_token_here
DATABASE_URL=postgresql://...your neon string...
```

Then load it and start the server. With Node 20.6+:

```bash
node --env-file=.env server.js
```

Open `http://localhost:3001`.

---

## Rotating your Canvas token

Update the `CANVAS_TOKEN` value in Render's Environment settings and save. Render restarts the service automatically.
