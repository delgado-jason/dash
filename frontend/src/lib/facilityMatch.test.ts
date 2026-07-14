import { describe, it, expect } from "vitest";
import type { Facility } from "@/types/facility";
import {
  normalizeFacilityName,
  findDuplicate,
  facilityLabel,
  possibleDuplicates,
} from "./facilityMatch";

describe("normalizeFacilityName", () => {
  it("collapses the Inc/LLC/comma variants to one key", () => {
    expect(normalizeFacilityName("ABC Manufacturing Inc")).toBe("abc manufacturing");
    expect(normalizeFacilityName("ABC Manufacturing, LLC")).toBe("abc manufacturing");
    expect(normalizeFacilityName("ABC Manufacturing")).toBe("abc manufacturing");
  });

  it("strips stacked suffixes and extra punctuation", () => {
    expect(normalizeFacilityName("Smith & Sons Co.")).toBe("smith sons");
    expect(normalizeFacilityName("Foundry Co Inc")).toBe("foundry");
  });

  it("doesn't strip a suffix that's part of a word", () => {
    expect(normalizeFacilityName("Costco")).toBe("costco");
  });
});

const F = (o: Partial<Facility>): Facility =>
  ({ kind: "business", name: null, address: null, city: "", state: "", ...o }) as Facility;

describe("findDuplicate", () => {
  const existing = [
    F({ facility_id: "1", name: "ABC Manufacturing", city: "Chicago", state: "IL" }),
    F({ facility_id: "2", kind: "job_site", address: "1420 Construction Pkwy", city: "Houston", state: "TX" }),
  ];

  it("matches a business across a legal-suffix variant", () => {
    const hit = findDuplicate(existing, {
      kind: "business",
      name: "ABC Manufacturing, LLC",
      address: null,
      city: "Chicago",
      state: "IL",
    });
    expect(hit?.facility_id).toBe("1");
  });

  it("does not match the same name in a different city", () => {
    expect(
      findDuplicate(existing, {
        kind: "business",
        name: "ABC Manufacturing",
        address: null,
        city: "Dallas",
        state: "TX",
      }),
    ).toBeNull();
  });

  it("keys job sites on address — same address matches, different doesn't", () => {
    expect(
      findDuplicate(existing, {
        kind: "job_site",
        name: null,
        address: "1420 Construction Pkwy",
        city: "Houston",
        state: "TX",
      })?.facility_id,
    ).toBe("2");
    expect(
      findDuplicate(existing, {
        kind: "job_site",
        name: null,
        address: "88 Other St",
        city: "Houston",
        state: "TX",
      }),
    ).toBeNull();
  });

  it("returns null with nothing typed yet", () => {
    expect(
      findDuplicate(existing, { kind: "business", name: "", address: null, city: "Chicago", state: "IL" }),
    ).toBeNull();
  });
});

describe("possibleDuplicates", () => {
  it("clusters the variants and leaves singletons out", () => {
    const facs = [
      F({ facility_id: "1", name: "ABC Manufacturing", city: "Chicago", state: "IL" }),
      F({ facility_id: "2", name: "ABC Manufacturing Inc", city: "Chicago", state: "IL" }),
      F({ facility_id: "3", name: "ABC Manufacturing", city: "Dallas", state: "TX" }), // diff city
      F({ facility_id: "4", name: "Nucor", city: "Decatur", state: "AL" }),
    ];
    const clusters = possibleDuplicates(facs);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].map((f) => f.facility_id).sort()).toEqual(["1", "2"]);
  });

  it("clusters job sites by address", () => {
    const facs = [
      F({ facility_id: "1", kind: "job_site", address: "1420 Construction Pkwy", city: "Houston", state: "TX" }),
      F({ facility_id: "2", kind: "job_site", address: "1420 Construction Parkway", city: "Houston", state: "TX" }),
    ];
    // "Pkwy" vs "Parkway" won't collapse (no abbrev expansion in v1) — distinct keys
    expect(possibleDuplicates(facs)).toHaveLength(0);
    // but identical address does cluster
    facs[1].address = "1420 Construction Pkwy";
    expect(possibleDuplicates(facs)).toHaveLength(1);
  });
});

describe("facilityLabel", () => {
  it("uses the name, falling back to the address for a nameless job site", () => {
    expect(facilityLabel({ name: "ABC", address: null })).toBe("ABC");
    expect(facilityLabel({ name: null, address: "1420 Construction Pkwy" })).toBe(
      "1420 Construction Pkwy",
    );
  });
});
