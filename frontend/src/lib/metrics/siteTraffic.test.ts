import { describe, it, expect } from "vitest";
import type { SiteHit } from "@/types/siteTraffic";
import {
  addDays,
  dayRange,
  latestVisits,
  topPages,
  topReferrers,
  topStates,
  trafficSummary,
  visitorsByDay,
  visitorsByWeek,
} from "./siteTraffic";

let seq = 0;
const hit = (over: Partial<SiteHit>): SiteHit => ({
  hit_id: ++seq,
  ts: `${over.day ?? "2026-09-17"}T15:04:05.000Z`,
  day: "2026-09-17",
  path: "/",
  ref_host: null,
  country: "US",
  region: "AL",
  visitor: "v1",
  device: "desktop",
  ...over,
});

// ------------------------------------------------------------- day strings

describe("addDays", () => {
  it("crosses a month end", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("crosses a year end in both directions", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("knows Feb 29 2028 exists and Feb 29 2027 does not", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("keeps two-digit padding and returns the same day for 0", () => {
    expect(addDays("2026-09-17", 0)).toBe("2026-09-17");
    expect(addDays("2026-09-08", 1)).toBe("2026-09-09");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("dayRange", () => {
  it("includes both ends", () => {
    expect(dayRange("2026-09-15", "2026-09-17")).toEqual([
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
    ]);
    expect(dayRange("2026-09-17", "2026-09-17")).toEqual(["2026-09-17"]);
  });

  it("walks a month end, a year end and a leap day", () => {
    expect(dayRange("2026-01-30", "2026-02-02")).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
    expect(dayRange("2026-12-30", "2027-01-02")).toHaveLength(4);
    expect(dayRange("2028-02-27", "2028-03-01")).toEqual([
      "2028-02-27",
      "2028-02-28",
      "2028-02-29",
      "2028-03-01",
    ]);
  });

  it("is 7 long for a week, 365 for a year, and empty backwards", () => {
    expect(dayRange(addDays("2026-09-17", -6), "2026-09-17")).toHaveLength(7);
    expect(dayRange(addDays("2026-09-17", -364), "2026-09-17")).toHaveLength(365);
    expect(dayRange("2026-09-18", "2026-09-17")).toEqual([]);
  });
});

// ---------------------------------------------------------------- summary

describe("trafficSummary", () => {
  it("an empty window counts nothing and averages nothing", () => {
    expect(trafficSummary([], "2026-09-17")).toEqual({
      visitors: 0,
      views: 0,
      todayViews: 0,
      todayVisitors: 0,
      avg7Visitors: null,
    });
  });

  it("one hit is one view and one visitor", () => {
    const s = trafficSummary([hit({})], "2026-09-17");
    expect(s.views).toBe(1);
    expect(s.visitors).toBe(1);
    expect(s.todayViews).toBe(1);
    expect(s.todayVisitors).toBe(1);
  });

  it("counts people, not page loads — one browser reading four pages", () => {
    const hits = ["/", "/capabilities", "/contact", "/equipment"].map((path) =>
      hit({ path }),
    );
    const s = trafficSummary(hits, "2026-09-17");
    expect(s.views).toBe(4);
    expect(s.visitors).toBe(1);
    expect(s.todayVisitors).toBe(1);
  });

  it("today is only today — yesterday's hits stay out of the today figures", () => {
    const hits = [
      hit({ day: "2026-09-17", visitor: "a" }),
      hit({ day: "2026-09-16", visitor: "b" }),
      hit({ day: "2026-09-16", visitor: "c" }),
    ];
    const s = trafficSummary(hits, "2026-09-17");
    expect(s.visitors).toBe(3);
    expect(s.todayViews).toBe(1);
    expect(s.todayVisitors).toBe(1);
  });

  it("the 7-day average divides by seven, counting empty days as zero", () => {
    // 14 visitors over the two most recent days, nothing on the other five.
    const hits = [
      ...Array.from({ length: 8 }, (_, i) =>
        hit({ day: "2026-09-17", visitor: `x${i}` }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        hit({ day: "2026-09-16", visitor: `y${i}` }),
      ),
    ];
    expect(trafficSummary(hits, "2026-09-17").avg7Visitors).toBeCloseTo(2, 10);
  });

  it("days older than the week are in the totals but not in the average", () => {
    const hits = [
      hit({ day: "2026-09-17", visitor: "a" }),
      hit({ day: "2026-08-01", visitor: "b" }),
    ];
    const s = trafficSummary(hits, "2026-09-17", "2026-08-19");
    expect(s.visitors).toBe(2);
    expect(s.avg7Visitors).toBeCloseTo(1 / 7, 10);
  });

  it("a window shorter than seven days has no 7-day average to give", () => {
    const hits = [hit({ day: "2026-09-17", visitor: "a" })];
    expect(trafficSummary(hits, "2026-09-17", "2026-09-15").avg7Visitors).toBeNull();
    // exactly seven days is long enough
    expect(
      trafficSummary(hits, "2026-09-17", "2026-09-11").avg7Visitors,
    ).not.toBeNull();
  });
});

// ------------------------------------------------------------------- bars

describe("visitorsByDay", () => {
  it("fills every day in the range, zeros included", () => {
    const rows = visitorsByDay(
      [hit({ day: "2026-09-16", visitor: "a" })],
      "2026-09-15",
      "2026-09-17",
    );
    expect(rows).toEqual([
      { day: "2026-09-15", visitors: 0, views: 0 },
      { day: "2026-09-16", visitors: 1, views: 1 },
      { day: "2026-09-17", visitors: 0, views: 0 },
    ]);
  });

  it("an empty window is still every day of the window", () => {
    const rows = visitorsByDay([], "2026-09-11", "2026-09-17");
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.visitors === 0 && r.views === 0)).toBe(true);
  });

  it("separates visitors from views on a single day", () => {
    const rows = visitorsByDay(
      [
        hit({ day: "2026-09-17", visitor: "a", path: "/" }),
        hit({ day: "2026-09-17", visitor: "a", path: "/contact" }),
        hit({ day: "2026-09-17", visitor: "b", path: "/" }),
      ],
      "2026-09-17",
      "2026-09-17",
    );
    expect(rows).toEqual([{ day: "2026-09-17", visitors: 2, views: 3 }]);
  });

  it("a hit outside the range is not counted anywhere", () => {
    const rows = visitorsByDay(
      [hit({ day: "2026-08-01", visitor: "a" })],
      "2026-09-15",
      "2026-09-17",
    );
    expect(rows.reduce((n, r) => n + r.views, 0)).toBe(0);
  });

  it("day strings pass through exactly as they arrived", () => {
    const rows = visitorsByDay([], "2026-02-27", "2026-03-01");
    expect(rows.map((r) => r.day)).toEqual([
      "2026-02-27",
      "2026-02-28",
      "2026-03-01",
    ]);
  });
});

describe("visitorsByWeek", () => {
  const days = (from: string, n: number, visitors: number): ReturnType<typeof visitorsByDay> =>
    Array.from({ length: n }, (_, i) => ({
      day: addDays(from, i),
      visitors,
      views: visitors * 2,
    }));

  it("folds 14 days into 2 weeks, the last one ending on the last day", () => {
    const weeks = visitorsByWeek(days("2026-09-04", 14, 3));
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({
      from: "2026-09-04",
      day: "2026-09-10",
      visitors: 21,
      views: 42,
    });
    expect(weeks[1].day).toBe("2026-09-17");
  });

  it("cuts from the end — the OLDEST bucket is the short one", () => {
    const weeks = visitorsByWeek(days("2026-09-08", 10, 1));
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toEqual({
      from: "2026-09-08",
      day: "2026-09-10",
      visitors: 3,
      views: 6,
    });
    expect(weeks[1]).toEqual({
      from: "2026-09-11",
      day: "2026-09-17",
      visitors: 7,
      views: 14,
    });
  });

  it("no days, no weeks", () => {
    expect(visitorsByWeek([])).toEqual([]);
  });
});

// ------------------------------------------------------------------ lists

describe("topPages", () => {
  it("ranks by views and carries each one's share", () => {
    const hits = [
      hit({ path: "/" }),
      hit({ path: "/" }),
      hit({ path: "/" }),
      hit({ path: "/contact" }),
    ];
    const rows = topPages(hits, 10);
    expect(rows[0].path).toBe("/");
    expect(rows[0].views).toBe(3);
    expect(rows[0].share).toBeCloseTo(0.75, 10);
    expect(rows[1].share).toBeCloseTo(0.25, 10);
  });

  it("breaks a tie on the path, so the list never reshuffles itself", () => {
    const hits = [hit({ path: "/zeta" }), hit({ path: "/alpha" })];
    expect(topPages(hits, 10).map((r) => r.path)).toEqual(["/alpha", "/zeta"]);
  });

  it("honours n, and an empty window is an empty list", () => {
    const hits = ["/a", "/b", "/c"].map((path) => hit({ path }));
    expect(topPages(hits, 2)).toHaveLength(2);
    expect(topPages([], 10)).toEqual([]);
  });
});

describe("topReferrers", () => {
  it("a null referrer is 'direct', and it ranks like any other host", () => {
    const hits = [
      hit({ ref_host: null }),
      hit({ ref_host: null }),
      hit({ ref_host: "google.com" }),
    ];
    const rows = topReferrers(hits, 10);
    expect(rows[0]).toEqual({ host: "direct", views: 2, share: 2 / 3 });
    expect(rows[1].host).toBe("google.com");
  });

  it("every hit direct means one row at 100%", () => {
    const rows = topReferrers([hit({}), hit({})], 10);
    expect(rows).toEqual([{ host: "direct", views: 2, share: 1 }]);
  });

  it("an empty window is an empty list", () => {
    expect(topReferrers([], 10)).toEqual([]);
  });
});

describe("topStates", () => {
  it("counts VISITORS per state, not page loads", () => {
    const hits = [
      hit({ region: "AL", visitor: "a" }),
      hit({ region: "AL", visitor: "a", path: "/contact" }),
      hit({ region: "AL", visitor: "b" }),
      hit({ region: "TX", visitor: "c" }),
    ];
    expect(topStates(hits, 10)).toEqual([
      { region: "AL", name: "Alabama", visitors: 2 },
      { region: "TX", name: "Texas", visitors: 1 },
    ]);
  });

  it("a hit with no country but a state code still counts", () => {
    const hits = [hit({ country: null, region: "GA", visitor: "a" })];
    expect(topStates(hits, 10)).toEqual([
      { region: "GA", name: "Georgia", visitors: 1 },
    ]);
  });

  it("drops anything that isn't a US state — another country, or a code that isn't one", () => {
    const hits = [
      hit({ country: "CA", region: "ON", visitor: "a" }), // Ontario
      hit({ country: "US", region: "ZZ", visitor: "b" }), // not a state
      hit({ country: "US", region: null, visitor: "c" }), // no region at all
      hit({ country: "US", region: "OH", visitor: "d" }),
    ];
    expect(topStates(hits, 10)).toEqual([
      { region: "OH", name: "Ohio", visitors: 1 },
    ]);
  });

  it("breaks a tie on the state name and honours n", () => {
    const hits = [
      hit({ region: "TX", visitor: "a" }),
      hit({ region: "AL", visitor: "b" }),
      hit({ region: "OH", visitor: "c" }),
    ];
    expect(topStates(hits, 10).map((r) => r.name)).toEqual([
      "Alabama",
      "Ohio",
      "Texas",
    ]);
    expect(topStates(hits, 2)).toHaveLength(2);
  });

  it("an empty window is an empty list", () => {
    expect(topStates([], 10)).toEqual([]);
  });
});

describe("latestVisits", () => {
  it("returns the n most recent, newest first, whatever order it was handed", () => {
    const a = hit({ ts: "2026-09-17T10:00:00.000Z", path: "/a" });
    const b = hit({ ts: "2026-09-17T12:00:00.000Z", path: "/b" });
    const c = hit({ ts: "2026-09-17T11:00:00.000Z", path: "/c" });
    expect(latestVisits([a, b, c], 2).map((h) => h.path)).toEqual(["/b", "/c"]);
  });

  it("does not mutate the array it was given", () => {
    const hits = [
      hit({ ts: "2026-09-17T10:00:00.000Z", path: "/a" }),
      hit({ ts: "2026-09-17T12:00:00.000Z", path: "/b" }),
    ];
    latestVisits(hits, 2);
    expect(hits.map((h) => h.path)).toEqual(["/a", "/b"]);
  });

  it("breaks a tie on hit_id, newest row first", () => {
    const older = { ...hit({ path: "/a" }), hit_id: 1, ts: "2026-09-17T10:00:00.000Z" };
    const newer = { ...hit({ path: "/b" }), hit_id: 2, ts: "2026-09-17T10:00:00.000Z" };
    expect(latestVisits([older, newer], 5).map((h) => h.path)).toEqual([
      "/b",
      "/a",
    ]);
  });

  it("asking for more than there is gives what there is", () => {
    expect(latestVisits([], 25)).toEqual([]);
    expect(latestVisits([hit({})], 25)).toHaveLength(1);
  });
});
