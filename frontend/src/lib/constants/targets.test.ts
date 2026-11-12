import { describe, it, expect } from "vitest";
import {
  tiersFrom,
  specTiersFrom,
  marginGoalFrom,
  marginAtMarkup,
  STD_TIERS,
  SPEC_TIERS,
  MARGIN_GOAL,
} from "./targets";

describe("marginAtMarkup — the margin a rung earns", () => {
  it("JASON'S OWN TIERS LAND ON EXACT FIVE-POINT STEPS", () => {
    // Read off prod 2026-11-12. These are not round numbers by accident — the
    // multipliers were chosen to hit round margins, which is why a rung can be
    // labelled with its percentage and be worth reading.
    const std = { minimum: 0.177, target: 0.25, prime: 0.333 };
    const spec = { minimum: 0.389, target: 0.493, prime: 0.613 };
    expect(marginAtMarkup(std.minimum)).toBeCloseTo(0.15, 3);
    expect(marginAtMarkup(std.target)).toBeCloseTo(0.2, 4);
    expect(marginAtMarkup(std.prime)).toBeCloseTo(0.25, 3);
    expect(marginAtMarkup(spec.minimum)).toBeCloseTo(0.28, 3);
    expect(marginAtMarkup(spec.target)).toBeCloseTo(0.33, 3);
    expect(marginAtMarkup(spec.prime)).toBeCloseTo(0.38, 3);
  });

  it("his standard MINIMUM rung is his 15% margin goal — within 5 basis points", () => {
    // The reason "Minimum" can be labelled "15% margin" without lying. The exact
    // multiplier for a 15% margin is 0.15/0.85 = 0.17647; he has 0.177 stored.
    expect(marginAtMarkup(0.15 / 0.85)).toBeCloseTo(0.15, 10);
    expect(Math.abs(marginAtMarkup(0.177) - 0.15)).toBeLessThan(0.0005);
  });

  it("DOES NOT DEPEND ON COST OR THE CARRIER'S KEEP — they cancel", () => {
    // The claim the whole feature rests on. Derive the margin the long way from
    // wildly different costs and keeps; the markup alone decides it.
    for (const markup of [0.1, 0.177, 0.35, 0.613, 1.5]) {
      const want = marginAtMarkup(markup);
      for (const cost of [1.5, 3.0985, 9.4]) {
        for (const keep of [0.5, 0.73, 0.767969, 1]) {
          const breakEvenGross = cost / keep;
          const gross = breakEvenGross * (1 + markup);
          const net = gross * keep;
          expect((net - cost) / net).toBeCloseTo(want, 12);
        }
      }
    }
  });

  it("break-even earns nothing, and the margin rises with the markup but never reaches 1", () => {
    expect(marginAtMarkup(0)).toBe(0);
    let last = -1;
    for (const m of [0, 0.1, 0.5, 1, 10, 1000]) {
      const g = marginAtMarkup(m);
      expect(g).toBeGreaterThan(last);
      expect(g).toBeLessThan(1);
      last = g;
    }
  });
});

describe("tiersFrom / specTiersFrom", () => {
  it("falls back to the seed defaults when nothing is saved", () => {
    expect(tiersFrom(null)).toEqual(STD_TIERS);
    expect(tiersFrom(undefined)).toEqual(STD_TIERS);
    expect(specTiersFrom(null)).toEqual(SPEC_TIERS);
  });

  it("reads the standard set from its own columns", () => {
    const s = {
      rate_tier_std_min: 0.05,
      rate_tier_std_target: 0.18,
      rate_tier_std_strong: 0.4,
      // specialized columns present but must NOT leak into the standard set
      rate_tier_spec_min: 0.9,
      rate_tier_spec_target: 0.95,
      rate_tier_spec_strong: 0.99,
    };
    expect(tiersFrom(s)).toEqual({ minimum: 0.05, target: 0.18, prime: 0.4 });
    expect(specTiersFrom(s)).toEqual({ minimum: 0.9, target: 0.95, prime: 0.99 });
  });

  it("fills only the missing tier from the default, keeps the rest", () => {
    const t = tiersFrom({ rate_tier_std_target: 0.25 });
    expect(t.target).toBe(0.25);
    expect(t.minimum).toBe(STD_TIERS.minimum);
    expect(t.prime).toBe(STD_TIERS.prime);
  });

  it("ignores non-finite / null values (uses the default)", () => {
    const t = tiersFrom({
      rate_tier_std_min: null,
      rate_tier_std_target: NaN as unknown as number,
    });
    expect(t.minimum).toBe(STD_TIERS.minimum);
    expect(t.target).toBe(STD_TIERS.target);
  });
});

describe("marginGoalFrom", () => {
  it("defaults when unset", () => {
    expect(marginGoalFrom(null)).toBe(MARGIN_GOAL);
    expect(marginGoalFrom({})).toBe(MARGIN_GOAL);
  });

  it("reads a saved margin", () => {
    expect(marginGoalFrom({ margin_goal: 0.3 })).toBe(0.3);
  });

  it("clamps to [0, 0.95] so the revenue uplift can't blow up", () => {
    expect(marginGoalFrom({ margin_goal: -0.5 })).toBe(0);
    expect(marginGoalFrom({ margin_goal: 1.5 })).toBe(0.95);
  });
});
