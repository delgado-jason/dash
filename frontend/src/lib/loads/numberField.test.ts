import { describe, it, expect } from "vitest";
import { numberFieldValue } from "./numberField";
import { scoreLoad } from "@/lib/metrics/loadScore";

describe("numberFieldValue", () => {
  it("an emptied box is null, not 0", () => {
    expect(numberFieldValue("")).toBeNull();
    expect(numberFieldValue("   ")).toBeNull();
  });

  it("a typed zero IS zero — it is a real answer", () => {
    // A 0 deadhead means the truck was already at the shipper. Only an empty
    // box is a refusal, and the two must not collapse into each other.
    expect(numberFieldValue("0")).toBe(0);
    expect(numberFieldValue("0.0")).toBe(0);
  });

  it("keeps real numbers, including decimals and negatives", () => {
    expect(numberFieldValue("1234")).toBe(1234);
    expect(numberFieldValue("12.5")).toBe(12.5);
    expect(numberFieldValue("-5")).toBe(-5);
  });

  it("letters are not a measurement either", () => {
    expect(numberFieldValue("abc")).toBeNull();
    expect(numberFieldValue("12abc")).toBeNull();
  });
});

// The whole point of the helper, pinned end to end: what the form writes
// decides whether the booked grade is willing to grade at all.
describe("the chain: an erased box must not become a graded load", () => {
  const BASIS = { costPerDrivenMile: 2.5, payTake: 0.73 };
  const score = (deadhead: number | null) =>
    scoreLoad({ rate: 5000, loadedMiles: 1000, deadheadMiles: deadhead }, BASIS);

  it("an ERASED deadhead box leaves the load ungraded", () => {
    const written = numberFieldValue(""); // what the form now saves
    expect(written).toBeNull();
    const g = score(written);
    expect(g.verdict).toBeNull();
    expect(g.missing.length).toBeGreaterThan(0);
  });

  it("a TYPED zero grades it, because zero is an answer", () => {
    const written = numberFieldValue("0");
    expect(written).toBe(0);
    expect(score(written).verdict).not.toBeNull();
  });

  it("the bug, stated: saving 0 for an erasure would have graded it", () => {
    // `Number("")` is 0 — the old handleChange. This is the line that turned
    // "I don't know" into a confident SCRAP / THIN / SOLID / PRIME.
    expect(Number("")).toBe(0);
    expect(score(Number("")).verdict).not.toBeNull();
  });
});
