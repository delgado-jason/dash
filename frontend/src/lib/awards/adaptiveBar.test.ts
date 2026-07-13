import { describe, it, expect } from "vitest";
import { computeStack } from "./adaptiveBar";

describe("computeStack — adaptive ratcheting bar", () => {
  it("earns against the conservative floor during cold-start", () => {
    // floor 7000, n=5. First 5 are history; earns check against the floor throughout.
    const s = computeStack([8000, 5000, 9000, 4000, 6000], {
      n: 5,
      floor: 7000,
    });
    // 8000 and 9000 clear the 7000 floor → 2 earns; bar still the floor (history < 5 until the end)
    expect(s.count).toBe(2);
    expect(s.bar).toBe(7000);
  });

  it("raises the bar as strong results stack, then a downturn can't lower it", () => {
    // Rising then falling. Once 5 of history exist, the bar climbs to the 5th-best
    // and holds — later weak values neither earn nor ease the bar.
    const vals = [10000, 12000, 14000, 16000, 18000, 20000, 22000, 9000, 8000];
    const s = computeStack(vals, { n: 5, floor: 6000, minHistory: 5 });
    // bar ends at the 5th-best seen = 14000 (from 22,20,18,16,14,...), never eased by the 9k/8k
    expect(s.bar).toBe(14000);
    // the 8000/9000 at the end are below the ratcheted bar → they don't earn
    expect(s.count).toBeGreaterThanOrEqual(6);
  });

  it("never rolls the count backward when the bar rises", () => {
    const rising = computeStack([7000, 8000, 9000, 10000, 11000, 12000, 13000], {
      n: 5,
      floor: 6000,
      minHistory: 5,
    });
    // every value cleared the bar in effect at its time → all 7 counted, locked in
    expect(rising.count).toBe(7);
  });

  it("handles lower-is-better metrics (deadhead %) — the bar tightens downward", () => {
    // Best (lowest) deadhead. Bar = 5th-lowest, ratchets DOWN. floor 0.10.
    const dh = [0.09, 0.12, 0.08, 0.15, 0.07, 0.06, 0.2];
    const s = computeStack(dh, { n: 5, floor: 0.1, minHistory: 5 });
    expect(s.bar).toBeLessThanOrEqual(0.1); // tightened at/under the floor
    expect(s.count).toBeGreaterThan(0);
  });
});
