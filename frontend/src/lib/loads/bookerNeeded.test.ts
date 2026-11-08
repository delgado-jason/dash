import { describe, expect, it } from "vitest";
import { BOOKER_REQUIRED, bookerNeeded } from "./bookerNeeded";

describe("GL-106 · bookerNeeded", () => {
  it("names the sentence when the booker is missing, null or blank", () => {
    expect(bookerNeeded(null)).toBe(BOOKER_REQUIRED);
    expect(bookerNeeded(undefined)).toBe(BOOKER_REQUIRED);
    expect(bookerNeeded("  ")).toBe(BOOKER_REQUIRED);
  });
  it("is quiet once someone is chosen", () => {
    expect(bookerNeeded("7d0f6a52-3a6f-4142-8e6d-5f6071829304")).toBeNull();
  });
  it("is the sentence Jason nodded", () => {
    expect(BOOKER_REQUIRED).toBe(
      "Every load needs its booker — the scoreboard, the card and the Recap all split loads by who booked them.",
    );
  });
});
