import { describe, it, expect } from "vitest";
import { getRatinglabel, RATING_OPTIONS } from "./ratingLabels";

describe("getRatingLabel", () => {
  it("displays the label associated with the rating", () => {
    const result = getRatinglabel(1);

    expect(result).toBe("1 - Blacklist");
  });
});
