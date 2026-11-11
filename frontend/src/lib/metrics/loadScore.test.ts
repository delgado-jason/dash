import { describe, it, expect } from "vitest";
import { scoreLoad, counterRates } from "./loadScore";

// break-even per driven mile = costPerDrivenMile / payTake = 3.08 / 0.78 ≈ $3.95
const basis = { costPerDrivenMile: 3.08, payTake: 0.78 };
// Explicit tiers so verdict thresholds are pinned regardless of the seed defaults.
const TIERS = { minimum: 0.15, target: 0.35, strong: 0.6 };

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

  it("reads THIN just above break-even but under target", () => {
    // aim ~15% over break-even: rate ≈ 3.95*1.15 * driven
    const s = scoreLoad({ rate: 2560, loadedMiles: 500, deadheadMiles: 60 }, basis, TIERS);
    expect(s.verdict).toBe("meh");
    expect(s.pctOverBreakeven).toBeGreaterThan(0);
    expect(s.pctOverBreakeven).toBeLessThan(0.35);
  });

  it("grades the SAME load differently under standard vs specialized tiers", () => {
    // ~+40% over break-even: a steal on standard (strong +30%), only meh on
    // specialized (target +45%). This is the whole point of the two sets.
    const std = { minimum: 0.1, target: 0.2, strong: 0.3 };
    const spec = { minimum: 0.35, target: 0.45, strong: 0.6 };
    const load = { rate: 2760, loadedMiles: 500, deadheadMiles: 0 }; // 5.52/mi ≈ +40%
    expect(scoreLoad(load, basis, std).verdict).toBe("steal");
    expect(scoreLoad(load, basis, spec).verdict).toBe("meh");
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
  it("prices the floor, SOLID (+35%), and PRIME (+60%) on the driven miles", () => {
    const c = counterRates(4, 500, TIERS)!; // $4/mi break-even, 500 mi
    expect(c.floor).toBeCloseTo(2000, 5); // 4 × 500
    expect(c.take).toBeCloseTo(2700, 5); // 4 × 1.35 × 500
    expect(c.steal).toBeCloseTo(3200, 5); // 4 × 1.60 × 500
    expect(c.take).toBeGreaterThan(c.floor);
    expect(c.steal).toBeGreaterThan(c.take);
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
// The walk-away answers "what must the month average?". This answers the
// narrower one that comes up in a dead market: "the alternative right now is
// parking — is this better than that?". Fixed cost is absent on purpose; it
// drafts whether the truck rolls or not, so it cannot decide a marginal load.
// ---------------------------------------------------------------------------
describe("scoreLoad — beats sitting", () => {
  // Variable cost $1.59/mi at a 0.7593 keep → a gross mile must make $2.09
  // before moving pays for itself. Break-even is $4.11, nearly double.
  const b = { costPerDrivenMile: 3.119, payTake: 0.7593, variablePerMile: 1.59 };

  it("is variable cost grossed up by the keep — about half the walk-away", () => {
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
