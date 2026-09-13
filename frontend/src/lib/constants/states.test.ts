import { describe, it, expect } from "vitest";
import { STATES, UNKNOWN_REGION, getRegion, litFor, statesInRegion } from "./states";

// Issue #228 — the highlighted-state set behind "click a region row, light
// that region up on the map".
describe("statesInRegion", () => {
  it("returns every state in the region, by the full name the map keys on", () => {
    const southeast = statesInRegion("Southeast");
    expect(southeast.has("Georgia")).toBe(true);
    expect(southeast.has("South Carolina")).toBe(true);
    expect(southeast.has("Virginia")).toBe(true);
    expect(southeast.has("Texas")).toBe(false); // Texas is Gulf
  });

  it("returns abbreviation-free names — never the 2-letter codes", () => {
    expect(statesInRegion("New England").has("ME")).toBe(false);
    expect(statesInRegion("New England").has("Maine")).toBe(true);
  });

  it("agrees with getRegion for every state on file", () => {
    for (const [abbr, info] of Object.entries(STATES)) {
      expect(statesInRegion(getRegion(abbr)).has(info.name)).toBe(true);
    }
  });

  it("covers each region exactly once — the sets partition the country", () => {
    const regions = new Set(Object.values(STATES).map((s) => s.region));
    let total = 0;
    for (const r of regions) total += statesInRegion(r).size;
    expect(total).toBe(Object.keys(STATES).length);
  });

  it("highlights nothing for a blank, unknown, or Unknown region", () => {
    expect(statesInRegion(null).size).toBe(0);
    expect(statesInRegion(undefined).size).toBe(0);
    expect(statesInRegion("").size).toBe(0);
    expect(statesInRegion(UNKNOWN_REGION).size).toBe(0);
    expect(statesInRegion("Atlantis").size).toBe(0);
  });

  it("hands back a fresh set each call — a caller can't poison the table", () => {
    const a = statesInRegion("Gulf");
    a.add("Atlantis");
    expect(statesInRegion("Gulf").has("Atlantis")).toBe(false);
  });
});

// The predicate both boards ask — the SVG fallback and the WebGL board must
// light the same shapes, however differently they paint them.
describe("litFor", () => {
  it("lights the states of the open region and nothing else", () => {
    const lit = statesInRegion("Southeast");
    expect(litFor("Georgia", lit)).toBe(true);
    expect(litFor("Virginia", lit)).toBe(true);
    expect(litFor("Texas", lit)).toBe(false);
  });

  it("lights nothing when no region is open", () => {
    expect(litFor("Georgia", null)).toBe(false);
    expect(litFor("Georgia", undefined)).toBe(false);
    expect(litFor("Georgia", new Set())).toBe(false);
  });

  it("keys on the map's full names, never the 2-letter code", () => {
    const lit = statesInRegion("New England");
    expect(litFor("Maine", lit)).toBe(true);
    expect(litFor("ME", lit)).toBe(false);
  });
});
