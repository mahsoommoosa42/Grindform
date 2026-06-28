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

## Commands
- Build client: `bun run --filter '@grindform/web' build`
- Responsive e2e only, mobile engines:
  `cd packages/web && bunx playwright test responsive.spec.ts --project=chromium-mobile --project=webkit-mobile`

## Devin Secrets Needed
- `GRINDFORM_ADMIN_EMAIL`, `GRINDFORM_ADMIN_PASSWORD` (org-scoped) — bootstrap admin
  login for admin-console testing. Not needed for non-admin flows.
