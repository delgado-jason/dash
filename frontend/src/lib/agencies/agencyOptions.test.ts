import { describe, it, expect } from "vitest";
import { agencyLabel, agencyOptions } from "./agencyOptions";

const agency = (agency_id: string, agency_code: string, name: string | null = null) => ({
  agency_id,
  agency_code,
  name,
});

describe("agencyLabel", () => {
  it("leads with the code and adds the name once a bill gives one", () => {
    expect(agencyLabel(agency("1", "CPL", "Central Pennsylvania Logistics Inc"))).toBe(
      "CPL · Central Pennsylvania Logistics Inc",
    );
  });

  it("is the bare code while the name is null — no separator, no empty tail", () => {
    expect(agencyLabel(agency("2", "EWT"))).toBe("EWT");
  });

  it("treats a blank name as no name at all", () => {
    expect(agencyLabel(agency("3", "LAN", ""))).toBe("LAN");
    expect(agencyLabel(agency("4", "SRY", "   "))).toBe("SRY");
    expect(agencyLabel({ agency_id: "5", agency_code: "JVL" })).toBe("JVL");
  });
});

describe("agencyOptions", () => {
  it("carries the agency_id as the value and the label beside it", () => {
    expect(agencyOptions([agency("a1", "CPL", "Central Pennsylvania Logistics Inc")])).toEqual([
      { value: "a1", label: "CPL · Central Pennsylvania Logistics Inc" },
    ]);
  });

  it("keeps the API's order — named agencies first, the unnamed after by code", () => {
    // Exactly what `ORDER BY name ASC NULLS LAST, agency_code ASC` returns.
    const fromApi = [
      agency("a1", "CPL", "Central Pennsylvania Logistics Inc"),
      agency("a2", "JVL", "Momentum Transportation"),
      agency("a3", "AIP"),
      agency("a4", "EWT"),
    ];
    expect(agencyOptions(fromApi).map((o) => o.label)).toEqual([
      "CPL · Central Pennsylvania Logistics Inc",
      "JVL · Momentum Transportation",
      "AIP",
      "EWT",
    ]);
  });

  it("does NOT re-sort: a list handed over out of order comes back out of order", () => {
    // A local `localeCompare` on `name ?? agency_code` would put AIP first and
    // interleave the unnamed with the named. The helper must not.
    const outOfOrder = [
      agency("a4", "EWT"),
      agency("a1", "CPL", "Central Pennsylvania Logistics Inc"),
      agency("a3", "AIP"),
    ];
    expect(agencyOptions(outOfOrder).map((o) => o.value)).toEqual(["a4", "a1", "a3"]);
  });

  it("has an answer for an empty book, and for no list at all", () => {
    expect(agencyOptions([])).toEqual([]);
    expect(agencyOptions(null)).toEqual([]);
    expect(agencyOptions(undefined)).toEqual([]);
  });
});
