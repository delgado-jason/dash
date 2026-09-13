import { describe, it, expect } from "vitest";
import { otherCodes } from "./otherCodes";

describe("otherCodes", () => {
  it("drops the agency's own code and sorts the rest — Momentum's other desks", () => {
    // Dry run on prod data: JVL → {JVL, JXO, SUH, SUU}.
    expect(
      otherCodes({ agency_code: "JVL", posting_codes: ["JVL", "JXO", "SUH", "SUU"] }),
    ).toEqual(["JXO", "SUH", "SUU"]);
  });

  it("sorts whatever order the row arrived in — CPL's agents", () => {
    // {CJY, CPL, MAM} for CPL → [CJY, MAM].
    expect(otherCodes({ agency_code: "CPL", posting_codes: ["MAM", "CPL", "CJY"] })).toEqual([
      "CJY",
      "MAM",
    ]);
  });

  it("is empty when the set is empty — a brand-new agency has posted nothing", () => {
    expect(otherCodes({ agency_code: "EWT", posting_codes: [] })).toEqual([]);
  });

  it("is empty when the set holds only the agency's own code", () => {
    expect(otherCodes({ agency_code: "LLL", posting_codes: ["LLL"] })).toEqual([]);
  });

  it("trims and dedupes — the same desk twice is one chip", () => {
    expect(
      otherCodes({ agency_code: " CPL ", posting_codes: [" MAM ", "MAM", "CPL", "", "   "] }),
    ).toEqual(["MAM"]);
  });

  it("has an answer for no agency at all, and for a row with no set", () => {
    expect(otherCodes(null)).toEqual([]);
    expect(otherCodes(undefined)).toEqual([]);
    expect(otherCodes({})).toEqual([]);
    expect(otherCodes({ agency_code: "CPL" })).toEqual([]);
    expect(otherCodes({ agency_code: "CPL", posting_codes: null })).toEqual([]);
  });

  it("keeps every code when the agency has no code of its own", () => {
    expect(otherCodes({ agency_code: null, posting_codes: ["MAM", "CJY"] })).toEqual([
      "CJY",
      "MAM",
    ]);
  });
});
