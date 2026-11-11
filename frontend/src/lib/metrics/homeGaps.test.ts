import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { homeGapCandidates, daysToMark } from "./homeGaps";

const run = (pickup: string, delivery: string, over: Partial<Load> = {}): Load =>
  ({
    load_id: `${pickup}-${delivery}`,
    load_status: "delivered",
    pickup_date: pickup,
    delivery_date: delivery,
    origin_city: "Atlanta",
    origin_state: "GA",
    destination_city: "Dallas",
    destination_state: "TX",
    ...over,
  }) as Load;

const trip = (date: string, purpose: Trip["trip_purpose"]): Trip =>
  ({ trip_id: `${date}-${purpose}`, trip_date: date, trip_purpose: purpose }) as Trip;

describe("homeGapCandidates", () => {
  // Delivered Jun 1, next pickup Jun 9 → the 2nd through the 8th are candidates.
  const loads = [run("2026-05-28", "2026-06-01"), run("2026-06-09", "2026-06-12")];

  it("offers the days BETWEEN the runs, never the days worked", () => {
    const [g] = homeGapCandidates(loads, [], []);
    expect(g.days).toBe(7);
    expect(g.unmarked[0]).toBe("2026-06-02");
    expect(g.unmarked.at(-1)).toBe("2026-06-08");
    expect(g.unmarked).not.toContain("2026-06-01"); // delivered that day
    expect(g.unmarked).not.toContain("2026-06-09"); // loaded that day
  });

  it("carries the evidence it has, and is honest when it has none", () => {
    const bare = homeGapCandidates(loads, [], [])[0];
    expect(bare.homeTrip).toBe(false);
    expect(bare.droppedAt).toBe("Dallas, TX");
    expect(bare.nextPickup).toBe("Atlanta, GA");

    const withTrip = homeGapCandidates(loads, [trip("2026-06-02", "home")], [])[0];
    expect(withTrip.homeTrip).toBe(true);
  });

  it("a shop or repositioning trip is not evidence of home", () => {
    const t = [trip("2026-06-03", "shop"), trip("2026-06-04", "repositioning")];
    expect(homeGapCandidates(loads, t, [])[0].homeTrip).toBe(false);
  });

  it("a home trip outside the gap does not count", () => {
    expect(homeGapCandidates(loads, [trip("2026-06-20", "home")], [])[0].homeTrip).toBe(false);
  });

  it("skips gaps shorter than the threshold", () => {
    const tight = [run("2026-05-28", "2026-06-01"), run("2026-06-03", "2026-06-06")];
    expect(homeGapCandidates(tight, [], [])).toHaveLength(0); // 2 days
    expect(homeGapCandidates(tight, [], [], 2)).toHaveLength(1);
  });

  it("NEVER offers a negative span — the next run can start before this one ends", () => {
    // A relay: loaded on the 30th while still delivering the 1st.
    const overlap = [run("2026-05-28", "2026-06-01"), run("2026-05-30", "2026-06-04")];
    expect(homeGapCandidates(overlap, [], [])).toHaveLength(0);
  });

  it("leaves out days already marked, and says how many it found", () => {
    const g = homeGapCandidates(loads, [], ["2026-06-02", "2026-06-03"])[0];
    expect(g.days).toBe(7);
    expect(g.alreadyMarked).toBe(2);
    expect(g.unmarked).toHaveLength(5);
    expect(g.unmarked).not.toContain("2026-06-02");
  });

  it("drops a stretch that is already fully marked — nothing left to offer", () => {
    const all = ["02", "03", "04", "05", "06", "07", "08"].map((d) => `2026-06-${d}`);
    expect(homeGapCandidates(loads, [], all)).toHaveLength(0);
  });

  it("ignores loads that were never delivered or have no dates", () => {
    const messy = [
      run("2026-05-28", "2026-06-01"),
      run("2026-06-03", "2026-06-05", { load_status: "cancelled" }),
      run("2026-06-09", "2026-06-12"),
    ];
    // The cancelled middle run must not split the gap.
    const gaps = homeGapCandidates(messy, [], []);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].days).toBe(7);
  });

  it("orders the longest first — the expensive ones are worth settling", () => {
    const many = [
      run("2026-01-01", "2026-01-02"),
      run("2026-01-07", "2026-01-08"), // 4-day gap
      run("2026-01-28", "2026-01-29"), // 19-day gap
      run("2026-02-04", "2026-02-05"), // 5-day gap
    ];
    expect(homeGapCandidates(many, [], []).map((g) => g.days)).toEqual([19, 5, 4]);
  });

  it("handles a month boundary without losing a day", () => {
    const across = [run("2026-01-25", "2026-01-30"), run("2026-02-04", "2026-02-07")];
    const [g] = homeGapCandidates(across, [], []);
    expect(g.unmarked).toEqual(["2026-01-31", "2026-02-01", "2026-02-02", "2026-02-03"]);
  });
});

describe("daysToMark", () => {
  it("flattens, dedupes and orders the days a click would write", () => {
    const gaps = [
      { unmarked: ["2026-06-05", "2026-06-04"] },
      { unmarked: ["2026-06-04", "2026-06-01"] },
    ] as unknown as Parameters<typeof daysToMark>[0];
    expect(daysToMark(gaps)).toEqual(["2026-06-01", "2026-06-04", "2026-06-05"]);
  });

  it("nothing in, nothing out", () => {
    expect(daysToMark([])).toEqual([]);
  });
});

describe("homeGapCandidates — bounded, because an unbounded list is a wall", () => {
  it("refuses a gap too long to be home time — that is a records hole", () => {
    // 74 days of silence is not a home stretch; offering to mark it would
    // write seventy-four wrong days on one click.
    const huge = [run("2026-06-28", "2026-07-01"), run("2026-09-14", "2026-09-18")];
    expect(homeGapCandidates(huge, [], [])).toHaveLength(0);
  });

  it("keeps a gap right at the limit, and drops the one past it", () => {
    const at = [run("2026-05-28", "2026-06-01"), run("2026-06-22", "2026-06-25")]; // 21
    const over = [run("2026-05-28", "2026-06-01"), run("2026-06-23", "2026-06-26")]; // 22
    expect(homeGapCandidates(at, [], [])).toHaveLength(1);
    expect(homeGapCandidates(over, [], [])).toHaveLength(0);
  });

  it("caps the list at ten, longest first", () => {
    // Fifteen four-day gaps: a fortnightly cadence through the year.
    const many: Load[] = [];
    for (let i = 0; i < 16; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i * 14));
      const key = d.toISOString().slice(0, 10);
      const end = new Date(Date.UTC(2026, 0, 2 + i * 14)).toISOString().slice(0, 10);
      many.push(run(key, end));
    }
    const gaps = homeGapCandidates(many, [], []);
    expect(gaps).toHaveLength(10);
    expect(gaps.every((g) => g.days <= 21)).toBe(true);
  });
});
