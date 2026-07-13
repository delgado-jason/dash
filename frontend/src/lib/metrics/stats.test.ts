import { describe, it, expect } from "vitest";
import { median } from "./stats";

describe("median", () => {
  it("returns the middle of an odd-length list", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the two middle values of an even-length list", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("ignores an outlier that a mean would chase", () => {
    // mean = 25.4, median = 18 — the 61 doesn't move it.
    expect(median([12, 14, 18, 22, 61])).toBe(18);
  });

  it("returns null for an empty list", () => {
    expect(median([])).toBeNull();
  });

  it("does not mutate the input", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });
});
