import { describe, it, expect } from "vitest";
import {
  tiersFrom,
  specTiersFrom,
  marginGoalFrom,
  STD_TIERS,
  SPEC_TIERS,
  MARGIN_GOAL,
} from "./targets";

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
    expect(tiersFrom(s)).toEqual({ minimum: 0.05, target: 0.18, strong: 0.4 });
    expect(specTiersFrom(s)).toEqual({ minimum: 0.9, target: 0.95, strong: 0.99 });
  });

  it("fills only the missing tier from the default, keeps the rest", () => {
    const t = tiersFrom({ rate_tier_std_target: 0.25 });
    expect(t.target).toBe(0.25);
    expect(t.minimum).toBe(STD_TIERS.minimum);
    expect(t.strong).toBe(STD_TIERS.strong);
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
