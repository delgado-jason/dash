import { describe, it, expect } from "vitest";
import { marginToMarkup, markupToMargin, dialRungs, dialAdvice } from "./rateDial";

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

describe("dialAdvice — market-aware, anchored to the goal", () => {
  // Jason today: goal 15%, std dial 20%, spec dial ~33%.
  const GOAL = 0.15;

  it("softening thins the padding to goal +2, keeping the spec premium", () => {
    const a = dialAdvice("softening", GOAL, 0.2, 0.33);
    expect(a.std).toBeCloseTo(0.17, 4);
    expect(a.spec).toBeCloseTo(0.3, 4); // 17 + his 13-pt premium
    expect(a.stdDelta).toBeCloseTo(-0.03, 4);
    expect(a.hold).toBe(false);
    expect(a.headline).toMatch(/softening/i);
  });

  it("firming pushes to goal +8", () => {
    const a = dialAdvice("firming", GOAL, 0.2, 0.33);
    expect(a.std).toBeCloseTo(0.23, 4);
    expect(a.spec).toBeCloseTo(0.36, 4);
  });

  it("flat = the house posture (goal +5) — and reads HOLD when he's already there", () => {
    const a = dialAdvice("flat", GOAL, 0.2, 0.33);
    expect(a.std).toBeCloseTo(0.2, 4);
    expect(a.hold).toBe(true);
    expect(a.headline).toMatch(/hold/i);
  });

  it("advice never points past the dial's physical range", () => {
    // A high goal + firming + a fat premium would otherwise recommend 48%+.
    const a = dialAdvice("firming", 0.26, 0.167, 0.31);
    expect(a.std).toBeLessThanOrEqual(0.45);
    expect(a.spec).toBeLessThanOrEqual(0.45);
  });

  it("the premium never collapses below 5 pts, and advice never dips under the goal", () => {
    const a = dialAdvice("softening", GOAL, 0.16, 0.17); // premium squeezed to 1 pt
    expect(a.spec - a.std).toBeCloseTo(0.05, 4);
    expect(a.std).toBeGreaterThanOrEqual(GOAL);
  });
});
