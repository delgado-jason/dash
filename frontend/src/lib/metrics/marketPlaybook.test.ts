import { describe, it, expect } from "vitest";
import type { RateLadder } from "./rateTargets";
import { buildTierPlay } from "./marketPlaybook";

// break-even 4.34, floor 4.75, target 5.60, strong 6.50 (gross $/driven mile).
const LADDER: RateLadder = { walkAway: 4.34, minimum: 4.75, target: 5.6, strong: 6.5 };
const play = (
  rate: number | null,
  dir: "firming" | "flat" | "softening" | null,
  businessUnderwater = false,
) => buildTierPlay("standard", "Standard", LADDER, rate, dir, businessUnderwater);

describe("buildTierPlay — firming market", () => {
  it("raises toward strong when below it", () => {
    const p = play(5.2, "firming");
    expect(p.action).toBe("raise");
    expect(p.recommendedRate).toBe(6.5);
    expect(p.movePct).toBeCloseTo(0.25, 2);
    expect(p.headline).toBe("Raise +25%");
  });

  it("says push the ceiling when already at/above strong", () => {
    const p = play(6.6, "firming");
    expect(p.action).toBe("raise");
    expect(p.headline).toMatch(/ceiling/i);
    expect(p.movePct).toBeNull();
  });
});

describe("buildTierPlay — softening market", () => {
  it("protects the floor with room shown when above it", () => {
    const p = play(5.2, "softening");
    expect(p.action).toBe("protect");
    expect(p.headline).toMatch(/9% cushion to floor/);
    expect(p.recommendedRate).toBeNull();
  });

  it("holds the line when already at/below floor (still above break-even)", () => {
    const p = play(4.6, "softening");
    expect(p.action).toBe("protect");
    expect(p.headline).toMatch(/floor/i);
  });
});

describe("buildTierPlay — a tier under break-even, business still profitable", () => {
  it("flags 'below cost floor' (subsidized), NOT cut-costs, whatever the market's doing", () => {
    for (const dir of ["firming", "flat", "softening", null] as const) {
      const p = play(4.2, dir); // businessUnderwater defaults false
      expect(p.action).toBe("under-floor");
      expect(p.headline).toBe("Below your cost floor");
      expect(p.why).not.toMatch(/cut costs/i);
      expect(p.why).toMatch(/not losing you money/i); // reassure, don't alarm
      expect(p.recommendedRate).toBe(4.75); // lift toward the floor
      expect(p.underwaterPerMile).toBeCloseTo(0.14, 5);
    }
  });
});

describe("buildTierPlay — whole operation under break-even", () => {
  it("cut-costs when the business itself is underwater, whatever the market's doing", () => {
    for (const dir of ["firming", "flat", "softening", null] as const) {
      const p = play(4.2, dir, true);
      expect(p.action).toBe("cut-costs");
      expect(p.headline).toBe("Cut costs");
      expect(p.underwaterPerMile).toBeCloseTo(0.14, 5);
    }
  });
});

describe("buildTierPlay — flat market", () => {
  it("nudges up to target when under it", () => {
    const p = play(5.2, "flat");
    expect(p.action).toBe("raise");
    expect(p.recommendedRate).toBe(5.6);
    expect(p.headline).toMatch(/\+8%/);
  });

  it("holds at/above target", () => {
    const p = play(5.8, "flat");
    expect(p.action).toBe("hold");
    expect(p.headline).toBe("Hold");
  });
});

describe("buildTierPlay — no index reading (null direction)", () => {
  it("holds to your targets without fabricating a market call", () => {
    const p = play(5.2, null);
    expect(p.action).toBe("hold");
    expect(p.headline).toBe("Hold to your targets");
    expect(p.movePct).toBeNull();
    expect(p.recommendedRate).toBeNull();
    expect(p.rungs).toHaveLength(4);
  });

  it("still flags below-cost-floor when under break-even with no index (business healthy)", () => {
    const p = play(4.2, null);
    expect(p.action).toBe("under-floor");
  });
});

describe("buildTierPlay — degraded causes are named honestly", () => {
  it("reports no rate read when there are no loads", () => {
    const p = play(null, "flat");
    expect(p.rungs).toEqual([]);
    expect(p.why).toMatch(/loads in range/i);
  });

  it("reports missing cost basis (not rate history) when the ladder is null but a rate exists", () => {
    const noLadder = { walkAway: null, minimum: null, target: null, strong: null };
    const p = buildTierPlay("standard", "Standard", noLadder, 5.2, "flat");
    expect(p.rungs).toEqual([]);
    expect(p.yourRate).toBe(5.2);
    expect(p.why).toMatch(/cost basis/i);
  });
});

describe("buildTierPlay — rungs + guards", () => {
  it("computes signed deltas to each rung from your rate", () => {
    const p = play(5.2, "flat");
    const strong = p.rungs.find((r) => r.key === "strong")!;
    const be = p.rungs.find((r) => r.key === "breakEven")!;
    expect(strong.deltaPct).toBeCloseTo((6.5 - 5.2) / 5.2, 4);
    expect(be.deltaPct).toBeCloseTo((4.34 - 5.2) / 5.2, 4);
  });

  it("degrades to an empty hold when rate history is missing", () => {
    const p = play(null, "softening");
    expect(p.action).toBe("hold");
    expect(p.rungs).toEqual([]);
    expect(p.headline).toBe("—");
  });
});
