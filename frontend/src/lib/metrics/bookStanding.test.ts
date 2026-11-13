import { describe, it, expect } from "vitest";
import type { RateLadder } from "./rateTargets";
import {
  bookStanding,
  carryingTheRate,
  deadheadLever,
  CARRIER_MIN_LOADS,
  rebaseBarometer,
  RUNG_ORDER,
  type BookLoad,
} from "./bookStanding";

// Jason's live rungs, 2026-11-12.
const STD: RateLadder = { breakEven: 4.0347, minimum: 4.7495, target: 5.0434, prime: 5.3782 };
const SPEC: RateLadder = { breakEven: 4.0347, minimum: 5.6042, target: 6.0238, prime: 6.508 };

/** A load at a given rate; driven/gross made consistent so the money is real. */
const at = (rpm: number, driven = 1000, loadType = "flatbed"): BookLoad => ({
  rpm,
  driven,
  gross: rpm * driven,
  loadType,
});

// His real last-90 shape: 10 standard — 3 below break-even, 3 between
// break-even and minimum, 2 minimum→target, 1 target→prime, 1 at prime.
const STD_BOOK = [
  at(3.2), at(3.6), at(3.9),
  at(4.1), at(4.4), at(4.7),
  at(4.8), at(4.95),
  at(5.1),
  at(6.0),
];
// 11 specialized — 3 below, 7 in the dead band, 1 at prime.
const SPEC_BOOK = [
  at(2.76), at(3.5), at(3.9),
  at(4.2), at(4.3), at(4.5), at(4.6), at(4.9), at(5.2), at(5.5),
  at(6.88),
];

describe("bookStanding", () => {
  it("counts every rung as 'at or above', inclusive on the rung itself", () => {
    const b = bookStanding([at(4.7495), at(4.7494)], STD);
    const min = b.hits.find((h) => h.rung === "minimum")!;
    expect(min.hit).toBe(1); // exactly on it counts; a hair under does not
    expect(min.of).toBe(2);
    expect(min.share).toBe(0.5);
  });

  it("REPRODUCES HIS BOOKS — level at break-even, four times apart at minimum", () => {
    const std = bookStanding(STD_BOOK, STD);
    const spec = bookStanding(SPEC_BOOK, SPEC);
    const share = (b: ReturnType<typeof bookStanding>, r: string) =>
      b.hits.find((h) => h.rung === r)!.share!;
    // break-even: 7 of 10 and 8 of 11 — all but a rounding apart
    expect(share(std, "breakEven")).toBeCloseTo(0.7, 2);
    expect(share(spec, "breakEven")).toBeCloseTo(0.727, 2);
    // minimum: 4 of 10 against 1 of 11 — the whole finding
    expect(std.clearsMinimum).toBe(4);
    expect(spec.clearsMinimum).toBe(1);
    expect(share(std, "minimum") / share(spec, "minimum")).toBeGreaterThan(4);
  });

  it("prices the gap to each book's own minimum", () => {
    const spec = bookStanding(SPEC_BOOK, SPEC);
    // 11 loads x 1,000 driven at $5.6042
    expect(spec.atMinimum).toBeCloseTo(61646.2, 1);
    expect(spec.booked).toBeCloseTo(SPEC_BOOK.reduce((s, l) => s + l.gross, 0), 6);
    expect(spec.shortBy).toBeCloseTo(spec.atMinimum! - spec.booked, 6);
    expect(spec.shortBy).toBeGreaterThan(0);
  });

  it("A BOOK ALREADY OVER ITS MINIMUM IS SHORT BY A NEGATIVE, NOT BY ZERO", () => {
    // LLL beat the oversize rung by $714. Clamping that to zero would make a
    // desk that out-earned the rung look merely adequate.
    const b = bookStanding([at(6.88)], SPEC);
    expect(b.shortBy).toBeLessThan(0);
  });

  it("an empty book answers null rather than zero", () => {
    const b = bookStanding([], STD);
    expect(b.loads).toBe(0);
    expect(b.median).toBeNull();
    expect(b.hits.every((h) => h.share === null)).toBe(true);
  });

  it("a half-built ladder prices what it can and drops the rest", () => {
    const partial: RateLadder = { breakEven: 4, minimum: null, target: 5, prime: null };
    const b = bookStanding([at(4.5)], partial);
    expect(b.hits.map((h) => h.rung)).toEqual(["breakEven", "target"]);
    expect(b.atMinimum).toBeNull();
    expect(b.shortBy).toBeNull();
  });

  it("the rungs come back in ladder order, worst to best", () => {
    const b = bookStanding([at(5)], STD);
    expect(b.hits.map((h) => h.rung)).toEqual([...RUNG_ORDER]);
    for (let i = 1; i < b.hits.length; i++) {
      expect(b.hits[i].rate).toBeGreaterThan(b.hits[i - 1].rate);
      expect(b.hits[i].hit).toBeLessThanOrEqual(b.hits[i - 1].hit);
    }
  });
});

describe("carryingTheRate", () => {
  it("NAMES STANDARD ON HIS BOOK — the old sentence said the opposite", () => {
    const v = carryingTheRate(bookStanding(STD_BOOK, STD), bookStanding(SPEC_BOOK, SPEC));
    expect(v.winner).toBe("standard");
    expect(v.why).toMatch(/standard freight is carrying the rate/);
    expect(v.why).toMatch(/1 load in 11/);
  });

  it("the OLD rule, on the same books, gets it backwards — kept as the proof", () => {
    // Below a shared break-even: standard 3 of 10 (30%), specialized 3 of 11
    // (27%). On that measure specialized looks better, which is exactly how
    // the page came to recommend the weaker book.
    const belowShared = (b: BookLoad[]) => b.filter((l) => l.rpm < 4.0347).length / b.length;
    expect(belowShared(SPEC_BOOK)).toBeLessThan(belowShared(STD_BOOK));
    // and the new rule disagrees with it
    expect(carryingTheRate(bookStanding(STD_BOOK, STD), bookStanding(SPEC_BOOK, SPEC)).winner)
      .toBe("standard");
  });

  it("REFUSES TO CALL A WINNER OFF A THIN BOOK", () => {
    // The sentence it replaces would fire on one load against six.
    const v = carryingTheRate(
      bookStanding(STD_BOOK, STD),
      bookStanding([at(9)], SPEC),
    );
    expect(v.winner).toBeNull();
    expect(v.why).toMatch(/1 specialized/);
    expect(v.why).toMatch(new RegExp(`${CARRIER_MIN_LOADS} of each`));
  });

  it("says LEVEL rather than naming a winner by a hair", () => {
    const a = bookStanding([at(5), at(5), at(5), at(3), at(3)], STD); // 3/5 = 60%
    const b = bookStanding([at(6), at(6), at(6), at(3), at(3)], SPEC); // 3/5 = 60%
    const v = carryingTheRate(a, b);
    expect(v.winner).toBe("level");
    expect(v.why).toMatch(/about as often/);
  });

  it("names specialized when specialized really is ahead", () => {
    const weakStd = bookStanding([at(3), at(3), at(3), at(3), at(5.5)], STD); // 1/5
    const strongSpec = bookStanding([at(7), at(7), at(7), at(7), at(3)], SPEC); // 4/5
    expect(carryingTheRate(weakStd, strongSpec).winner).toBe("specialized");
  });
});

describe("deadheadLever", () => {
  // His real last-90 totals.
  const REAL = [{ driven: 20561, loaded: 15669, gross: 88382 }];

  it("REPRODUCES HIS 90 DAYS — 23.8% empty, 21c a mile to target", () => {
    const d = deadheadLever(REAL, 0.2)!;
    expect(d.share).toBeCloseTo(0.238, 3);
    expect(d.rateNow).toBeCloseTo(4.3, 2);
    expect(d.rateAtTarget).toBeCloseTo(4.51, 2);
    expect(d.gainPerMile).toBeCloseTo(0.21, 2);
  });

  it("AT OR UNDER TARGET THERE IS NO GAIN TO CLAIM — null, not zero", () => {
    // A zero here would read as "you could do better by nothing", which is a
    // claim. Null is "there is nothing to say".
    const good = deadheadLever([{ driven: 10000, loaded: 8500, gross: 40000 }], 0.2)!;
    expect(good.share).toBeCloseTo(0.15, 3);
    expect(good.rateAtTarget).toBeNull();
    expect(good.gainPerMile).toBeNull();
    // exactly on target is also no gain
    expect(deadheadLever([{ driven: 10000, loaded: 8000, gross: 40000 }], 0.2)!.gainPerMile)
      .toBeNull();
  });

  it("the gain is always the same money over fewer miles", () => {
    for (const share of [0.25, 0.3, 0.4]) {
      const loaded = 10000;
      const driven = Math.round(loaded / (1 - share));
      const gross = 45000;
      const d = deadheadLever([{ driven, loaded, gross }], 0.2)!;
      // same gross, fewer driven miles — never more money, only a better rate
      expect(d.rateAtTarget! * (loaded / 0.8)).toBeCloseTo(gross, 4);
      expect(d.gainPerMile!).toBeGreaterThan(0);
    }
  });

  it("refuses nonsense rather than dividing by it", () => {
    expect(deadheadLever([], 0.2)).toBeNull();
    expect(deadheadLever([{ driven: 0, loaded: 0, gross: 0 }], 0.2)).toBeNull();
    expect(deadheadLever(REAL, 0)).toBeNull();
    expect(deadheadLever(REAL, 1)).toBeNull();
  });
});

describe("rebaseBarometer — both lines in dollars", () => {
  const row = (month: string, median: number | null, ppi: number | null) => ({ month, median, ppi });

  it("ANCHORS ON AN AVERAGE, not a single print", () => {
    // A noisy first month would otherwise shift the whole line, making the gap
    // an artefact of where the window starts.
    const r = rebaseBarometer([
      row("2026-01", 4.0, 100), row("2026-02", 5.0, 110), row("2026-03", 6.0, 120),
      row("2026-04", 5.0, 130),
    ])!;
    expect(r.baseMonths).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(r.baseRate).toBeCloseTo(5.0, 6);
    expect(r.baseIndex).toBeCloseTo(110, 6);
    // April: the index is 130/110 above base, so the path is 5.00 x that
    expect(r.months.at(-1)!.indexPath).toBeCloseTo(5 * (130 / 110), 6);
  });

  it("both lines start from the same point, so the gap is readable from zero", () => {
    const r = rebaseBarometer([row("2026-01", 4, 100), row("2026-02", 4, 100)], 2)!;
    for (const m of r.months) expect(m.indexPath).toBeCloseTo(m.median!, 6);
    expect(r.latest!.gap).toBeCloseTo(0, 6);
  });

  it("A RATE THAT LAGGED THE INDEX SHOWS A NEGATIVE GAP, in dollars", () => {
    // index +20%, his rate flat — he is behind by 20% of the base rate.
    const r = rebaseBarometer([
      row("2026-01", 5, 100), row("2026-02", 5, 100), row("2026-03", 5, 100),
      row("2026-04", 5, 120),
    ])!;
    expect(r.latest!.gap).toBeCloseTo(-1.0, 6);
    expect(r.latest!.indexPath).toBeCloseTo(6, 6);
  });

  it("the index line is drawn wherever the index exists, even with no rate that month", () => {
    const r = rebaseBarometer([
      row("2026-01", 5, 100), row("2026-02", null, 110), row("2026-03", 5.5, 120),
    ], 1)!;
    expect(r.months[1].median).toBeNull();
    expect(r.months[1].indexPath).toBeCloseTo(5 * 1.1, 6);
    // ...but the GAP only reads where both exist
    expect(r.latest!.month).toBe("2026-03");
  });

  it("sorts, so a caller cannot anchor on the wrong end by passing rows out of order", () => {
    const r = rebaseBarometer([row("2026-05", 9, 200), row("2026-01", 4, 100)], 1)!;
    expect(r.baseMonths).toEqual(["2026-01"]);
    expect(r.baseRate).toBe(4);
  });

  it("NO OVERLAP, NO REBASE — null rather than a line anchored on nothing", () => {
    expect(rebaseBarometer([])).toBeNull();
    expect(rebaseBarometer([row("2026-01", 5, null), row("2026-02", null, 100)])).toBeNull();
    expect(rebaseBarometer([row("2026-01", 0, 100)])).toBeNull();
    expect(rebaseBarometer([row("2026-01", 5, 0)])).toBeNull();
  });
});
