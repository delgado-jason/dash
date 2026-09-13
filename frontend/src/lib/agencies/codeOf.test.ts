import { describe, it, expect } from "vitest";
import { codeOf } from "./codeOf";

describe("codeOf", () => {
  it("prefers the agent's own posting code — theirs, not the desk's", () => {
    // Eric Hesketh posts MAM out of Central Pennsylvania Logistics (CPL).
    expect(codeOf({ posting_code: "MAM", agency_code: "CPL" })).toEqual({
      code: "MAM",
      kind: "posting",
    });
  });

  it("falls back to the agency code when they post from the desk", () => {
    // Rich Stewart has no code of his own — he posts from CPL itself.
    expect(codeOf({ posting_code: null, agency_code: "CPL" })).toEqual({
      code: "CPL",
      kind: "agency",
    });
    expect(codeOf({ agency_code: "LLL" })).toEqual({ code: "LLL", kind: "agency" });
  });

  it("lights the chip when the posting code IS the agency code — the shared desk", () => {
    // Rich Stewart's row carries CPL on both sides (the backfill wrote the
    // desk's code onto the person who posts from it). He is AT the desk, so
    // the chip is lit, not dashed.
    expect(codeOf({ posting_code: "CPL", agency_code: "CPL" })).toEqual({
      code: "CPL",
      kind: "agency",
    });
    // Padding on either side doesn't make it a different code.
    expect(codeOf({ posting_code: " CPL ", agency_code: "CPL" })).toEqual({
      code: "CPL",
      kind: "agency",
    });
  });

  it("returns null when neither is on file — a prospect wears NO CODE", () => {
    expect(codeOf({ posting_code: null, agency_code: null })).toBeNull();
    expect(codeOf({})).toBeNull();
  });

  it("treats blank and whitespace as not on file, on either side", () => {
    expect(codeOf({ posting_code: "   ", agency_code: "CPL" })).toEqual({
      code: "CPL",
      kind: "agency",
    });
    expect(codeOf({ posting_code: "", agency_code: "  " })).toBeNull();
  });

  it("trims a code that arrived with padding", () => {
    expect(codeOf({ posting_code: " MAM " })).toEqual({ code: "MAM", kind: "posting" });
    expect(codeOf({ agency_code: " CPL " })).toEqual({ code: "CPL", kind: "agency" });
  });

  it("has an answer for no agent at all", () => {
    expect(codeOf(null)).toBeNull();
    expect(codeOf(undefined)).toBeNull();
  });
});
