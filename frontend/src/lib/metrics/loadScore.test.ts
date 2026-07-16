import { describe, it, expect } from "vitest";
import { scoreLoad } from "./loadScore";

// break-even per driven mile = costPerDrivenMile / payTake = 3.08 / 0.78 ≈ $3.95
const basis = { costPerDrivenMile: 3.08, payTake: 0.78 };

describe("scoreLoad", () => {
  it("bakes deadhead into the all-in rate and lands TAKE IT above target", () => {
    const s = scoreLoad({ rate: 2900, loadedMiles: 460, deadheadMiles: 80 }, basis);
    expect(s.drivenMiles).toBe(540);
    expect(s.allInRpm).toBeCloseTo(2900 / 540); // ~5.37, over loaded+deadhead
    expect(s.breakevenRpm).toBeCloseTo(3.95, 1);
    expect(s.pctOverBreakeven).toBeGreaterThan(0.35); // clears target
    expect(s.verdict).toBe("take");
    expect(s.profit).toBeGreaterThan(0);
  });

  it("PASSes a load that loses money once deadhead is counted", () => {
    // $2.10/loaded looks ok, but 200 deadhead on 500 loaded sinks it under break-even
    const s = scoreLoad({ rate: 1500, loadedMiles: 500, deadheadMiles: 200 }, basis);
    expect(s.allInRpm).toBeCloseTo(1500 / 700); // ~2.14 < 3.95
    expect(s.verdict).toBe("pass");
    expect(s.profit).toBeLessThan(0);
  });

  it("STEALs a load 60%+ over break-even", () => {
    const s = scoreLoad({ rate: 4200, loadedMiles: 400, deadheadMiles: 60 }, basis);
    expect(s.allInRpm).toBeCloseTo(4200 / 460); // ~9.13
    expect(s.pctOverBreakeven).toBeGreaterThan(0.6);
    expect(s.verdict).toBe("steal");
  });

  it("MEHs a load just above break-even but under target", () => {
    // aim ~15% over break-even: rate ≈ 3.95*1.15 * driven
    const s = scoreLoad({ rate: 2560, loadedMiles: 500, deadheadMiles: 60 }, basis);
    expect(s.verdict).toBe("meh");
    expect(s.pctOverBreakeven).toBeGreaterThan(0);
    expect(s.pctOverBreakeven).toBeLessThan(0.35);
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
