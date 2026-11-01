import { describe, it, expect } from "vitest";
import { marginToMarkup, markupToMargin, dialRungs, dialAdvice } from "./rateDial";
import type { MarketSignal } from "./marketSignal";

describe("margin ↔ markup — two currencies, one number", () => {
  it("the conversions that retire the confusion", () => {
    expect(marginToMarkup(0.2)).toBeCloseTo(0.25, 4); // 20% margin needs +25% over cost
    expect(marginToMarkup(0.15)).toBeCloseTo(0.1765, 4); // 15% margin ≠ +15% markup
    expect(markupToMargin(0.15)).toBeCloseTo(0.1304, 4); // +15% markup is only a 13% margin
    expect(markupToMargin(0.25)).toBeCloseTo(0.2, 4);
    expect(markupToMargin(marginToMarkup(0.33))).toBeCloseTo(0.33, 3); // round-trips
  });
});

describe("dialRungs — one handle, three rungs", () => {
  it("Jason's standard dial at 20% reproduces his calibration", () => {
    const r = dialRungs(0.2);
    expect(r.margins).toEqual({ minimum: 0.15, target: 0.2, strong: 0.25 });
    expect(r.markups.minimum).toBeCloseTo(0.1765, 4);
    expect(r.markups.target).toBeCloseTo(0.25, 4);
    expect(r.markups.strong).toBeCloseTo(0.3333, 4);
  });

  it("the minimum rung floors at break-even — the dial never writes a losing tier", () => {
    const r = dialRungs(0.03);
    expect(r.margins.minimum).toBe(0); // 3% − 5 would be −2%
    expect(r.markups.minimum).toBe(0); // = break-even exactly
  });

  it("rungs always climb (monotonic conversion)", () => {
    for (const t of [0.0, 0.1, 0.2, 0.33, 0.45]) {
      const { markups } = dialRungs(t);
      expect(markups.minimum).toBeLessThanOrEqual(markups.target);
      expect(markups.target).toBeLessThanOrEqual(markups.strong);
    }
  });
});

describe("dialAdvice — the index's nudge: one step, only when the signal holds", () => {
  // Jason today: goal 15%, std dial 20%, spec dial ~33%.
  const GOAL = 0.15;
  const sig = (over: Partial<MarketSignal>): MarketSignal => ({
    direction: "firming", raw: "firming", pctChange: 0.032, prints: 2, holds: true, dieselPct: 0.02, fuelDriven: false,
    latestMonth: "2026-09", windowStart: "2026-06", ...over,
  });

  it("firming for two prints: one step up — two points from where the Standard dial sits, the spec premium kept", () => {
    const a = dialAdvice(sig({}), GOAL, 0.2, 0.33);
    expect(a.std).toBeCloseTo(0.22, 4);
    expect(a.spec).toBeCloseTo(0.35, 4); // 22 + his 13-pt premium
    expect(a.stdDelta).toBeCloseTo(0.02, 4);
    expect(a.hold).toBe(false);
    expect(a.headline).toMatch(/Firming for 2 prints — one step up: Standard to 22%/);
  });

  it("one print is not a call — hold, and say so", () => {
    const a = dialAdvice(sig({ direction: "flat", prints: 1, holds: false }), GOAL, 0.2, 0.33);
    expect(a.hold).toBe(true);
    expect(a.headline).toMatch(/firming for 1 print, not yet a call/);
  });

  it("a fuel move is named and never moves a dial", () => {
    const a = dialAdvice(sig({ direction: "flat", dieselPct: 0.25, fuelDriven: true }), GOAL, 0.2, 0.33);
    expect(a.hold).toBe(true);
    expect(a.fuelDriven).toBe(true);
    expect(a.headline).toMatch(/fuel move/);
    expect(a.why).toMatch(/diesel moved \+25%/);
  });

  it("softening for two prints: one step down, never under goal + 5 — so the floor rung never lands under the goal", () => {
    const soft = sig({ direction: "softening", raw: "softening", pctChange: -0.03, prints: 3 });
    const a = dialAdvice(soft, GOAL, 0.25, 0.38);
    expect(a.std).toBeCloseTo(0.23, 4);
    expect(a.headline).toMatch(/Softening for 3 prints — one step down: Standard to 23%/);
    const b = dialAdvice(soft, GOAL, 0.2, 0.33); // already at goal + 5
    expect(b.std).toBeCloseTo(0.2, 4);
    expect(b.hold).toBe(true);
  });

  it("advice never points past the dial's physical range", () => {
    const a = dialAdvice(sig({}), 0.26, 0.44, 0.45);
    expect(a.std).toBeLessThanOrEqual(0.45);
    expect(a.spec).toBeLessThanOrEqual(0.45);
  });

  it("the premium never collapses below 5 pts", () => {
    const a = dialAdvice(sig({}), GOAL, 0.2, 0.21);
    expect(a.spec - a.std).toBeCloseTo(0.05, 4);
  });

  it("the dial parked under goal + 5 is a correction, whatever the index says: lift it to the floor; no index → hold", () => {
    const a = dialAdvice(sig({ direction: "flat", raw: "flat", pctChange: 0.004, prints: 4, holds: false }), GOAL, 0.17, 0.3);
    expect(a.std).toBeCloseTo(0.2, 4);
    expect(a.headline).toMatch(/Under goal \+ 5 — lift Standard to 20%/);
    expect(dialAdvice(null, GOAL, 0.17, 0.3).headline).toMatch(/lift Standard to 20%/);
    expect(dialAdvice(sig({}), GOAL, 0.17, 0.3)).toMatchObject({ std: 0.2 }); // firming from under the floor: a step up, landing on the floor
    const b = dialAdvice(null, GOAL, 0.2, 0.33);
    expect(b.hold).toBe(true);
    expect(b.headline).toMatch(/no index read/);
  });
});
