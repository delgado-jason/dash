import { describe, it, expect } from "vitest";
import { formatDoctype } from "./formatDoctype";

describe("formatDoctype", () => {
  it("uppercases and de-hyphenates", () => {
    expect(formatDoctype("load-confirmation")).toBe("LOAD CONFIRMATION");
    expect(formatDoctype("pod")).toBe("POD");
    expect(formatDoctype("tx-oversize-permit")).toBe("TX OVERSIZE PERMIT");
  });

  it("collapses repeated hyphens", () => {
    expect(formatDoctype("trip--sheet")).toBe("TRIP SHEET");
  });

  it("falls back on empty/whitespace input", () => {
    expect(formatDoctype("")).toBe("DOCUMENT");
    expect(formatDoctype("   ")).toBe("DOCUMENT");
  });
});
