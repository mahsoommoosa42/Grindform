---
name: testing-auth-admin-gdpr
description: Test Grindform's auth gate, admin console, and GDPR flows end-to-end in the browser. Use when verifying authentication, multi-user, admin support tooling, or GDPR (consent/export/delete/audit) changes.
---

# Testing Grindform auth / admin console / GDPR

## Run the app locally
The web server is `packages/web/src/server.ts` (Bun + Hono + PGlite). Build the client first, then start the server with test-friendly env vars:

```bash
bun run --filter '@grindform/web' build
cd packages/web && \
  GRINDFORM_DATA_DIR=memory \
  GRINDFORM_INSECURE_COOKIES=1 \
  ADMIN_EMAILS="boss@grindform.test" \
  PORT=3000 bun run src/server.ts
```

- `GRINDFORM_DATA_DIR=memory` → fresh in-memory DB each start (clean state).
- `GRINDFORM_INSECURE_COOKIES=1` → drops the `Secure` cookie attr so the `gf_session` cookie is stored over plain HTTP (required for localhost testing).
- `ADMIN_EMAILS` → comma-separated allowlist; a user registering with a listed email gets `role: admin` and sees the **Admin console** menu entry.
- `GRINDFORM_AUTH_RATE_LIMIT` → raise it (e.g. `100000`) when driving many signups from one IP (e.g. the Playwright matrix); default is 20/15min per IP.

## Gotcha: stale server on port 3000
A dev server from a previous session may still hold port 3000 running an OLD build (no auth routes) → POST `/v1/auth/register` returns `404` while GET `/v1/health` returns `200`. There is no `lsof`; kill it with:
```bash
fuser -k 3000/tcp ; pkill -9 -f server.ts ; ss -ltn | grep :3000 || echo free
```
Then restart and confirm register works (`curl -X POST /v1/auth/register ... -> 201`) before recording.

## API routes (all under /v1)
- Public: `GET /v1/health`, `GET /v1/exercises`, `POST /v1/auth/register`, `POST /v1/auth/login`, `GET /v1/auth/me`
- Auth'd: `POST /v1/auth/logout`, `GET /v1/account/export`, `DELETE /v1/account`, plans/settings
- Register body: `{ email, password (>=8 chars), acceptTerms: true }` — `acceptTerms` must be literally `true` (Zod `z.literal(true)`), else 400.
- Admin routes registered via `registerAdminRoutes`; gated by `role === 'admin'`.

You can pre-seed a throwaway "victim" account via curl to `POST /v1/auth/register` (independent of the browser session) for admin disable/enable/delete tests.

## UI navigation (Lit SPA, single `<gf-app>`)
All flows are reachable by clicking; key landmarks (testids exist for Playwright):
- Auth screen shows by default when logged out. "Create one" / "Sign in" link toggles register vs login. Register form has a consent checkbox + "privacy terms" link.
- Submitting register WITHOUT consent → error banner "Please accept the privacy terms to create an account." (consent is enforced server-side).
- After login, top-right avatar (initial letter) opens the account menu: email, **Admin console** (admins only), **Privacy & data**, **Export my data**, **Delete account**, **Log out**.
- **Export my data** triggers a browser download `grindform-export.json` (contains account, role, termsAcceptedAt, settings, plans).
- **Admin console**: user table (email/role/status/plans/last-login) + per-row **View**. Detail drawer has **Disable/Enable account**, **Delete account** (JS confirm dialog), and an **Audit trail** list. Disable/enable flips the status pill and appends `admin.user.disable` / `admin.user.enable` audit entries; delete removes the row (hard delete).
- Theme `<select>` in header persists across logout/reload (localStorage).
- Session persists across reload via the `gf_session` HttpOnly cookie.

## Commands
- Build client: `bun run --filter '@grindform/web' build`
- Unit/integration tests (100% coverage gate): `bun run test`
- E2E: `cd packages/web && npx playwright test` (220 tests, Chromium/WebKit × mobile/tablet/laptop; the harness lifts the rate limit and disables Secure cookies, and gives each project its own admin email).

## Devin Secrets Needed
None — all testing runs against a local server with throwaway accounts and an env-var admin allowlist.
