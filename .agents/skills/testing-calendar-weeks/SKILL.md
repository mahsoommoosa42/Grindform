---
name: testing-calendar-weeks
description: Test Grindform's calendar week tagging, default plan carry-forward, and week navigation end-to-end in the browser. Use when verifying week assignments, default plans, the Calendar view, or "My week" navigation/persistence changes.
---

# Testing Grindform calendar weeks / default plan carry-forward

## Run the app locally
Same setup as `testing-auth-admin-gdpr` (build client, start `packages/web/src/server.ts` with `GRINDFORM_DATA_DIR=memory GRINDFORM_INSECURE_COOKIES=1 GRINDFORM_TEST_HOOKS=1 PORT=3000`). Register a throwaway user; email verification is NOT required for plan/calendar features (the red banner stays but doesn't block).

## Feature model
- Plans are weekday templates; a `week_assignments` row (unique per user+week) tags a plan to a specific ISO week. `week_start` must be a **Monday** in `YYYY-MM-DD` (enforced by `WeekStartSchema` and a DB CHECK).
- Each user can have at most one **default plan** (`plans.is_default`); weeks without an explicit tag resolve to it.
- Generating a plan auto-tags it to the current week and (if it's the user's first plan) sets it as default.
- API: `GET/PUT/DELETE /v1/weeks/:weekStart`, `GET /v1/weeks?from&to`, `PUT/DELETE /v1/plans/:planId/default`.

## UI landmarks
- **My week** header: plan title, week range (e.g. "Mon 6 – Sun 12 Jul"), a source badge ("Tagged to this week" vs "Default plan"), and ← / → week navigation arrows (top-right, near "Boredom swap").
- **Calendar** nav tab: 13-week list (±6 weeks around current). Each row: week range, resolved plan + "· tagged" / "· default" / "No plan", a "Tag a plan…" `<select>`, and an **Untag** button on tagged rows. Below: "Your plans" section with a **Set as default** / **Clear default** toggle per plan.
- With no tag and no default for a week, "My week" is disabled and the app shows the Build (generator) view — that's the expected empty state, not a bug.

## Golden-path test sequence (all verified passing once)
1. Register → generate plan → badge "Tagged to this week" + current week range.
2. Reload → lands on My week with the plan (persistence).
3. → arrow → next week shows "Default plan" badge; ← returns to "Tagged to this week".
4. Calendar tab → current week "tagged" w/ Untag, other weeks "default".
5. Tag next week via select → row flips to "tagged"; Untag reverts it.
6. "Clear default" → untagged weeks show "No plan"; navigating there falls back to the generator.

## Gotchas
- The ←/→ arrows sit near the top of the week view; after scrolling down, scroll back up before clicking or you may hit another element.
- Native `<select>` dropdowns need two clicks (open, then option) via computer-use; the calendar row selects reset to "Tag a plan…" after the request completes.
- Week math is UTC ISO-week based — assertions on the displayed range should be computed from the current date's Monday, not hardcoded.

## Devin Secrets Needed
None — local server with throwaway accounts.
