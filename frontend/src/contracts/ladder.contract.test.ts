// THE RATE TO BOOK AND EVERYTHING BUILT ON IT — computeRateTargets on the
// synthetic book (May–Oct 2026 filed, TODAY = Wed 2026-11-04).
//
// Locked rules: BASIS-01 · 03 · 04 · 05 · 06 · 08 · 09 · 10 · 11, NET-09,
// SCORE-01, DAY-03, MKT-05/06. A red test here means a business rule moved:
// the PR body must say "Rule change: <id> — <why>".
import { describe, it, expect } from "vitest";
import { syntheticBook, TODAY, type Book } from "@/test/fixtures/book";
import { BASIS_MONTHS } from "@/lib/constants/targets";
import { computeRateTargets, getCostBasis, monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { classify, quarterWeekVerdicts } from "@/lib/metrics/grind";
import { computeRecap, rangeFor } from "@/lib/metrics/recap";
import { monthCoverage } from "@/lib/metrics/monthCoverage";
import { scoreLoad } from "@/lib/metrics/loadScore";
import { gradeCostsOf } from "@/lib/metrics/marketFactor";
import { perDayTone } from "@/lib/metrics/perDay";

const now = new Date(`${TODAY}T00:00:00Z`);

// The basis the pages stand on: loads AND the trip log (BASIS-07, 2026-11-07 —
// home and shop miles join the odometer union; Jason's call of Nov 5).
const targetsOf = (book: Book, trips = book.trips) =>
  computeRateTargets(book.loads, book.periods, monthlyObligationCost(book.obligations), book.schedule, now, trips);

describe("BASIS-01/03/08/09/10 · NET-09 · the ladder's golden numbers (six months, May–Oct ’26)", () => {
  const book = syntheticBook();
  const t = targetsOf(book);

  it("stands on six complete filed months, current month excluded", () => {
    expect(BASIS_MONTHS).toBe(6);
    expect(t.ready).toBe(true);
    expect(t.basis.months).toBe(6);
    expect(t.basis.monthsWanted).toBe(6);
    expect(t.basis.windowLabel).toBe("May–Oct ’26");
    expect(t.basis.missingLabel).toBeNull();
  });

  it("BASIS-03 · true cost = P&L cogs + expenses + the counted obligations, 6 × the Truck Note's $1,200", () => {
    // derived: only the Truck Note counts (active, not a draw, not on_pl) = 1,200/mo.
    expect(monthlyObligationCost(book.obligations)).toBe(1200);
    // derived: Σ(cogs_total + expense_total) May–Oct = 71,080.01; + 6 × 1,200 = 78,280.01; ÷ 6 months
    expect(t.basis.trueMonthlyCost).toBeCloseTo(13046.67, 2);
  });

  it("BASIS-01/03 · cost per driven mile = Σ true cost ÷ Σ total miles", () => {
    // derived: 78,280.01 ÷ 20,742 mi = 3.77399 — the 31 loads delivered May–Oct span 20,177 mi as a
    // union, plus the one logged home trip (Aug 11, 511,469 → 512,034 = 565 mi) that sits between two
    // loads and so adds its miles once (BASIS-07).
    const sumCost = book.periods.reduce((s, p) => s + (p.cogs_total as number) + (p.expense_total as number), 0) + 6 * 1200;
    const window = book.loads.filter(
      (l) => l.load_status === "delivered" && String(l.delivery_date) >= "2026-05-01" && String(l.delivery_date) < "2026-11-01",
    );
    const loadMiles = window.reduce((s, l) => s + ((l.odometer_end as number) - (l.odometer_start as number)), 0);
    const tripMiles = book.trips
      .filter((tr) => String(tr.trip_date) >= "2026-05-01" && String(tr.trip_date) < "2026-11-01")
      .reduce((s, tr) => s + ((tr.odometer_end as number) - (tr.odometer_start as number)), 0);
    const sumMiles = loadMiles + tripMiles;
    expect(window).toHaveLength(31);
    expect(loadMiles).toBe(20177);
    expect(tripMiles).toBe(565);
    expect(t.basis.totalMiles).toBe(20742);
    expect(sumCost / sumMiles).toBeCloseTo(t.basis.costPerTotalMile as number, 10);
    expect(t.basis.costPerTotalMile).toBeCloseTo(3.774, 4);
  });

  it("NET-09 · the keep is Σnet ÷ Σgross over the basis window's delivered loads", () => {
    // derived: Σnet 92,909.75 ÷ Σgross 122,405.00 = 0.759036
    const window = book.loads.filter(
      (l) => l.load_status === "delivered" && String(l.delivery_date) >= "2026-05-01" && String(l.delivery_date) < "2026-11-01",
    );
    const net = window.reduce((s, l) => s + Number(l.net_revenue), 0);
    const gross = window.reduce((s, l) => s + Number(l.gross_revenue), 0);
    expect(net).toBeCloseTo(92909.75, 2);
    expect(gross).toBeCloseTo(122405, 2);
    expect(t.keepSource).toBe("blended");
    expect(t.keep).toBeCloseTo(net / gross, 10);
    expect(t.keep).toBeCloseTo(0.759, 3);
    expect(t.keep).toBeCloseTo(0.75904, 4);
  });

  it("BASIS-08 · your gross rate per driven mile (the ladder's marker) = Σgross ÷ Σtotal miles", () => {
    // derived: 122,405 ÷ 20,742 = 5.90131 (trips earn nothing, so the gross rate per mile driven falls with them)
    expect(t.grossRate).toBeCloseTo(5.9013, 4);
  });

  it("BASIS-07 · home and shop trips count in the basis: the book's one home trip adds its 565 mi once, and the cost per mile falls with it", () => {
    const loadsOnly = targetsOf(book, []);
    expect(loadsOnly.basis.totalMiles).toBe(20177);
    expect(loadsOnly.basis.costPerTotalMile).toBeCloseTo(3.8797, 4); // the pre-4e basis, loads alone
    expect(t.basis.totalMiles - loadsOnly.basis.totalMiles).toBe(565);
    expect(t.basis.costPerTotalMile).toBeLessThan(loadsOnly.basis.costPerTotalMile as number);
    expect(t.basis.trueMonthlyCost).toBeCloseTo(loadsOnly.basis.trueMonthlyCost as number, 6); // the dollars don't move
    expect(t.keep).toBeCloseTo(loadsOnly.keep, 10); // nor the keep — trips earn nothing and bill nothing
    // a trip inside a load's window adds nothing: the union, not a sum
    const inside = { ...book.trips[0], odometer_start: book.loads[0].odometer_start as number, odometer_end: (book.loads[0].odometer_start as number) + 10, trip_date: book.loads[0].delivery_date as string };
    expect(targetsOf(book, [inside]).basis.totalMiles).toBe(20177);
  });

  it("BASIS-08/09 · the Standard ladder: walk-away = cost per driven mile ÷ keep, rungs = walkAway × (1 + tier)", () => {
    // derived: walkAway = 3.77399 ÷ 0.759036 = 4.97208; tiers .10 / .20 / .30
    const L = t.bookingLadder;
    expect(L.walkAway).toBeCloseTo(4.9721, 4);
    expect(L.minimum).toBeCloseTo(5.4693, 4); // derived: 4.97208 × 1.10
    expect(L.target).toBeCloseTo(5.9665, 4); // derived: 4.97208 × 1.20
    expect(L.strong).toBeCloseTo(6.4637, 4); // derived: 4.97208 × 1.30
    expect(L.walkAway).toBeCloseTo((t.basis.costPerTotalMile as number) / t.keep, 10);
    expect(t.tiers).toEqual({ minimum: 0.1, target: 0.2, strong: 0.3 });
  });

  it("BASIS-09 · the Specialized ladder: same walk-away, tiers .35 / .45 / .60", () => {
    const S = t.specLadder;
    expect(S.walkAway).toBeCloseTo(4.9721, 4);
    expect(S.minimum).toBeCloseTo(6.7123, 4); // derived: 4.97208 × 1.35
    expect(S.target).toBeCloseTo(7.2095, 4); // derived: 4.97208 × 1.45
    expect(S.strong).toBeCloseTo(7.9553, 4); // derived: 4.97208 × 1.60
    expect(t.specTiers).toEqual({ minimum: 0.35, target: 0.45, strong: 0.6 });
  });

  it("BASIS-10 · weekly break-even and target (gross): cost ÷ keep ÷ (52/12), then ÷ (1 − margin goal)", () => {
    // derived: 13,046.67 ÷ 0.759036 = 17,188.6/mo; ÷ 4.3333 = 3,966.57/wk; margin goal 0.26 → ÷ 0.74 = 5,360.23/wk
    expect(t.marginGoal).toBe(0.26);
    expect(t.gross.weeklyBreakEven).toBeCloseTo(3966.57, 2);
    expect(t.gross.weeklyTarget).toBeCloseTo(5360.23, 2);
    expect((t.gross.weeklyTarget as number) * (1 - 0.26)).toBeCloseTo(t.gross.weeklyBreakEven as number, 8);
  });

  it("BASIS-10 · the day bars: working days (÷ 22) and calendar days (÷ 365/12)", () => {
    // derived: 17,188.6 ÷ 22 = 781.29 · × 1/0.74 = 1,055.80 · ÷ 30.4167 = 565.10 · × 1/0.74 = 763.65
    expect(t.gross.dailyBreakEven).toBeCloseTo(781.29, 2);
    expect(t.gross.dailyTarget).toBeCloseTo(1055.8, 2);
    expect(t.gross.dailyBreakEvenCalendar).toBeCloseTo(565.1, 2);
    expect(t.gross.dailyTargetCalendar).toBeCloseTo(763.65, 2);
  });
});

describe("BASIS-05 · on_pl obligations never join break-even", () => {
  const base = targetsOf(syntheticBook());

  it("the book carries an active on_pl insurance row, and it is not in the counted sum", () => {
    const row = syntheticBook().obligations.find((o) => o.on_pl && o.active);
    expect(row?.label).toBe("Truck Insurance");
    expect(monthlyObligationCost(syntheticBook().obligations)).toBe(1200);
  });

  it("doubling its amount leaves the cost per mile unchanged to the cent", () => {
    const book = syntheticBook();
    const row = book.obligations.find((o) => o.on_pl && o.active);
    expect(row).toBeDefined();
    if (row) row.amount = row.amount * 2;
    const t = targetsOf(book);
    expect(t.basis.costPerTotalMile).toBeCloseTo(base.basis.costPerTotalMile as number, 2);
    expect(t.bookingLadder.walkAway).toBeCloseTo(base.bookingLadder.walkAway as number, 2);
  });

  it("removing it leaves the cost per mile unchanged to the cent", () => {
    const book = syntheticBook();
    book.obligations = book.obligations.filter((o) => !o.on_pl);
    const t = targetsOf(book);
    expect(t.basis.costPerTotalMile).toBeCloseTo(base.basis.costPerTotalMile as number, 2);
  });

  it("control: a counted obligation DOES move it (the filter is the only thing keeping insurance out)", () => {
    const book = syntheticBook();
    const note = book.obligations.find((o) => o.obligation_id === "obl-truck-note");
    if (note) note.amount = note.amount + 600;
    // derived: +600/mo × 6 months ÷ 20,742 mi (loads + the home trip) = +0.1736 per driven mile
    expect(targetsOf(book).basis.costPerTotalMile).toBeCloseTo((base.basis.costPerTotalMile as number) + (600 * 6) / 20742, 4);
  });
});

describe("BASIS-04 · a draw is never cost", () => {
  const base = targetsOf(syntheticBook());

  it("doubling the owner distribution leaves the cost per mile unchanged to the cent", () => {
    const book = syntheticBook();
    const draw = book.obligations.find((o) => o.is_draw);
    expect(draw?.active).toBe(true);
    if (draw) draw.amount = draw.amount * 2;
    expect(targetsOf(book).basis.costPerTotalMile).toBeCloseTo(base.basis.costPerTotalMile as number, 2);
  });

  it("removing it, and the inactive trailer lease, leaves the cost per mile unchanged to the cent", () => {
    const book = syntheticBook();
    book.obligations = book.obligations.filter((o) => !o.is_draw && o.active);
    expect(targetsOf(book).basis.costPerTotalMile).toBeCloseTo(base.basis.costPerTotalMile as number, 2);
  });

  it("an inactive obligation is excluded: reviving it WOULD move the figure", () => {
    const book = syntheticBook();
    const old = book.obligations.find((o) => !o.active);
    if (old) old.active = true;
    // derived: +300/mo × 6 ÷ 20,742 mi = +0.0868 per driven mile
    expect(targetsOf(book).basis.costPerTotalMile).toBeCloseTo((base.basis.costPerTotalMile as number) + (300 * 6) / 20742, 4);
  });
});

describe("BASIS-06 · a reversed or equal odometer window contributes zero miles, never a negative", () => {
  it("zeroing one load's window removes exactly its span from the basis", () => {
    const book = syntheticBook();
    const base = targetsOf(book);
    const load = book.loads.find((l) => l.load_number === "9100010");
    expect(load).toBeDefined();
    if (!load) return;
    const span = (load.odometer_end as number) - (load.odometer_start as number);
    load.odometer_end = load.odometer_start; // an equal reading is no span at all
    const t = targetsOf(book);
    expect(t.basis.totalMiles).toBe((base.basis.totalMiles as number) - span);
  });
});

describe("BASIS-11 · every surface reads ONE basis", () => {
  const book = syntheticBook();
  const obl = monthlyObligationCost(book.obligations);
  const t = targetsOf(book);

  it("getCostBasis called WITHOUT a monthsBack argument equals the explicit BASIS_MONTHS window", () => {
    // note: the code deliberately defaults to BASIS_MONTHS since v1.241.0 — that default is what this locks.
    const implicit = getCostBasis(book.periods, obl, book.loads, now);
    const explicit = getCostBasis(book.periods, obl, book.loads, now, BASIS_MONTHS);
    expect(implicit).toEqual(explicit);
    expect(implicit.monthsWanted).toBe(6);
    expect(implicit.months).toBe(6);
    // the same basis the ladder stands on, loads alone here (no trips passed to either call)
    expect(implicit.costPerTotalMile).toBeCloseTo(targetsOf(book, []).basis.costPerTotalMile as number, 10);
  });

  it("the weeks-over-break-even stat grades the quarter's completed weeks against the ladder's own floor and target", () => {
    // Re-derive by hand: every completed pay week (Wednesday start) that began
    // inside TODAY's calendar quarter, its delivered gross, graded against
    // t.gross — the engine must agree on every count.
    const q = quarterWeekVerdicts(book.loads, t.gross, now);
    const WEEK_MS = 7 * 86400000;
    const qStart = Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1);
    const wed = (ms: number): number => {
      const x = new Date(ms);
      return x.getTime() - ((x.getUTCDay() - 3 + 7) % 7) * 86400000;
    };
    const thisWeek = wed(now.getTime());
    let counted = 0, overFloor = 0, atTarget = 0, home = 0;
    for (let ms = wed(qStart); ms < thisWeek; ms += WEEK_MS) {
      if (ms < qStart) continue;
      const lo = new Date(ms).toISOString().slice(0, 10);
      const hi = new Date(ms + WEEK_MS).toISOString().slice(0, 10);
      const earned = book.loads
        .filter((l) => l.load_status === "delivered" && String(l.delivery_date) >= lo && String(l.delivery_date) < hi)
        .reduce((s, l) => s + Number(l.gross_revenue), 0);
      if (earned <= 0) { home++; continue; }
      counted++;
      const v = classify(earned, t.gross);
      if (v === "target") { atTarget++; overFloor++; } else if (v === "breakeven") overFloor++;
    }
    expect(q.hasBars).toBe(true);
    expect(q).toMatchObject({ counted, overFloor, atTarget, home });
    // and the bars ARE the ladder's: the target grades as a target week, the floor as break-even, a dollar under as below
    expect(classify(t.gross.weeklyTarget as number, t.gross)).toBe("target");
    expect(classify(t.gross.weeklyBreakEven as number, t.gross)).toBe("breakeven");
    expect(classify((t.gross.weeklyBreakEven as number) - 1, t.gross)).toBe("below");
  });

  it("the month-coverage plate stands on the same window and the same monthly cost", () => {
    const cov = monthCoverage(book.periods, obl, book.loads, now);
    expect(cov.windowLabel).toBe(t.basis.windowLabel);
    expect(cov.monthsInMean).toBe(t.basis.months);
    expect(cov.monthsWanted).toBe(BASIS_MONTHS);
    expect(cov.threshold).toBeCloseTo(t.basis.trueMonthlyCost as number, 8);
  });

  it("the recap grades its weeks against the ladder's weekly gross target (same streak as a re-grade on computeRateTargets)", () => {
    // The recap exposes no target field, only the streak it grades with it, so
    // the check is: its best streak equals the streak of the same weeks graded
    // against t.gross (the shared six-month basis).
    const range = rangeFor("year", 2026, 0);
    const recap = computeRecap(book.loads, book.fuel, book.periods, obl, range, "year", now, book.schedule);
    const WEEK_MS = 7 * 86400000;
    const wed = (d: Date): number => {
      const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      return x.getTime() - ((x.getUTCDay() - 3 + 7) % 7) * 86400000;
    };
    const target = t.gross.weeklyTarget as number;
    let best = 0;
    let run = 0;
    for (let ms = wed(range.start); ms < range.end.getTime(); ms += WEEK_MS) {
      if (ms < range.start.getTime()) continue;
      const lo = new Date(ms).toISOString().slice(0, 10);
      const hi = new Date(ms + WEEK_MS).toISOString().slice(0, 10);
      const earned = book.loads
        .filter((l) => l.load_status === "delivered" && String(l.delivery_date) >= lo && String(l.delivery_date) < hi)
        .reduce((s, l) => s + Number(l.gross_revenue), 0);
      if (earned >= target) {
        run++;
        best = Math.max(best, run);
      } else if (earned > 0) run = 0; // a home week (no freight) neither extends nor breaks
    }
    expect(recap.bestStreak).toBe(best);
    expect(best).toBeGreaterThan(0); // the book has target-beating weeks, so the check is not vacuous
  });
});

describe("SCORE-01 · DAY-03 · MKT-05/06 · the Scorer, the ledger grades and $/day tone read the same rungs", () => {
  const book = syntheticBook();
  const t = targetsOf(book);

  it("scoreLoad on a book load reports a break-even equal to the ladder's walk-away", () => {
    const load = book.loads[0];
    const score = scoreLoad(
      {
        rate: Number(load.gross_revenue),
        loadedMiles: load.loaded_miles,
        deadheadMiles: (load.odometer_end as number) - (load.odometer_start as number) - load.loaded_miles,
      },
      { costPerDrivenMile: t.basis.costPerTotalMile, payTake: t.basis.payTake },
    );
    expect(score.breakevenRpm).toBeCloseTo(t.bookingLadder.walkAway as number, 10);
    expect(score.breakevenRpm).toBeCloseTo(4.9721, 4); // the trip-inclusive walk-away (BASIS-07)
  });

  it("gradeCostsOf(targets) carries the ladder's calendar-day bars and the same cost per driven mile", () => {
    const costs = gradeCostsOf(t);
    expect(costs.dayTarget).toBeCloseTo(t.gross.dailyTargetCalendar as number, 10);
    expect(costs.dayBreakEven).toBeCloseTo(t.gross.dailyBreakEvenCalendar as number, 10);
    expect(costs.perMile).toBeCloseTo(t.basis.costPerTotalMile as number, 10);
    expect(costs.marginGoal).toBe(t.marginGoal);
  });

  it("DAY-03 · $/day tone is judged against those same calendar-day bars", () => {
    const target = t.gross.dailyTargetCalendar as number;
    const floor = t.gross.dailyBreakEvenCalendar as number;
    expect(perDayTone(target, t.gross)).toBe("good");
    expect(perDayTone(floor, t.gross)).toBe("warn");
    expect(perDayTone(floor - 0.01, t.gross)).toBe("bad");
  });
});
