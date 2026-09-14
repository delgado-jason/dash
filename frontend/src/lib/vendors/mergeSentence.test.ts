import { describe, it, expect } from "vitest";
import { mergeSentence } from "./mergeSentence";
import type { UnfiledShop } from "@/types/unfiledShop";

const row = (over: Partial<UnfiledShop>): UnfiledShop => ({
  name: "Rays Tire Shop",
  service_count: 1,
  total_spend: null,
  last_service: null,
  units: [],
  ...over,
});

describe("mergeSentence — what the merge will do to the log", () => {
  it("one row: the day and the money, no 'last'", () => {
    expect(
      mergeSentence(
        row({ service_count: 1, total_spend: "1562.13", last_service: "2026-08-28" }),
        "Ray's Tire Service",
      ),
    ).toBe("1 log row (Aug 28, $1,562.13) will read Ray's Tire Service.");
  });

  it("several rows: the LAST day and the money in all", () => {
    expect(
      mergeSentence(
        row({ service_count: 2, total_spend: "865.37", last_service: "2026-07-02" }),
        "TA Petro",
      ),
    ).toBe("2 log rows (last Jul 2, $865.37 in all) will read TA Petro.");
  });

  it("no money on any of them: the dollars are omitted, never $0", () => {
    expect(
      mergeSentence(
        row({ service_count: 1, total_spend: null, last_service: "2026-08-28" }),
        "Ray's Tire Service",
      ),
    ).toBe("1 log row (Aug 28) will read Ray's Tire Service.");
    expect(
      mergeSentence(
        row({ service_count: 3, total_spend: null, last_service: "2026-07-02" }),
        "TA Petro",
      ),
    ).toBe("3 log rows (last Jul 2) will read TA Petro.");
  });

  it("nothing to say in the parentheses drops them entirely", () => {
    expect(mergeSentence(row({ service_count: 1 }), "TA Petro")).toBe(
      "1 log row will read TA Petro.",
    );
  });

  it("the day comes off the ISO string, not off a local Date", () => {
    // A DATE that arrives as a local-midnight timestamp still reads Aug 1 —
    // new Date(iso).getDate() in a US zone would say Jul 31.
    expect(
      mergeSentence(
        row({ service_count: 1, last_service: "2026-08-01T00:00:00.000Z" }),
        "TA Petro",
      ),
    ).toBe("1 log row (Aug 1) will read TA Petro.");
    expect(
      mergeSentence(row({ service_count: 1, last_service: "2026-01-31" }), "TA Petro"),
    ).toBe("1 log row (Jan 31) will read TA Petro.");
  });

  it("numeric arrives as a STRING and is coerced before it is formatted", () => {
    expect(
      mergeSentence(row({ service_count: 1, total_spend: "0.00" }), "TA Petro"),
    ).toBe("1 log row ($0.00) will read TA Petro.");
  });
});
