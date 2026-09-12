import { describe, it, expect } from "vitest";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { suggestTier, suggestBucket, bandLabel, isEstablished, suggestionLabel } from "./tierSuggestion";

// July's marks from the nod sheet.
const LADDER: RateLadder = { walkAway: 4.1, minimum: 4.71, target: 5.53, strong: 6.55 };

describe("suggestTier — the ladder's own steps", () => {
  it("grades the four established agents the way the nod sheet drew them", () => {
    expect(suggestTier(8.16, LADDER)).toBe(1); // Brian — above Strong
    expect(suggestTier(6.94, LADDER)).toBe(1); // Eric — above Strong (still Tier 1: Tier 1 ≥ Target)
    expect(suggestTier(5.01, LADDER)).toBe(2); // Mike — above Minimum, under Target
    expect(suggestTier(4.51, LADDER)).toBe(3); // Drew — above Walk-away, under Minimum
  });

  it("under walk-away is 'below' — a red flag, not a tier", () => {
    expect(suggestTier(4.0, LADDER)).toBe("below");
  });

  it("each step is inclusive at its own mark", () => {
    expect(suggestTier(5.53, LADDER)).toBe(1);
    expect(suggestTier(4.71, LADDER)).toBe(2);
    expect(suggestTier(4.1, LADDER)).toBe(3);
    expect(suggestTier(4.0999, LADDER)).toBe("below");
  });

  it("no RPM or no ladder → null, never a default tier", () => {
    expect(suggestTier(null, LADDER)).toBeNull();
    expect(suggestTier(6, null)).toBeNull();
    expect(suggestTier(6, undefined)).toBeNull();
    expect(suggestTier(6, { walkAway: null, minimum: null, target: null, strong: null })).toBeNull();
  });
});

describe("suggestBucket — established → band, otherwise Prospect / Parked", () => {
  const active = { work_status: "active" as const };

  it("three delivered loads is the gate", () => {
    expect(isEstablished(3)).toBe(true);
    expect(isEstablished(2)).toBe(false);
    expect(suggestBucket(active, { deliveredCount: 3, rpm: 5.01, ladder: LADDER, dormant: false })).toBe("tier2");
    expect(suggestBucket(active, { deliveredCount: 2, rpm: 8.0, ladder: LADDER, dormant: false })).toBe("prospect");
  });

  it("an established agent under walk-away is 'below'; with no ladder there is no verdict", () => {
    expect(suggestBucket(active, { deliveredCount: 4, rpm: 3.9, ladder: LADDER, dormant: false })).toBe("below");
    expect(suggestBucket(active, { deliveredCount: 4, rpm: 3.9, ladder: null, dormant: false })).toBeNull();
    expect(suggestBucket(active, { deliveredCount: 4, rpm: null, ladder: LADDER, dormant: false })).toBeNull();
  });

  it("a dormant, not-yet-established agent is suggested Parked", () => {
    expect(suggestBucket(active, { deliveredCount: 1, rpm: 6, ladder: LADDER, dormant: true })).toBe("parked");
  });

  it("an agent the owner parked stays parked whatever the numbers say", () => {
    expect(suggestBucket({ work_status: "parked" }, { deliveredCount: 9, rpm: 9, ladder: LADDER, dormant: false })).toBe("parked");
  });
});

describe("bandLabel / suggestionLabel — the evidence in words", () => {
  it("names the step the RPM cleared", () => {
    expect(bandLabel(6.94, LADDER)).toBe("above Strong");
    expect(bandLabel(5.6, LADDER)).toBe("above Target");
    expect(bandLabel(5.01, LADDER)).toBe("above Minimum");
    expect(bandLabel(4.51, LADDER)).toBe("above Walk-away");
    expect(bandLabel(4.0, LADDER)).toBe("under Walk-away");
    expect(bandLabel(null, LADDER)).toBeNull();
    expect(bandLabel(5, null)).toBeNull();
  });

  it("a ladder with no Strong mark still grades — the top band is 'above Target'", () => {
    const noStrong: RateLadder = { ...LADDER, strong: null };
    expect(bandLabel(8.16, noStrong)).toBe("above Target");
    expect(bandLabel(5.01, noStrong)).toBe("above Minimum");
    expect(suggestTier(8.16, noStrong)).toBe(1);
  });

  it("chips read Tier 1 / Prospect / Losing money", () => {
    expect(suggestionLabel("tier1")).toBe("Tier 1");
    expect(suggestionLabel("prospect")).toBe("Prospect");
    expect(suggestionLabel("below")).toBe("Losing money");
    expect(suggestionLabel(null)).toBeNull();
  });
});
