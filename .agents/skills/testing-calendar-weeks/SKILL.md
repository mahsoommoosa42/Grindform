---
name: testing-calendar-weeks
description: Test Grindform's calendar week tagging, default plan carry-forward, multi-week programs / break weeks, and week navigation end-to-end in the browser. Use when verifying week assignments, default plans, training programs, break weeks, the Calendar view, or "My week" navigation/persistence changes.
---

# Testing Grindform calendar weeks / default plan carry-forward

## Run the app locally
Same setup as `testing-auth-admin-gdpr` (build client, start `packages/web/src/server.ts` with `GRINDFORM_DATA_DIR=memory GRINDFORM_INSECURE_COOKIES=1 GRINDFORM_TEST_HOOKS=1 PORT=3000`). Register a throwaway user; email verification is NOT required for plan/calendar features (the red banner stays but doesn't block).

`bun` may not be on `PATH` in a fresh session even though the blueprint uses it. Try `export PATH="$HOME/.bun/bin:$PATH"` first; if that's missing too, look for a cached binary (e.g. `ls /home/ubuntu/.npm/_npx/*/node_modules/.bin/bun`) and prepend its directory. After a VM restart the dev server is gone — `curl -s -o /dev/null -w '%{http_code}' localhost:3000` returning `000` just means it needs starting again.

## Feature model
- Plans are weekday templates; a `week_assignments` row (unique per user+week) tags a plan to a specific ISO week. `week_start` must be a **Monday** in `YYYY-MM-DD` (enforced by `WeekStartSchema` and a DB CHECK).
- Each user can have at most one **default plan** (`plans.is_default`); weeks without an explicit tag resolve to it.
- Generating a plan auto-tags it to the current week and (if it's the user's first plan) sets it as default.
- API: `GET/PUT/DELETE /v1/weeks/:weekStart`, `GET /v1/weeks?from&to`, `PUT/DELETE /v1/plans/:planId/default`.

## UI landmarks
- **My week** header: plan title, week range (e.g. "Mon 6 – Sun 12 Jul"), a source badge ("Tagged to this week" vs "Default plan"), and ← / → week navigation arrows (top-right, near "Boredom swap").
- **Calendar** nav tab: 13-week list (±6 weeks around current). Each row: week range, resolved plan + "· tagged" / "· default" / "No plan", a "Tag a plan…" `<select>`, and an **Untag** button on tagged rows. Below: "Your plans" section with a **Set as default** / **Clear default** toggle per plan.
- With no tag and no default for a week, "My week" is disabled and the app shows the Build (generator) view — that's the expected empty state, not a bug.

## Multi-week programs / break weeks
- Generator field `data-testid="program-weeks"` (1–16). `>1` calls `POST /v1/programs`, tags one plan per consecutive Monday and switches to the Calendar view; `1` keeps the old single-plan behaviour and lands on My week.
- Baseline curve: 100% then +5%/week, every 4th week a 60% deload → a 5-week program reads 100 / 105 / 110 / 60 / 100. Calendar rows expose `calendar-load-<weekStart>` (`"<pct>% · <kind>"`, optionally `· reduced after break`) and `calendar-break-<weekStart>` ("Mark break"/"Unmark break", current-and-future weeks only).
- Marking a break inserts a `Break · no plan` / `0% · break` row, shifts remaining weeks one week later and caps the return-to-training load ("reduced after break"). Unmarking restores the original percentages exactly.
- The load index really scales plan content: an 87% week prescribes 3 sets where a 100% week prescribes 4 — a good corroborating assertion beyond the label.
- A break week in My week must render the "Break week / This week is scheduled as a break." panel and must NOT fall back to the default plan. Test this **with a default plan set**, otherwise the assertion is vacuous.
- Watch out: the replan path deletes and re-creates the program's future plans, which historically cleared `plans.is_default` (fixed in `37453a8` by re-applying the flag to the replacement plan for the same progression week). After any mark/unmark, re-check Calendar → "Your plans" still shows "Clear default" and non-program weeks still say "· default" — this is a cheap, high-value regression check.
- Reactivity gotcha: `weeks` / `calendarPrograms` were once declared but missing from Lit's `static properties`, so the "Generate N-week program" button label went stale (fixed in `37453a8`). Any new component field that only drives a label can regress the same way — verify labels visually, not just behaviour.
- Breaks **accumulate**: the mark endpoint replans with `existing breaks + the new one`, and unmark filters out only the selected week. Marking a second break must not drop the first — worth asserting explicitly, plus a reload.
- A break on the **current** week is allowed (the button renders when `week >= currentWeek`). After marking it, "My week" nav becomes disabled and the current week renders the Break week panel.
- Two closely-spaced breaks compound the return-to-training cap and can drive a later week to `0% · train` while the plan still prescribes 1×6–8 sets (set counts round up to a minimum of 1). If you see `0%` on a `train` row, open that week in My week before calling it an empty week — the label is misleading rather than the data being lost.
- Program deletion: `deleteProgram` exists in `packages/web/src/client/api.ts` and `DELETE /v1/programs/:id` exists server-side, but **no UI control invokes it** (checked calendar rows, "Your plans", account menu). Report it as untestable via UI rather than driving the endpoint by hand.

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
- The Build form is tall: zoom out (`ctrl+minus` ~4–5 steps) so the `program-weeks` field and the submit button are visible together — otherwise you can't see the label change in the same screenshot.
- The Calendar list only spans ±6 weeks around today, so a program longer than ~7 weeks cannot be fully verified in the UI; assert the visible window follows the curve instead.
- Switching to Calendar does **not** reset the My week cursor — after navigating forward, "My week" still shows the week you left off on. Click ← back to the current week before asserting current-week behaviour (the nav item is disabled exactly when you're on the current week).
- For phone-width checks, Chrome refuses window widths below ~532px, so resizing the window is not enough — use the DevTools device toolbar (390×844 / 400×982 work well) and corroborate with `document.documentElement.scrollWidth <= innerWidth`.
- **Marking/unmarking a break silently reverts manual exercise edits** on program weeks, and the open week view keeps rendering the stale edited state. The client's cached plan id is now dead, so the next ✕/↻ click fails with a red `plan not found` banner. Always hard-reload after a replan before trusting what the week view shows, and never interleave slot edits with break marking when you are trying to attribute a change. (`persistProgramFuture` deletes and re-creates program plans — the same path that once dropped the default flag.)
- Corollary for any persistence test: verify reload-persistence *in isolation* first. An edit that vanishes after "edit → mark break → reload" is the replan's doing, not a persistence bug.

## Warm-up / cool-down drill recommendations (week view)
Generated training sessions render read-only drills inside the warm-up and cool-down blocks
(`<ul class="recommendations" aria-label="Recommended drills">`, left accent border, no ↻/✕ controls).
The tracker view deliberately renders none of them.

**The rule changed.** An earlier version derived the drill *count* from block minutes
(`floor(minutes/3)` clamped 1–4); that PR was rejected and closed. The current rule is lift-volume based —
if you see a minute-derived count, you are on an old branch.

- One warm-up drill per **distinct movement pattern**, one cool-down drill per **distinct primary muscle**,
  taken only from `main`/`accessory` blocks. Block minutes no longer cap the count at all; they only gate
  the `estMinutes <= 0` case (0 minutes ⇒ no drills). A 5m cool-down showing 3–5 drills is correct now, and
  is the cleanest proof the old cap is gone.
- **Dose scales with how many qualifying lifts share that pattern/muscle** (`n`):
  `sets` ⇒ `min(3, n) × reps` (**capped at 3**); `seconds` ⇒ `base + 15(n-1)`; `minutes` ⇒ `2 + (n-1)`.
  Only `sets` is capped. Best single assertion: find a card with two different set counts (e.g.
  `Hip hinge drill 3 × 8` beside `Reverse lunge 1 × 6 each side`), then add a 4th same-pattern lift and
  confirm it stays `3 × 8`.
- **Conditioning-role slots contribute nothing**, even sitting in an accessory block. So on a Lose fat day
  with a finisher there must be **no "Easy pulse raiser" and no "Easy walk"**. This inverts the old oracle —
  do not assert that a conditioning day *leads* with a pulse raiser.
  Role-conditioning slugs: `kettlebell-swing`, `dumbbell-thruster`, `burpee`, `rowing-intervals`,
  `farmer-carry`, `mountain-climber`. Note `dead-bug` is role **mobility**, and `kettlebell-swing` is a
  hinge pattern that still contributes nothing — both make good discriminating cases.
- Cool-down ordering puts the **focus-line muscles first**, then the rest in first-seen order. Compare the
  card's `Quads · Shoulders` header against the drill order.
- **Recommendations are derived on read** (`plansRepo.mapDay` → `mapSession`), so they always match the
  slots currently on the day and a hard reload recomputes them server-side. Editing slots with ✕ / ↻ /
  + Add exercise must move the doses immediately — removing one of two same-pattern lifts drops
  `2 × 8` → `1 × 8`, removing the last one deletes the row.
- **Deload trap — two filters disagree.** Recommendations exclude by catalog `role === 'conditioning'`, but
  `scaleTrainingSession` separately drops any slot with `scheme.repsHigh >= 18` when `loadIndex < 0.75`.
  `dead-bug` is mobility yet is prescribed `3 × 15–20` in Lose fat, so at the 60% deload it disappears and
  takes its `Dead bug` warm-up + `Cobra stretch` cool-down with it. Expect the deload drill set to be
  *unchanged* only on days with no high-rep non-conditioning slot; check Saturday-style core days explicitly
  rather than picking a day that happens to pass.
- Content-quality watch items: `seconds` doses are uncapped while `sets` cap at 3, so a heavily-worked muscle
  can reach `90 s each side` and a 5m cool-down can total ~5.75m of stretching. Also `Dead bug` can appear
  both as a prescribed accessory and as a recommended warm-up drill on the same card.
- Good specificity check: compare a hinge/lunge lower-body day (Hip hinge drill / Reverse lunge →
  Figure-four stretch) against a pressing day (Incline push-up / Dynamic arm circles → Doorway chest
  stretch). Identical lists across structurally different days would be the real failure.
- Overflow check at 390px: query inside the shadow root —
  `document.querySelector('gf-app').shadowRoot.querySelectorAll('.recommendation')` — and compare each
  `getBoundingClientRect().right` against `innerWidth`, plus `scrollWidth > clientWidth` for clipped reasons.

## Devin Secrets Needed
None — local server with throwaway accounts.
