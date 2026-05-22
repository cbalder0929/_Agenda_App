# Canvas Agenda

A lightweight web app that pulls your Canvas LMS assignments and displays them in a clean, filterable list with course grades and submission status.

Built for Columbia College Chicago (`canvas.colum.edu`).

---

## What it does

- Shows all assignments from your active Canvas courses
- Groups them by status: **Overdue**, **Due this week**, **Upcoming**, **No due date**
- Displays your current grade per course
- Lets you filter by course, status tab, or free-text search
- Shows whether each assignment has been turned in

---

## Requirements

- [Node.js](https://nodejs.org/) v18 or higher
- A Canvas API token from your school account

---

## Setup

### 1. Get your Canvas API token

1. Log in to Canvas at [canvas.colum.edu](https://canvas.colum.edu)
2. Go to **Account → Settings → Approved Integrations**
3. Click **+ New Access Token**, give it a name, and copy the token

### 2. Set your token

Open `server.js` and replace the token value on line 6:

```js
const TOKEN = process.env.CANVAS_TOKEN || 'YOUR_TOKEN_HERE';
```

Or set it as an environment variable (recommended — keeps the token out of the file):

```powershell
$env:CANVAS_TOKEN = "your_token_here"
node server.js
```

```bash
CANVAS_TOKEN=your_token_here node server.js
```

### 3. Install and run

No dependencies to install. Just start the server:

```bash
node server.js
```

Then open your browser to:

```
http://localhost:3001
```

---

## How it works

The app is a small Node.js HTTP server (`server.js`) with no npm dependencies.

- **Static files** (`canvas-assignments.html`, `styles.css`, `script.js`) are served directly.
- **Canvas API requests** from the browser go to `/proxy/api/v1/...` on the local server, which forwards them to `canvas.colum.edu` with your token attached. This avoids CORS issues that would block direct browser requests.
- The frontend (`script.js`) fetches your courses and assignments, handles pagination, and renders everything client-side.

```
Browser → localhost:3001/proxy/api/v1/... → canvas.colum.edu/api/v1/...
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `CANVAS_TOKEN` | hardcoded in server.js | Your Canvas API token |
| `PORT` | `3001` | Port the server listens on |

To use a different port:

```powershell
$env:PORT = "8080"
node server.js
```

---

## File structure

```
.
├── server.js               # Node HTTP server + Canvas API proxy
├── canvas-assignments.html # App shell (HTML)
├── script.js               # All frontend logic
├── styles.css              # Styles
└── package.json
```

---

## Notes

- Do not commit your Canvas token to git. Use the `CANVAS_TOKEN` environment variable instead.
- This is hardcoded for `canvas.colum.edu`. To use a different Canvas instance, change the `DOMAIN` constant in both `server.js` (line 7) and `script.js` (line 1).
