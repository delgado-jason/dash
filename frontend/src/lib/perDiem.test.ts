import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { PerDiemStatus } from "@/types/perDiem";
import {
  inferredOutDays,
  effectiveStatus,
  computePerDiem,
  nextStatus,
} from "./perDiem";

const L = (o: Record<string, unknown>): Load =>
  ({ load_status: "delivered", ...o }) as unknown as Load;

describe("inferredOutDays", () => {
  it("covers every day of a multi-day delivered haul, within the year and up to cap", () => {
    const loads = [L({ pickup_date: "2026-03-02", delivery_date: "2026-03-05" })];
    const set = inferredOutDays(loads, 2026, new Date(2026, 11, 31));
    expect([...set].sort()).toEqual([
      "2026-03-02",
      "2026-03-03",
      "2026-03-04",
      "2026-03-05",
    ]);
  });

  it("stops at the cap (today) and ignores other years / non-delivered", () => {
    const loads = [
      L({ pickup_date: "2026-07-13", delivery_date: "2026-07-18" }), // spans past cap
      L({ pickup_date: "2025-12-30", delivery_date: "2026-01-02" }), // prior-year tail
      L({ load_status: "booked", pickup_date: "2026-07-01", delivery_date: "2026-07-01" }),
    ];
    const set = inferredOutDays(loads, 2026, new Date(2026, 6, 15)); // cap Jul 15
    expect(set.has("2026-07-13")).toBe(true);
    expect(set.has("2026-07-15")).toBe(true);
    expect(set.has("2026-07-16")).toBe(false); // past cap
    expect(set.has("2026-01-01")).toBe(true); // the 2026 part of the cross-year load
    expect(set.has("2025-12-30")).toBe(false); // other year
    expect(set.has("2026-07-01")).toBe(false); // booked, not delivered
  });
});

describe("effectiveStatus + computePerDiem", () => {
  const manual = new Map<string, PerDiemStatus>([
    ["2026-03-02", "half"], // confirmed departure day
    ["2026-03-05", "half"], // confirmed return day
    ["2026-04-10", "home"], // overrode an inferred out-day to home
  ]);
  const inferred = new Set<string>([
    "2026-03-02",
    "2026-03-03",
    "2026-03-04",
    "2026-03-05",
    "2026-04-10", // inferred out, but manually set home
    "2026-05-20", // inferred, unconfirmed
  ]);

  it("manual marks win over inference", () => {
    expect(effectiveStatus("2026-03-02", manual, inferred)).toBe("half");
    expect(effectiveStatus("2026-04-10", manual, inferred)).toBe("home");
    expect(effectiveStatus("2026-03-03", manual, inferred)).toBe("full"); // inferred
    expect(effectiveStatus("2026-06-01", manual, inferred)).toBe("home"); // nothing
  });

  it("totals full/half and counts unconfirmed inferred days", () => {
    const s = computePerDiem(manual, inferred, 69, 0.8);
    // full: 03-03, 03-04, 05-20 = 3 ; half: 03-02, 03-05 = 2 ; 04-10 is home
    expect(s.fullDays).toBe(3);
    expect(s.halfDays).toBe(2);
    // (3*69 + 2*51.75) * 0.8 = (207 + 103.5) * 0.8 = 248.4 -> 248
    expect(s.deductible).toBe(248);
    // inferred-and-unconfirmed = 03-03, 03-04 (interior of the haul, still hollow)
    // + 05-20; the bookends 03-02/03-05 and the home-override 04-10 are confirmed
    expect(s.inferredCount).toBe(3);
  });
});

describe("nextStatus cycle", () => {
  it("unmarked → full → half → home → clear", () => {
    expect(nextStatus(undefined)).toBe("full");
    expect(nextStatus("full")).toBe("half");
    expect(nextStatus("half")).toBe("home");
    expect(nextStatus("home")).toBeNull();
  });
});
