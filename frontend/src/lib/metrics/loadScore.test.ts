import { describe, it, expect } from "vitest";
import {
  scoreLoad,
  counterRates,
  verdictAtLeast,
  VERDICT_ORDER,
  VERDICT_META,
} from "./loadScore";

// break-even per driven mile = costPerDrivenMile / payTake = 3.08 / 0.78 ≈ $3.95
const basis = { costPerDrivenMile: 3.08, payTake: 0.78 };
// Explicit tiers so verdict thresholds are pinned regardless of the seed defaults.
const TIERS = { minimum: 0.15, target: 0.35, prime: 0.6 };

describe("scoreLoad", () => {
  it("bakes deadhead into the all-in rate and lands SOLID above target", () => {
    const s = scoreLoad({ rate: 2900, loadedMiles: 460, deadheadMiles: 80 }, basis, TIERS);
    expect(s.drivenMiles).toBe(540);
    expect(s.allInRpm).toBeCloseTo(2900 / 540); // ~5.37, over loaded+deadhead
    expect(s.loadedRpm).toBeCloseTo(2900 / 460); // freight's own rate, deadhead-blind
    expect(s.breakevenRpm).toBeCloseTo(3.95, 1);
    expect(s.pctOverBreakeven).toBeGreaterThan(0.35); // clears target
    expect(s.verdict).toBe("take");
    expect(s.profit).toBeGreaterThan(0);
  });

  it("SCRAPs a load that loses money once deadhead is counted", () => {
    // $2.10/loaded looks ok, but 200 deadhead on 500 loaded sinks it under break-even
    const s = scoreLoad({ rate: 1500, loadedMiles: 500, deadheadMiles: 200 }, basis);
    expect(s.allInRpm).toBeCloseTo(1500 / 700); // ~2.14 < 3.95
    expect(s.verdict).toBe("pass");
    expect(s.profit).toBeLessThan(0);
  });

  it("PRIMEs a load 60%+ over break-even", () => {
    const s = scoreLoad({ rate: 4200, loadedMiles: 400, deadheadMiles: 60 }, basis, TIERS);
    expect(s.allInRpm).toBeCloseTo(4200 / 460); // ~9.13
    expect(s.pctOverBreakeven).toBeGreaterThan(0.6);
    expect(s.verdict).toBe("steal");
  });

  it("reads PROFITABLE once it clears the minimum rung, not THIN (Rule change: SCORE-01)", () => {
    // ~+15% over break-even, which IS the minimum rung here. The four-way
    // ladder called this THIN because it never read `minimum` — it jumped from
    // break-even to target. On Jason's real book that mislabelled five of fifty
    // delivered loads as earning him nothing when they cleared his margin goal.
    const s = scoreLoad({ rate: 2560, loadedMiles: 500, deadheadMiles: 60 }, basis, TIERS);
    expect(s.pctOverBreakeven).toBeGreaterThanOrEqual(TIERS.minimum);
    expect(s.pctOverBreakeven).toBeLessThan(TIERS.target);
    expect(s.verdict).toBe("profit");
  });

  it("THIN is now only the gap between break-even and minimum", () => {
    // +8%: real money above cost, but under the margin goal — covers the truck
    // and earns nothing. This band is what THIN was always supposed to mean.
    const driven = 560;
    const s = scoreLoad(
      { rate: 3.08 / 0.78 * 1.08 * driven, loadedMiles: 500, deadheadMiles: 60 },
      basis,
      TIERS,
    );
    expect(s.pctOverBreakeven).toBeGreaterThan(0);
    expect(s.pctOverBreakeven).toBeLessThan(TIERS.minimum);
    expect(s.verdict).toBe("meh");
  });

  it("every band, in order, with the boundaries inclusive at the bottom", () => {
    // The whole ladder pinned in one place: a rate exactly ON a rung belongs to
    // that rung, not the one below. Five verdicts, five bands, no gaps.
    const be = 3.08 / 0.78;
    const driven = 500;
    const at = (overBreakeven: number) =>
      scoreLoad(
        { rate: be * (1 + overBreakeven) * driven, loadedMiles: driven, deadheadMiles: 0 },
        basis,
        TIERS,
      ).verdict;
    expect(at(-0.01)).toBe("pass"); // under cost
    expect(at(0)).toBe("meh"); // exactly break-even: covers cost, earns nothing
    expect(at(0.149)).toBe("meh");
    expect(at(TIERS.minimum)).toBe("profit"); // ON the minimum rung
    expect(at(0.349)).toBe("profit");
    expect(at(TIERS.target)).toBe("take"); // ON target
    expect(at(0.599)).toBe("take");
    expect(at(TIERS.prime)).toBe("steal"); // ON prime
    expect(at(2)).toBe("steal");
  });

  it("grades the SAME load differently under standard vs specialized tiers", () => {
    // ~+40% over break-even: PRIME on standard (prime rung +30%), merely
    // PROFITABLE on specialized (minimum +35%, target +45%). This is the whole
    // point of the two sets — and note it is no longer THIN on specialized,
    // because +40% does clear the specialized minimum.
    const std = { minimum: 0.1, target: 0.2, prime: 0.3 };
    const spec = { minimum: 0.35, target: 0.45, prime: 0.6 };
    const load = { rate: 2760, loadedMiles: 500, deadheadMiles: 0 }; // 5.52/mi ≈ +40%
    expect(scoreLoad(load, basis, std).verdict).toBe("steal");
    expect(scoreLoad(load, basis, spec).verdict).toBe("profit");
  });

  it("returns a null verdict when there's no cost basis or no miles", () => {
    expect(
      scoreLoad({ rate: 2000, loadedMiles: 400, deadheadMiles: 0 }, {
        costPerDrivenMile: null,
        payTake: null,
      }).verdict,
    ).toBeNull();
    expect(scoreLoad({ rate: 2000, loadedMiles: 0, deadheadMiles: 0 }, basis).verdict).toBeNull();
  });
});

describe("counterRates", () => {
  it("prices all four rungs on the driven miles", () => {
    const c = counterRates(4, 500, TIERS)!; // $4/mi break-even, 500 mi
    expect(c.floor).toBeCloseTo(2000, 5); // 4 × 500
    expect(c.minimum).toBeCloseTo(2300, 5); // 4 × 1.15 × 500
    expect(c.take).toBeCloseTo(2700, 5); // 4 × 1.35 × 500
    expect(c.steal).toBeCloseTo(3200, 5); // 4 × 1.60 × 500
    expect(c.minimum).toBeGreaterThan(c.floor);
    expect(c.take).toBeGreaterThan(c.minimum);
    expect(c.steal).toBeGreaterThan(c.take);
  });

  it("A RATE IT QUOTED, TYPED BACK IN, GRADES AT THE RUNG IT QUOTED FOR", () => {
    // The round trip this pair makes possible, and the bug it had. counterRates
    // returns dollars; scoreLoad divides them back out by miles and break-even.
    // Before the banding was rounded, 0.15 came back as 0.1499999999999999 and
    // the page called its own minimum quote THIN. Jason reads these numbers down
    // a phone — "ask $2,300 and you're profitable" has to still be true when
    // $2,300 is what he gets.
    const be = 3.08 / 0.78;
    const driven = 500;
    const c = counterRates(be, driven, TIERS)!;
    const verdictAt = (rate: number) =>
      scoreLoad({ rate, loadedMiles: driven, deadheadMiles: 0 }, basis, TIERS).verdict;
    expect(verdictAt(c.floor)).toBe("meh"); // exactly break-even: covers cost, no more
    expect(verdictAt(c.minimum)).toBe("profit");
    expect(verdictAt(c.take)).toBe("take");
    expect(verdictAt(c.steal)).toBe("steal");
  });

  it("holds the round trip across awkward mileages and break-evens", () => {
    // The 500-mile case above divides cleanly. These do not — the point is that
    // the guarantee is about the rounding, not about lucky arithmetic.
    for (const be of [3.9487, 4.0347, 5.6042, 2.07]) {
      for (const driven of [137, 749, 1013, 1627]) {
        const c = counterRates(be, driven, TIERS)!;
        const at = (rate: number) =>
          scoreLoad(
            { rate, loadedMiles: driven, deadheadMiles: 0 },
            { costPerDrivenMile: be * 0.78, payTake: 0.78 },
            TIERS,
          ).verdict;
        expect(at(c.minimum)).toBe("profit");
        expect(at(c.take)).toBe("take");
        expect(at(c.steal)).toBe("steal");
      }
    }
  });

  it("is null without a usable break-even or miles", () => {
    expect(counterRates(null, 500)).toBeNull();
    expect(counterRates(0, 500)).toBeNull();
    expect(counterRates(4, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BEATS SITTING — the other question entirely.
//
// The break-even answers "what must the month average?". This answers the
// narrower one that comes up in a dead market: "the alternative right now is
// parking — is this better than that?". Fixed cost is absent on purpose; it
// drafts whether the truck rolls or not, so it cannot decide a marginal load.
// ---------------------------------------------------------------------------
describe("scoreLoad — beats sitting", () => {
  // Variable cost $1.59/mi at a 0.7593 keep → a gross mile must make $2.09
  // before moving pays for itself. Break-even is $4.11, nearly double.
  const b = { costPerDrivenMile: 3.119, payTake: 0.7593, variablePerMile: 1.59 };

  it("is variable cost grossed up by the keep — about half the break-even", () => {
    const s = scoreLoad({ rate: 3000, loadedMiles: 600, deadheadMiles: 100 }, b, TIERS);
    expect(s.beatsSittingRpm).toBeCloseTo(1.59 / 0.7593, 4); // $2.09
    expect(s.beatsSittingRpm!).toBeLessThan(s.breakevenRpm! / 1.8);
  });

  it("a load can SCRAP and still beat parking — the case that matters", () => {
    // $2.50 a driven mile: far under the $4.11 floor, comfortably over $2.09.
    const s = scoreLoad({ rate: 1750, loadedMiles: 500, deadheadMiles: 200 }, b, TIERS);
    expect(s.allInRpm).toBeCloseTo(2.5, 2);
    expect(s.verdict).toBe("pass"); // still a bad month if repeated
    expect(s.beatsSitting).toBe(true); // but better than idling right now
  });

  it("below the line it loses money faster than standing still", () => {
    const s = scoreLoad({ rate: 1050, loadedMiles: 500, deadheadMiles: 200 }, b, TIERS);
    expect(s.allInRpm).toBeCloseTo(1.5, 2);
    expect(s.beatsSitting).toBe(false);
  });

  it("exactly on the line counts as beating it — the mile breaks even", () => {
    const line = 1.59 / 0.7593;
    const s = scoreLoad({ rate: line * 700, loadedMiles: 500, deadheadMiles: 200 }, b, TIERS);
    expect(s.beatsSitting).toBe(true);
  });

  it("without a variable cost the Scorer grades exactly as before, and says nothing", () => {
    const s = scoreLoad({ rate: 2900, loadedMiles: 460, deadheadMiles: 80 }, basis, TIERS);
    expect(s.verdict).toBe("take"); // unchanged
    expect(s.beatsSittingRpm).toBeNull();
    expect(s.beatsSitting).toBeNull();
  });

  it("the line is known even when the load itself cannot be graded", () => {
    // Deadhead unknown → no verdict, but the threshold needs no load at all.
    const s = scoreLoad({ rate: 2000, loadedMiles: 500, deadheadMiles: null }, b, TIERS);
    expect(s.verdict).toBeNull();
    expect(s.beatsSittingRpm).toBeCloseTo(2.09, 2);
    expect(s.beatsSitting).toBeNull(); // nothing to compare it against
  });

  it("refuses a nonsense variable cost rather than inventing a line", () => {
    for (const bad of [0, -1.59, null]) {
      const s = scoreLoad(
        { rate: 2900, loadedMiles: 460, deadheadMiles: 80 },
        { ...b, variablePerMile: bad },
        TIERS,
      );
      expect(s.beatsSittingRpm).toBeNull();
    }
  });
});

describe("verdictAtLeast", () => {
  it("orders the verdicts worst to best", () => {
    expect(VERDICT_ORDER).toEqual(["pass", "meh", "profit", "take", "steal"]);
  });

  it("A LOAD THAT ONLY CLEARS MINIMUM IS NOT AT TARGET", () => {
    // The exact bug. The Scorer's "is there room to counter?" test used to
    // enumerate pass and meh, so a `profit` load slipped through it and the page
    // claimed the load already cleared target. Asked as a comparison it can't.
    expect(verdictAtLeast("profit", "take")).toBe(false);
    expect(verdictAtLeast("profit", "profit")).toBe(true);
    expect(verdictAtLeast("profit", "meh")).toBe(true);
  });

  it("is inclusive at its own floor, and false for every verdict below", () => {
    for (let i = 0; i < VERDICT_ORDER.length; i++) {
      const floor = VERDICT_ORDER[i];
      VERDICT_ORDER.forEach((v, j) => {
        expect(verdictAtLeast(v, floor)).toBe(j >= i);
      });
    }
  });

  it("an ungraded load is never at or above anything", () => {
    for (const floor of VERDICT_ORDER) expect(verdictAtLeast(null, floor)).toBe(false);
  });

  it("EVERY verdict has a label and a colour — a new one cannot ship unlabelled", () => {
    for (const v of VERDICT_ORDER) {
      expect(VERDICT_META[v].label).toBeTruthy();
      expect(VERDICT_META[v].fg).toBeTruthy();
    }
    expect(Object.keys(VERDICT_META).sort()).toEqual([...VERDICT_ORDER].sort());
  });

  it("the retired words are gone from every label", () => {
    const words = VERDICT_ORDER.map((v) => VERDICT_META[v].label.toLowerCase()).join(" ");
    expect(words).not.toMatch(/walk.?away|strong|scrap/);
    expect(words).toContain("prime");
    expect(words).toContain("profitable");
  });
});
