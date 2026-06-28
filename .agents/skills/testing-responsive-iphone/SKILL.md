---
name: testing-responsive-iphone
description: Verify Grindform's responsive layout on phone viewports (esp. iPhone). Use when testing mobile/touch UI, theme rendering on small screens, or any CSS change in packages/web/src/client/main.ts that could overflow narrow widths.
---

# Testing Grindform responsive / iPhone layout

The primary user is on an iPhone, so phone-width layout must be verified visually,
not just via Playwright (the harness auto-scrolls elements into view, which hides
horizontal-overflow bugs that a real finger hits).

## Run the app locally
See `testing-auth-admin-gdpr` for the full server command. Quick version:
```bash
bun run --filter '@grindform/web' build
cd packages/web && GRINDFORM_DATA_DIR=memory GRINDFORM_INSECURE_COOKIES=1 \
  PORT=3000 bun run src/server.ts
```
To exercise the **admin console** on mobile, log in as the bootstrap admin. The
server seeds/promotes an admin on startup from `GRINDFORM_ADMIN_EMAIL` +
`GRINDFORM_ADMIN_PASSWORD` (provisioned as org secrets), then you sign in at the
normal login screen with those values. An allowlisted `ADMIN_EMAILS` entry also
grants admin on register.

## Emulate the phone
In Chrome DevTools device toolbar pick **iPhone 14 Pro Max (430×932)** (or any
≤560px width). The phone-specific CSS lives behind `@media (max-width: 560px)` in
`packages/web/src/client/main.ts`. After editing client CSS, rebuild
(`bun run --filter '@grindform/web' build`) and reload — the running server
serves the freshly built `public/app/main.js`.

Tips while emulating:
- `Ctrl+Shift+R` (hard reload) when the browser serves a stale `main.js` after a
  rebuild — long sessions cache the old bundle.
- `F12` can drop device emulation back to desktop width. To restore it, click into
  the page, then click the **device-toolbar icon** in the DevTools toolbar
  (top-left of the docked panel). `Ctrl+Shift+M` may be swallowed by Chrome's
  profile menu, so the icon is more reliable.

## Gotcha: stale server holds old workspace code (NOT a product bug)
Several Grindform packages (e.g. `@grindform/planner`) are **source-only**
(`package.json` `main` points at `./src/index.ts`, no build step). Bun loads that
TS into the server process **at startup**, so a server started before a `src/*.ts`
edit keeps running the OLD code — even though the file on disk is correct and the
client bundle is fresh. Symptom seen: tracker rendered `pyramid=off` / `warm-ups=0`
for main lifts even though `planner/src/generate.ts` sets `pyramid: true` on mains.
Diagnosis: compare server start time vs file mtime
(`ps -o lstart -p <pid>` vs `stat -c '%y' packages/planner/src/generate.ts`); also
hit `GET /v1/plans/:id` and check whether `pyramid`/`superset`/`primaryMuscles` are
present in the slot JSON (the DB round-trips `blocks` verbatim, so missing fields
point upstream to the running planner code, not serialization). Fix: **restart the
server** (don't patch code). Always restart the dev server after editing any
source-only package before testing.

## Known overflow hotspots (fixed; re-check after layout edits)
These were real iPhone bugs — guard against regressions when touching the topbar
or tracker:
- **Topbar** (`.topbar`): brand + nav + theme picker + account avatar do not fit
  one 430px row. Fix pattern: `flex-wrap: wrap` + CSS `order` so the nav drops to
  its own full-width second row while theme picker + account avatar stay reachable
  on row 1. If the account avatar is clipped off-screen, the account menu (logout /
  GDPR export / admin console) becomes unreachable.
- **Tracker slot** (`.slot` / `.slot-inputs`): with a short exercise name the
  name + kg/reps inputs + "Mark done" button stay inline and the button clips off
  the right edge. Fix pattern: at the phone breakpoint stack the slot
  (`flex-direction: column`) and make `.slot-inputs` full width with flexible
  inputs.

## Adversarial assertions that catch broken layout
- The element's right edge must stay within the viewport width. The e2e helper
  `expectWithinViewport` in `packages/web/e2e/responsive.spec.ts` checks
  `box.x + box.width <= viewport.width + 1`; reuse it for any element suspected of
  overflowing (e.g. `account-button`, `complete-<id>`).
- Tracking a set: tapping a main-lift "Mark done" must flip it to "Done ✓" and the
  modal header percent must increase (e.g. 0% → 20% for a 5-item session).

## Themes (must be exactly 4, no "Midnight")
The header `<select>` lists **Pulse** (default, white canvas / red accent),
**Grind** (true dark — matte-black canvas / white text / red accent), **Girly Pop**
(rose), **Minimal** (white / rust). Switching repaints live via
`<html data-theme="...">` and persists across reload (localStorage). To screenshot
each theme on mobile, click the picker and select each option; Grind should be near
-black, NOT beige (the old beige "Quillcast Paper" look was removed).

## Training engine (per-set tracker) — what to verify
Open a training day's **Track session**. Each exercise renders a `recent-weight` /
`recent-reps` input, a **Pyramid** checkbox, a **Warm-ups** stepper, warm-up ("W")
rows + working ("Set N") rows with kg/reps inputs, and a `Log` button per working
set. Concrete assertions that catch breakage:
- **Prescribed prefill:** type a recent set (e.g. 100×5) → an estimated `1RM ≈ … kg`
  appears and working-set weights auto-fill (e.g. 67.5/72.5/77.5/85) without typing
  into set rows. Blank weights = broken loadcalc wiring.
- **Pyramid:** ON → last working weight ≥ first (ramp up, reps down). Uncheck → all
  working sets show the same weight (flat). Mains default to pyramid ON + 2 warm-ups
  (verify after a fresh server start — see the stale-server gotcha above).
- **Logging:** `Log` flips to `Done ✓`, inputs lock, slot gains green `done` styling,
  header percent rises (e.g. 0% → 25% for a 4-exercise day).
- **Volume:** bottom of the tracker shows **Today's volume** (`… kg total moved` + a
  row per muscle); closing the tracker, **My week** shows a **Week volume** card. Both
  non-zero after logging.
- **Supersets:** accessories are paired and badged `Superset A1/A2 · back-to-back`.
Full plan: `test-plan-training-engine.md` at the repo root.

## Commands
- Build client: `bun run --filter '@grindform/web' build`
- Responsive e2e only, mobile engines:
  `cd packages/web && bunx playwright test responsive.spec.ts --project=chromium-mobile --project=webkit-mobile`

## Devin Secrets Needed
- `GRINDFORM_ADMIN_EMAIL`, `GRINDFORM_ADMIN_PASSWORD` (org-scoped) — bootstrap admin
  login for admin-console testing. Not needed for non-admin flows.
