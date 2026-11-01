import { describe, it, expect } from "vitest";
import type { RateLadder } from "./rateTargets";
import type { MarketSignal } from "./marketSignal";
import { buildTierCall, buildMarketCall, MIN_LOADS_TO_CALL, indexWord } from "./marketCall";
import type { RatePoint } from "./marketAnalytics";

// break-even 4.34, floor 4.75, target 5.60, strong 6.50 (gross $/driven mile).
const LADDER: RateLadder = { walkAway: 4.34, minimum: 4.75, target: 5.6, strong: 6.5 };
const EMPTY: RateLadder = { walkAway: null, minimum: null, target: null, strong: null };
const sig = (over: Partial<MarketSignal> = {}): MarketSignal => ({
  direction: "firming", raw: "firming", pctChange: 0.032, prints: 2, holds: true, dieselPct: 0.01, fuelDriven: false,
  latestMonth: "2026-09", windowStart: "2026-06", ...over,
});
const HELD = sig();
const ONE = sig({ direction: "flat", prints: 1, holds: false });
const FUEL = sig({ direction: "flat", dieselPct: 0.25, fuelDriven: true });
const SOFT = sig({ direction: "softening", raw: "softening", pctChange: -0.03, prints: 3 });
const FLAT = sig({ direction: "flat", raw: "flat", pctChange: 0.004, prints: 5, holds: false });
const five = (r: number) => [r, r, r, r, r];
const call = (rates: number[], s: MarketSignal | null, underwater = false) => buildTierCall("standard", "Standard flatbed", LADDER, rates, s, underwater);

describe("the call — one move per tier", () => {
  it("fewer than five loads of the type: not enough to call, with the count — the rungs still shown", () => {
    const c = call([5, 5, 5], HELD);
    expect(c.action).toBe("no-call");
    expect(c.headline).toBe("Not enough to call");
    expect(c.why).toMatch(/3 standard flatbed loads in 90 days/);
    expect(c.evidence.n).toBe(3);
    expect(c.rungs).toHaveLength(4);
    expect(MIN_LOADS_TO_CALL).toBe(5);
    expect(call([], HELD)).toMatchObject({ action: "no-call", headline: "No loads in range" });
  });

  it("no cost basis: no call, named honestly", () => {
    const c = buildTierCall("standard", "Standard flatbed", EMPTY, five(5), HELD);
    expect(c).toMatchObject({ action: "no-call", headline: "No cost basis yet" });
    expect(c.why).toMatch(/\$5\.00, 5 loads/);
  });

  it("below break-even beats every direction: subsidized freight when the business is fine, cut costs when it's under water", () => {
    const sub = call(five(4.1), HELD);
    expect(sub.action).toBe("under-floor");
    expect(sub.headline).toMatch(/Below break-even/);
    expect(sub.evidence.below).toBe(5);
    expect(sub.recommendedRate).toBe(4.75);
    expect(sub.underwaterPerMile).toBeCloseTo(0.24, 4);
    const cut = call(five(4.1), HELD, true);
    expect(cut).toMatchObject({ action: "cut-costs", headline: "Cut costs" });
  });

  it("between break-even and the floor: hold the line at the floor, whatever the index says", () => {
    const c = call(five(4.5), HELD);
    expect(c.action).toBe("protect");
    expect(c.headline).toBe("Hold the line at your floor ($4.75)");
    expect(c.why).toMatch(/4% above break-even/);
    expect(c.recommendedRate).toBe(4.75);
  });

  it("between floor and target: a held firming signal raises ONE step — to target, never to strong", () => {
    const c = call(five(5), HELD);
    expect(c.action).toBe("raise");
    expect(c.headline).toBe("Raise +12% to your target");
    expect(c.recommendedRate).toBe(5.6);
    expect(c.movePct).toBeCloseTo(0.12, 4);
    expect(c.why).toMatch(/firming for 2 prints running/);
    expect(c.why).toMatch(/not to strong/);
  });

  it("between floor and target: a held softening signal protects, with the cushion to the floor", () => {
    const c = call(five(5), SOFT);
    expect(c.action).toBe("protect");
    expect(c.headline).toBe("Hold — 5% cushion to your floor");
    expect(c.why).toMatch(/softening for 3 prints running/);
  });

  it("one print is not a call; a fuel move is named; a steady index holds", () => {
    expect(call(five(5), ONE)).toMatchObject({ action: "hold", headline: "Hold — between floor and target" });
    expect(call(five(5), ONE).why).toMatch(/not yet a call/);
    const fuel = call(five(5), FUEL);
    expect(fuel.action).toBe("hold");
    expect(fuel.why).toMatch(/diesel's \(\+25\.0%\) — a fuel move/);
    expect(call(five(5), FLAT).why).toMatch(/steady/);
    expect(call(five(5), null).why).toMatch(/no index read/);
  });

  it("at or above target: a held firming signal pushes one step to strong; at strong, push the ceiling", () => {
    const c = call(five(6), HELD);
    expect(c.action).toBe("raise");
    expect(c.headline).toBe("Push +8% to your strong rung");
    expect(c.recommendedRate).toBe(6.5);
    expect(call(five(6.8), HELD)).toMatchObject({ action: "raise", headline: "Push the ceiling" });
    expect(call(five(6), SOFT)).toMatchObject({ action: "hold", headline: "Hold — above target" });
    expect(call(five(6), FLAT)).toMatchObject({ action: "hold", headline: "Hold — at or above target" });
  });

  it("evidence disagrees: the index is firming but the target already sits at the 90th percentile of your own loads → hold", () => {
    const rates = [4.8, 4.9, 5.0, 5.0, 5.1, 5.2, 5.3, 5.4, 5.5, 7.0]; // median 5.15, 9 of 10 ≤ target
    const c = call(rates, HELD);
    expect(c.evidence.pctile).toBeCloseTo(0.9, 4);
    expect(c.action).toBe("hold");
    expect(c.headline).toBe("Evidence disagrees — hold");
    expect(c.evidence.disagree).toBe(true);
    expect(c.why).toMatch(/90% of your recent standard flatbed loads sat at or under your target/);
  });

  it("evidence disagrees the other way: softening while your loads clear the target easily → hold, don't trim", () => {
    const rates = [5.0, 5.8, 6.0, 6.2, 6.4, 6.6, 6.8, 7.0, 7.2, 7.5]; // target at the 10th percentile
    const c = call(rates, SOFT);
    expect(c.evidence.pctile).toBeCloseTo(0.1, 4);
    expect(c).toMatchObject({ action: "hold", headline: "Evidence disagrees — hold" });
    expect(c.why).toMatch(/don't trim/);
  });

  it("under eight loads the target isn't ranked, so there is nothing to disagree with", () => {
    const c = call([5.0, 5.0, 5.1, 5.2, 5.3, 5.4, 5.5], HELD); // 7 loads, all ≤ target
    expect(c.evidence.pctile).toBeNull();
    expect(c.action).toBe("raise");
  });
});

describe("buildMarketCall — each tier on its own freight", () => {
  const pt = (date: string, rate: number, bucket: RatePoint["bucket"] = "standard"): RatePoint => ({ date, rate, bucket, loadNumber: null });
  const now = new Date("2026-10-01T12:00:00Z");
  it("standard loads judge the Standard tier; specialized and hazmat judge the Specialized tier; old loads stay out", () => {
    const pts = [
      ...[5, 5.1, 5.2, 5.3, 5.4].map((r, i) => pt(`2026-09-0${i + 1}`, r)),
      ...[7, 7.5, 8].map((r, i) => pt(`2026-09-1${i}`, r, i === 0 ? "hazmat" : "specialized")),
      pt("2026-05-01", 2, "standard"), // out of the window
    ];
    const spec: RateLadder = { walkAway: 4.34, minimum: 5.86, target: 6.29, strong: 6.94 };
    const mc = buildMarketCall(pts, LADDER, spec, HELD, now);
    expect(mc.tiers[0]).toMatchObject({ key: "standard", action: "raise", headline: "Raise +8% to your target" });
    expect(mc.tiers[0].evidence.n).toBe(5);
    expect(mc.tiers[1]).toMatchObject({ key: "specialized", action: "no-call" });
    expect(mc.tiers[1].evidence.n).toBe(3);
    expect(mc.signal).toBe(HELD);
  });
  it("indexWord says the one true thing about the index", () => {
    expect(indexWord(null)).toBe("no index read");
    expect(indexWord(ONE)).toMatch(/one print of firming/);
    expect(indexWord(FUEL)).toMatch(/fuel move/);
    expect(indexWord(SOFT)).toMatch(/softening for 3 prints running/);
  });
});
