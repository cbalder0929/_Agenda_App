# Canvas Agenda — AI Context

## What this is

A single-page Canvas LMS assignment viewer for Columbia College Chicago (`canvas.colum.edu`). It runs as a local Node.js server that proxies Canvas API requests to avoid CORS, then serves a static frontend that renders assignments client-side.

No npm dependencies. No build step. Node.js built-ins only.

## Architecture

```
server.js               HTTP server + API proxy (Node core: http, https, fs, path)
canvas-assignments.html App shell — minimal HTML, no inline logic
script.js               All frontend logic: fetch, render, filter, search
styles.css              All styles
```

### Request flow

```
Browser fetch(/proxy/api/v1/...) → server.js strips /proxy → HTTPS request to canvas.colum.edu → pipes response back
```

Static files (`/`, `*.html`, `*.css`, `*.js`) are served from the project root.

### Key constants

- `server.js:7` — `DOMAIN = 'canvas.colum.edu'` (also in `script.js:1`)
- `server.js:6` — `TOKEN` read from `process.env.CANVAS_TOKEN`, fallback to hardcoded string
- `server.js:8` — `PORT` default `3001`
- `script.js:2` — `PROXY_BASE` switches between `localhost:3001` and `window.location.origin` based on hostname

## Frontend logic (script.js)

**Data flow:**
1. `load()` — fetches active courses with grades, then fetches assignments per course in parallel
2. All data stored in module-level `allAssignments[]` and `courses{}` 
3. `render()` — filters, sorts, groups, and rebuilds the DOM from those arrays on every user action

**Assignment classification (`classifyDue`):**
- `overdue` — due date in the past
- `soon` — due within 7 days
- `upcoming` — due after 7 days
- `no-date` — no due date

**Grouping order in render:** Overdue → Due this week → Upcoming → No due date

**Submission status** is read from `a.submission.workflow_state` — `submitted`, `graded`, or `pending_review` count as turned in.

**Pagination** is handled by `fetchAll()`, which follows Canvas's `Link: <url>; rel="next"` headers.

## What to watch out for

- The token fallback in `server.js:6` is a real token — if editing, don't accidentally log or expose it. The correct fix is always `CANVAS_TOKEN` env var.
- `escHtml()` in script.js is used consistently for all user-facing Canvas data — keep it that way.
- The server has a directory traversal guard at `server.js:59` — don't weaken it.
- `DOMAIN` appears in two files and must stay in sync if changed.
- No framework, no bundler, no TypeScript — keep it that way unless explicitly asked to add one.
