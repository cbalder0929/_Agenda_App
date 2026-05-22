# Deploying Agendi to Azure App Service

This guide deploys the app to **Azure App Service (Linux)** using the Azure CLI. The free tier (F1) is enough to run the app.

**Time to complete:** ~15 minutes

---

## Prerequisites

- An [Azure account](https://azure.microsoft.com/free) (free tier works)
- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed
- Git installed
- The app running locally without errors first

---

## Step 1 — Log in to Azure

```bash
az login
```

A browser window will open. Sign in with your Microsoft account. When it says "You have logged in," close the tab and return to the terminal.

Confirm your subscription is active:

```bash
az account show
```

---

## Step 2 — Create a resource group

A resource group is a container for all the Azure resources this app will use.

```bash
az group create --name agendi-rg --location eastus
```

You can use a different location (e.g. `centralus`, `westus2`). `eastus` is generally the cheapest.

---

## Step 3 — Create the App Service plan

This is the server that runs your app. `F1` is the free tier.

```bash
az appservice plan create \
  --name agendi-plan \
  --resource-group agendi-rg \
  --sku F1 \
  --is-linux
```

> **Free tier limitation:** F1 apps go to sleep after 20 minutes of inactivity. The background deadline scheduler won't run while the app is asleep. If you want the scheduler always running, upgrade to **B1** (~$13/month) and enable Always On in Step 6.

---

## Step 4 — Create the web app

Replace `agendi-yourname` with a name that is globally unique (it becomes part of your URL).

```bash
az webapp create \
  --name agendi-yourname \
  --resource-group agendi-rg \
  --plan agendi-plan \
  --runtime "NODE:22-lts"
```

Your app URL will be: `https://agendi-yourname.azurewebsites.net`

---

## Step 5 — Set environment variables

Azure calls these "app settings." Set your Canvas token and tell the DB where to write on persistent storage.

```bash
az webapp config appsettings set \
  --name agendi-yourname \
  --resource-group agendi-rg \
  --settings \
    CANVAS_TOKEN="paste_your_token_here" \
    DB_PATH="/home/agendi.db" \
    NODE_ENV="production"
```

- `CANVAS_TOKEN` — your Canvas API token (from Account → Settings → Approved Integrations)
- `DB_PATH="/home/agendi.db"` — puts the database in Azure's persistent `/home` directory so it survives redeployments
- `NODE_ENV="production"` — standard Node.js production flag

> Never put your token in the code or commit it to git.

---

## Step 6 — (Optional) Enable Always On

Only available on B1 and above. Keeps the app warm so the scheduler runs reliably.

```bash
az webapp config set \
  --name agendi-yourname \
  --resource-group agendi-rg \
  --always-on true
```

Skip this on the free F1 tier — it is not supported and the command will error.

---

## Step 7 — Deploy the code

From the project root:

```bash
az webapp up \
  --name agendi-yourname \
  --resource-group agendi-rg \
  --runtime "NODE:22-lts"
```

This zips your project, uploads it, and runs `npm install` on the server (which compiles `better-sqlite3`'s native module). It takes about 2–3 minutes the first time.

You will see output like:

```
The webapp 'agendi-yourname' doesn't exist
Creating Resource group 'agendi-rg' ...
...
Deployment successful.
URL: https://agendi-yourname.azurewebsites.net
```

---

## Step 8 — Verify

Open the URL in a browser:

```
https://agendi-yourname.azurewebsites.net
```

If assignments load, the deployment worked. If you see an error:

```bash
# Stream live logs
az webapp log tail --name agendi-yourname --resource-group agendi-rg
```

Common issues:

| Error | Fix |
|-------|-----|
| `Cannot find module 'better-sqlite3'` | The native build failed. See Troubleshooting below. |
| `401 Unauthorized` from Canvas | `CANVAS_TOKEN` app setting is missing or wrong. Check Step 5. |
| Blank page, no assignments | Open browser devtools → Network tab, look for failed requests. |
| `ENOENT agendi.db` | `DB_PATH` app setting is missing. Check Step 5. |

---

## Redeploying after changes

Every time you update the code, run:

```bash
az webapp up --name agendi-yourname --resource-group agendi-rg
```

The database at `/home/agendi.db` is **not** affected by redeployments — it lives outside the app directory.

---

## Rotating your Canvas token

```bash
az webapp config appsettings set \
  --name agendi-yourname \
  --resource-group agendi-rg \
  --settings CANVAS_TOKEN="new_token_here"
```

The app restarts automatically.

---

## Shutting down / deleting everything

Deletes the app and all associated resources:

```bash
az group delete --name agendi-rg --yes
```

---

## Troubleshooting: better-sqlite3 native build fails

`better-sqlite3` compiles a C++ addon. If it fails on Azure you will see an error about `node-pre-gyp` or `binding.node`.

**Fix — use prebuilt binaries:**

```bash
npm install better-sqlite3 --build-from-source=false
```

If that also fails, open `package.json` and add:

```json
"scripts": {
  "postinstall": "npm rebuild better-sqlite3 --update-binary"
}
```

Then redeploy.

**Alternative — switch to node:sqlite (Node 22+ built-in):**

Node 22 ships a built-in SQLite module (`node:sqlite`). No npm package needed. This requires rewriting `db/index.js` to use `require('node:sqlite')` instead of `better-sqlite3`. Ask Claude to do this migration if you want to remove the native dependency entirely.

---

## Cost summary

| Resource | Tier | Cost |
|----------|------|------|
| App Service Plan | F1 (free) | $0/month |
| App Service Plan | B1 (Always On) | ~$13/month |
| Outbound data | first 5 GB/month | $0 |

The F1 tier has 60 CPU minutes/day. For a personal assignment tracker with occasional use, this is plenty.
