# dash — Money Math & Label-vs-Value Audit

> **Provenance:** started in the "Fable" Claude Code session (`claude-fable-5`) on 2026-08-11 as a
> 10-agent audit; that session hit its usage limit and only the revenue-semantics ground-truth pass
> survived. This session **re-ran the 9 killed auditors** (Opus, adversarially verified against the
> prod DB) and merged the results. Audit is now **complete**.
>
> Verdict counts: **4 distinct confirmed wrong-number defects** · a cluster of **label/convention
> inconsistencies** (need a ruling on intended basis) · a few **edge-case + latent** items · **3
> refuted** (real test-coverage gaps, but the production code is correct).

---

## Part 1 — Confirmed defects (a number is actually wrong)

### 🔴 A. milesPerMonth diluted by dead calendar time → inflates cost-to-run
`truckMetrics.ts:138-141` (and identical `trailerMetrics.ts:68-71`). `milesPerMonth = totalMiles ÷
monthsInService`, where `monthsInService` runs from the **raw `in_service_date`** — but `totalMiles`
only counts earned loads, and the same function already computes a `windowStart` (later of in-service
and first load) precisely to exclude pre-tracking months. milesPerMonth ignores that window.

**Prod truck 580991:** in-service 2025-06-11, but the first load in dash is 2026-01-06 (a genuine
7-month zero-load gap — dash tracking started ~Jan 2026). So milesPerMonth = 50,031 ÷ 14.0 mo =
**3,574**, when the true operating pace (~7.1 mo) is **~7,017** — understated ~49%.

**This is the note-per-mile in the cost-to-run I shipped (v1.138.2/v1.139.0).** notePerMile =
assetNote ÷ milesPerMonth = 1,805 ÷ 3,574 = **$0.50/mi**, but should be 1,805 ÷ 7,017 = **~$0.26/mi**.
So the $0.90 all-in cost-to-run I verified with you is inflated by ~$0.25/mi — the honest number is
**~$0.65/mi**. Maintenance ETAs also run at ~half pace (service dates pushed out). **I own this one —
I verified the note arithmetic but not milesPerMonth itself.** Fix: divide by the operating window
(windowStart→now), the same span utilization uses.

### 🔴 B. "Next settlement" shows GROSS, labeled as what lands (NET)
`PulseTab.tsx:141-142,242,375`. The "Next settlement · $X landing" figure sums the **GROSS**
`loadRevenue` (from `metrics/loads.ts`). A Landstar settlement deposits your **NET** keep. Prod: the one
delivered-unpaid load is linehaul $5,735 + FSC $333 → actual deposit **$4,519**, but the card shows the
gross **$6,068** — overstated ~34%. The correct `net_revenue` is already on the load object.
**Note:** the MoneyTab "Settlement pipeline" tile has the same construction — worth fixing together.

### 🔴 C. "BEST ORIGIN" ranks on linehaul-only $/mi, not gross
`lanes.ts:508` (`getOriginStateRollup`), rendered `OriginMarkets.tsx:57`. Crowns the best origin on
`linehaul ÷ loaded miles`, dropping FSC + accessorials — while every sibling on the Lanes page uses
GROSS. Understates each origin's $/mi by 3.6% (GA) up to 24.3% (OH), and can crown the wrong "best."
Because oversize carries heavy tarp/permit accessorials, the linehaul-only view distorts your specialty
lanes the most. (Softer sibling: `lanes.ts:477` `getWindowTotals.blendedRpm`, same linehaul-only basis
on the Lanes answering line — but there the dollar total is explicitly labeled "linehaul.")

### 🔴 D. "Am I covering the month" races GROSS against a NET threshold
`monthCoverage.ts:3,62`. Its month-to-date income estimate imports the **GROSS** `loadRevenue` (from
`./loads`) but compares it against a NET-basis true-cost threshold — so before the P&L posts, it
systematically **overstates** coverage. The code's own comment says it should be "the same money-kept
basis the P&L uses" (NET), and its sibling `dashboard.getRevenueMTD` correctly uses the NET helper.
(Its test never sets `net_revenue`, so it can't catch this — see Part 4.)

---

## Part 2 — Label/convention inconsistencies — RESOLVED (v1.171.2, all ruled GROSS)

Jason ruled **gross** on all three: hauled figures, the best-week record, and avgRpm are now gross
(market value / booking rate); best-week is gross **delivered-only** to match the dashboard. Convention:
**hauled / records / RPM = GROSS; take-home / income / settlement / margin = NET.** Original findings kept
below for the record.

These rendered a real number under a word that implied the *other* basis:

- **Recap "HAULED" tile** (`RecapPoster.tsx:152` / `recap.ts:~140`) shows **NET**, but "hauled" reads
  as gross freight moved.
- **Award ceremony "$X hauled"** (`awards.ts:81`) — same: NET under a gross word.
- **"Best week" record** (`PulseTab.tsx:171` vs player card / award pops) — **GROSS on the dashboard,
  NET on the card**: the same record shown ~27% apart in two places.
- **`avgRpm`** (`playerCard.ts:131`) — documented "gross ÷ loaded mile" but computed from **NET**;
  surfaced as "Avg RPM."
- **Recap "BEST WEEK / BEST STREAK"** (`recap.ts:210`) computed on **committed** freight (booked +
  in-transit), while the rest of the poster is delivered-only — a record can count freight never hauled.

*(Root cause of this whole class: the two `loadRevenue` functions with opposite meaning — `loads.ts`
= GROSS, `rateTargets.ts` = NET. Every call site is a coin-flip until you check the import.)*

---

## Part 3 — Edge cases + latent/hardening

**FIXED (v1.171.3, PR #412):**
- ✅ **Odometer `total` miles no `end > start` guard** (`rateTargets.ts`, `ExpensesPage.tsx`): now
  `Math.max(0, end-start)` — a reversed/equal reading contributes 0, not a negative that shrinks the
  driven-mile denominator and inflates cost-per-total-mile → the rate ladder. getCostBasis test added.
- ✅ **Load-grade used the deadhead *estimate*** (`LoadDetailPage.tsx`): booked-grade now scores on the
  odometer window's ACTUAL empty miles, falling back to `deadhead_miles` only until the window exists —
  honors "odometer is truth."
- ✅ **"Year to date" chart plots all months** (`ExpenseYtdChart.tsx`): caption "year to date" → "by month."

**PULLED before merge (deferred):**
- ⏸ **Detention across a midnight appointment window** (`detention.ts:55`, minor): window-end < start
  isn't wrapped. A crossing-window rewrite was drafted for v1.171.3 but **the pre-merge review caught it
  mis-charging an early pre-window arrival** — `("21:00","01:00","22:00","02:00",3)` read 1200 min vs 0 —
  plus a null-arrival regression, so it was reverted. The honest fix needs arrival **dates** the data
  doesn't carry (the window is day-blind). `onTimeStatus` (`:28`) shares the blind spot. Dormant: 0
  crossing windows on prod today.

**Still deferred (backlog):**
- **UTC "this month" rolls early** (`dashboard.ts:17`, minor): the MTD/YTD tiles pick the current
  month/year from UTC `now`, so they flip a period early on a US-evening (same class as the per-diem
  timezone bug already fixed). ~8 sites — its own tz pass.
- **Latent tz hardening** (`rateTargets.ts:112`, `pool.js:4`, info): month bucketing is correct only
  because prod runs in UTC; no pg date type-parser override. Defensive, not a live bug. High blast radius.
- **`net_revenue` COALESCE fallback** (`loadServices.js:56`, info): net silently equals gross when the
  `settlement_schedules` join misses. **Not firing on your data** (schedule present), but it fails quiet
  instead of loud. Diagnostic: payTake == 0.76 confirms it's not firing.

---

## Part 4 — Refuted (adversarial verify said "not a bug")

All three are **real test-coverage gaps** — the fixtures leave `net_revenue` unset so the tests can't
tell gross from net — but the production code they point at is **correct**, so they're test-hardening,
not defects:
- `truckMetrics.test.ts:122` — net-revenue assertion runs on the gross fallback.
- `trailerMetrics` "no test" — actually covered in `trailerAwards.test.ts` (`describe computeTrailerMetrics`).
- `rateTargets.test.ts:102` — `payTake` never asserted; fixtures make it 1.0.

Worth hardening (add a fixture with `net_revenue` < gross), but nothing computes wrong today.

---

## Fixed in this pass (v1.171.1 — SHIPPED, PR #410)

- **LoadsPage footer** (`LoadsPage.tsx`): `viewNet` (a GROSS sum) labeled "net" → renamed `viewGross`,
  relabeled "gross." *(Fable's PRIMARY finding.)*
- **A — milesPerMonth** (`truckMetrics.ts`, `trailerMetrics.ts`): now paced over the operating window
  (first load → now), not raw in-service calendar time. Truck 580991: 3,574 → **7,018 mi/mo**; cost-to-run
  **$0.90 → ~$0.66/mi**. Regression test added.
- **B — settlement pipeline** (`PulseTab.tsx`): "Next settlement · $X landing" now sums **NET** (what
  Landstar deposits), not gross — $6,068 → **$4,519** on current data.
- **C — best origin** (`lanes.ts` `getOriginStateRollup`): ranks/rates on **GROSS** (linehaul + FSC +
  accessorials) to match every other $/mi on the Lanes page.
- **D — month coverage** (`monthCoverage.ts`): MTD income estimate now uses the **NET** helper, matching
  the P&L / cost threshold it races.

---

## Reference — gross/net semantics map

*(unchanged from Fable's ground-truth pass — see the field/function table for what every money field
means and where the two `loadRevenue` functions diverge.)*
