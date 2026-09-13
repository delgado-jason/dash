import { describe, it, expect } from "vitest";
import { reviewWindow } from "./monthlyReview";

const NOW = new Date("2026-09-04T12:00:00Z");

describe("reviewWindow", () => {
  it("90 days ending on the month's last day; label carries the end date", () => {
    const w = reviewWindow("2026-08", NOW);
    expect(w.endKey).toBe("2026-08-31");
    expect(w.startKey).toBe("2026-06-03");
    expect(w.label).toBe("QUARTER ENDING AUG 31 ’26");
  });

  it("the current month clamps to today — no judging unfinished days", () => {
    const w = reviewWindow("2026-09", NOW);
    expect(w.endKey).toBe("2026-09-04");
    expect(w.startKey).toBe("2026-06-07");
    expect(w.label).toBe("QUARTER ENDING SEP 4 ’26");
  });

  it("a wholly-future month also clamps to today rather than inventing days", () => {
    const w = reviewWindow("2026-12", NOW);
    expect(w.endKey).toBe("2026-09-04");
  });
});
