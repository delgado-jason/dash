import { describe, it, expect } from "vitest";
import { computeMedals, earnedMedals } from "./medals";

const base = {
  lifetimeMiles: 0,
  deliveredCount: 0,
  cumulativeNet: 0,
  streak: 0,
  loanPaidPct: null,
  seasonStrong: false,
};

describe("computeMedals", () => {
  it("tiers Mile Club and reports progress to the next", () => {
    const m = computeMedals({ ...base, lifetimeMiles: 582_450 }).find((x) => x.key === "mile-club")!;
    expect(m.tier).toBe(3); // ≥500k, <1M
    expect(m.tierLabel).toBe("III");
    expect(m.next).toBe(1_000_000);
    expect(m.progress).toBeCloseTo((582450 - 500000) / (1_000_000 - 500000), 3);
    expect(m.hint).toBe("582k / 1M");
  });

  it("stays untiered below the first threshold", () => {
    const m = computeMedals({ ...base, deliveredCount: 47 }).find((x) => x.key === "freight-hauler")!;
    expect(m.tier).toBe(0);
    expect(m.next).toBe(100);
  });

  it("adds Debt Crusher only when a loan is tracked", () => {
    expect(computeMedals(base).find((x) => x.key === "debt-crusher")).toBeUndefined();
    const m = computeMedals({ ...base, loanPaidPct: 0.36 }).find((x) => x.key === "debt-crusher")!;
    expect(m.tier).toBe(1); // ≥25%
    expect(m.hint).toBe("36% / 50%");
  });

  it("earnedMedals keeps only earned, most prestigious first", () => {
    const all = computeMedals({
      ...base,
      lifetimeMiles: 582_450, // Mile Club III
      streak: 5, // Target Streak I
      loanPaidPct: 0.36, // Debt Crusher I
    });
    const earned = earnedMedals(all).map((m) => m.key);
    expect(earned[0]).toBe("mile-club"); // tier III leads
    expect(earned).toContain("iron-streak");
    expect(earned).not.toContain("freight-hauler"); // 0 loads → untiered
  });
});
