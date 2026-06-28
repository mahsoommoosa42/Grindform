---
name: deploying-railway
description: Deploy Grindform to Railway (single Docker image + PGlite on a Railway Volume) and verify it live. Use when deploying/redeploying to Railway, debugging container crash-loops, or the PGlite "ExitStatus exit(1)" startup crash.
---

# Deploying Grindform to Railway

Grindform deploys as a **single Docker image** (Lit client + Bun/Hono server + embedded
PGlite) built from the repo `Dockerfile`. `railway.json` pins `builder: DOCKERFILE` and a
`/v1/health` healthcheck. Data persists on a Railway Volume.

## Devin Secrets Needed
- `RAILWAY_TOKEN` — Railway **account** token (org-scoped). NOTE: the CLI treats the
  `RAILWAY_TOKEN` env var as a *project* token and `whoami`/project creation fail with
  "Unauthorized". Map it to `RAILWAY_API_TOKEN` and unset `RAILWAY_TOKEN`:
  ```bash
  export RAILWAY_API_TOKEN="$RAILWAY_TOKEN"; unset RAILWAY_TOKEN
  railway whoami   # should print the account email
  ```
- `GRINDFORM_ADMIN_EMAIL` / `GRINDFORM_ADMIN_PASSWORD` — set as Railway service variables;
  the server bootstraps/promotes this admin at startup.

## One-time setup
```bash
bun install -g @railway/cli      # or npm i -g @railway/cli
railway init -n Grindform                       # create project (interactive name prompt ok)
railway add --service grindform-web             # empty service
railway variables --service grindform-web \
  --set "GRINDFORM_ADMIN_EMAIL=$GRINDFORM_ADMIN_EMAIL" \
  --set "GRINDFORM_ADMIN_PASSWORD=$GRINDFORM_ADMIN_PASSWORD" \
  --set "PORT=3000" --set "GRINDFORM_DATA_DIR=/data/pgdata"
railway volume add -m /data                     # persistent volume at /data
railway domain --service grindform-web --port 3000   # public HTTPS URL
railway up --service grindform-web --ci         # build from Dockerfile + deploy
```

## Critical gotchas (each one blocked a deploy)
1. **`docker VOLUME ... is not supported, use Railway Volumes`** — Railway rejects the
   Dockerfile `VOLUME` instruction. Remove it; attach a Railway Volume instead.
2. **`bun install --frozen-lockfile` fails: "Workspace dependency X not found"** — the
   Dockerfile copies package.json files per-package for layer caching. Every workspace under
   `packages/*` MUST have a matching `COPY packages/<pkg>/package.json ...` line. When a new
   package is added, update the Dockerfile or the build breaks.
3. **PGlite crash-loop `ExitStatus: Program terminated with exit(1)` right after "Mounting
   volume"** — PGlite's `initdb` requires an *empty* data dir, but ext4 volumes (Railway,
   Fly) carry a `lost+found` entry at their mount root. Point `GRINDFORM_DATA_DIR` at a
   **subdirectory** of the mount (`/data/pgdata`), never the mount root. Reproduce locally:
   `docker run -e GRINDFORM_DATA_DIR=/data -v /tmp/v:/data ...` after `mkdir -p /tmp/v/lost+found`.
4. **Healthcheck "service unavailable"** — set a `PORT` service var matching the app/EXPOSE
   (3000) and create the domain with `--port 3000`. Bump `healthcheckTimeout` for cold starts.

## Debugging a failed deploy
- Failed-healthcheck deploys only surface **build** logs via `railway logs`. To see the
  **runtime** crash, temporarily remove the healthcheck from `railway.json`, `railway up`
  (it deploys even while crash-looping), then `railway logs` shows the container stdout.
- `docker` is available locally — build (`docker build -t grindform-test .`) and run with a
  bind mount to reproduce volume/runtime issues fast instead of round-tripping to Railway.

## Verify live
```bash
URL=https://<service>.up.railway.app
curl -s $URL/v1/health                              # {"status":"ok"}
curl -s -D - -o /dev/null $URL/ | grep -i 'content-security-policy\|strict-transport\|x-frame'
curl -s -X POST $URL/v1/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$GRINDFORM_ADMIN_EMAIL\",\"password\":\"$GRINDFORM_ADMIN_PASSWORD\"}"  # 200 role:admin
```
Browser smoke test (Girly Pop): load URL → sign in as admin → account menu shows **Admin
console** → switch theme to Girly Pop and confirm the hot-pink Bubblegum Pop palette renders.
