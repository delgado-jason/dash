import { describe, it, expect } from "vitest";
import { rpmTextClass } from "./rpmStyle";

describe("rpmTextClass — the live ladder decides (2026-11-04)", () => {
  const ladder = { walkAway: 5.89, strong: 7.66 }; // the net ladder on the Nov 4 basis
  it("grades against the ladder it is handed", () => {
    expect(rpmTextClass(8.0, ladder)).toBe("text-status-positive-text");
    expect(rpmTextClass(6.0, ladder)).toBe("text-status-aware-text");
    expect(rpmTextClass(5.0, ladder)).toBe("text-status-negative-text");
  });
  it("a rate that the seeds would call strong is below a live walk-away", () => {
    expect(rpmTextClass(3.5)).toBe("text-status-positive-text"); // seeds: 2.96 / 3.20
    expect(rpmTextClass(3.5, ladder)).toBe("text-status-negative-text");
  });
  it("a ladder with no rungs yet falls back to the seeds; null is muted", () => {
    expect(rpmTextClass(3.5, { walkAway: null, strong: null })).toBe("text-status-positive-text");
    expect(rpmTextClass(null, ladder)).toBe("text-muted-text");
  });
});
