import { describe, it, expect } from "vitest";
import { getRatingLabel } from "./ratingLabels";

describe("getRatingLabel", () => {
  it("displays the label associated with the rating", () => {
    const result = getRatingLabel(1);

    expect(result).toBe("1 - Blacklist");
  });
});
