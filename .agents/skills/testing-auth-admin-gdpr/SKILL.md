---
name: testing-auth-admin-gdpr
description: Test Grindform's auth gate, admin console, GDPR, and email verification flows end-to-end in the browser. Use when verifying authentication, multi-user, admin support tooling, GDPR (consent/export/delete/audit), or email verification changes.
---

# Testing Grindform auth / admin console / GDPR / email verification

## Run the app locally
The web server is `packages/web/src/server.ts` (Bun + Hono + PGlite). Build the client first, then start the server with test-friendly env vars:

```bash
bun run --filter '@grindform/web' build
cd packages/web && \
  GRINDFORM_DATA_DIR=memory \
  GRINDFORM_INSECURE_COOKIES=1 \
  GRINDFORM_TEST_HOOKS=1 \
  ADMIN_EMAILS="boss@grindform.test" \
  PORT=3000 bun run src/server.ts
```

- `GRINDFORM_DATA_DIR=memory` → fresh in-memory DB each start (clean state).
- `GRINDFORM_INSECURE_COOKIES=1` → drops the `Secure` cookie attr so the `gf_session` cookie is stored over plain HTTP (required for localhost testing).
- `GRINDFORM_TEST_HOOKS=1` → enables test-only endpoints (e.g. `/test/last-verify-url`) for retrieving verification tokens during manual or automated testing. **Not exposed in production.**
- `ADMIN_EMAILS` → comma-separated allowlist; a user registering with a listed email gets `role: admin` and sees the **Admin console** menu entry.
- `GRINDFORM_AUTH_RATE_LIMIT` → raise it (e.g. `100000`) when driving many signups from one IP (e.g. the Playwright matrix); default is 20/15min per IP.

Alternatively, use `bun run dev` from the repo root (builds client + starts with `--watch`), but you must export the env vars first.

## Gotcha: stale server on port 3000
A dev server from a previous session may still hold port 3000 running an OLD build (no auth routes) → POST `/v1/auth/register` returns `404` while GET `/v1/health` returns `200`. There is no `lsof`; kill it with:
```bash
fuser -k 3000/tcp ; pkill -9 -f server.ts ; ss -ltn | grep :3000 || echo free
```
Then restart and confirm register works (`curl -X POST /v1/auth/register ... -> 201`) before recording.

## API routes (all under /v1)
- Public: `GET /v1/health`, `GET /v1/exercises`, `POST /v1/auth/register`, `POST /v1/auth/login`, `GET /v1/auth/me`
- Auth'd: `POST /v1/auth/logout`, `POST /v1/auth/verify`, `POST /v1/auth/resend-verification`, `GET /v1/account/export`, `DELETE /v1/account`, plans/settings
- Register body: `{ email, password (>=8 chars), acceptTerms: true }` — `acceptTerms` must be literally `true` (Zod `z.literal(true)`), else 400.
- Admin routes registered via `registerAdminRoutes`; gated by `role === 'admin'`.

You can pre-seed a throwaway "victim" account via curl to `POST /v1/auth/register` (independent of the browser session) for admin disable/enable/delete tests.

## Email verification flow
New users are created with `emailVerified: false`. After sign-up:
- A red banner appears: "Please verify your email — we sent a link to {email}" with a **Resend** button.
- The verification link is console-logged by default (no real email provider needed).
- With `GRINDFORM_TEST_HOOKS=1`, retrieve the verification URL via: `GET /test/last-verify-url?email=<email>` → `{ url: "/?verify=<token>" | null }`.
- Navigate to `/?verify=<token>` to verify. On success: green "Email verified successfully!" banner, red banner disappears.
- Invalid/expired tokens show: "Invalid or expired verification link." (generic, no enumeration).
- After verification, the banner does not reappear on reload.

**Gotcha:** The URL returned by `/test/last-verify-url` might be relative (e.g. `/?verify=...`). When parsing in code, use `new URL(url, 'http://localhost')` to handle both relative and absolute URLs.

## UI navigation (Lit SPA, single `<gf-app>`)
All flows are reachable by clicking; key landmarks (testids exist for Playwright):
- Auth screen shows by default when logged out. "Create one" / "Sign in" link toggles register vs login. Register form has a consent checkbox + "privacy terms" link.
- Submitting register WITHOUT consent → error banner "Please accept the privacy terms to create an account." (consent is enforced server-side).
- After login, top-right avatar (initial letter) opens the account menu: email, **Admin console** (admins only), **Privacy & data**, **Export my data**, **Delete account**, **Log out**.
- **Export my data** triggers a browser download `grindform-export.json` (contains account, role, termsAcceptedAt, settings, plans).
- **Admin console**: user table (email/role/status/plans/last-login) + per-row **View**. Detail drawer has **Verify email** (only when `emailVerified === false`, `data-testid="admin-verify-email"`), **Disable/Enable account**, **Delete account** (JS confirm dialog), and an **Audit trail** list. Clicking "Verify email" calls `POST /v1/admin/users/:userId/verify`, sets `emailVerified = true`, records an `admin.user.verify` audit entry, and removes the button from the panel. The victim user's verification banner disappears on their next login/reload. Disable/enable flips the status pill and appends `admin.user.disable` / `admin.user.enable` audit entries; delete removes the row (hard delete).
- Theme `<select>` in header persists across logout/reload (localStorage).
- Session persists across reload via the `gf_session` HttpOnly cookie.
- **Email verification banner** (`data-testid="verify-banner"`) shows after sign-up when `emailVerified` is false. Contains the user's email and a Resend button (`data-testid="resend-verification"`). Success banner: `data-testid="verify-success"`. Error banner: `data-testid="verify-error"`.

## Commands
- Build client: `bun run --filter '@grindform/web' build`
- Unit/integration tests (100% coverage gate): `bun run test`
- E2E: `cd packages/web && npx playwright test` (Chromium/WebKit x mobile/tablet/laptop; the harness lifts the rate limit and disables Secure cookies, and gives each project its own admin email).

## Devin Secrets Needed
None — all testing runs against a local server with throwaway accounts and an env-var admin allowlist.
