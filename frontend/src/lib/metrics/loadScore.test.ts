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
