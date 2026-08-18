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

  it("totals full/half and counts unconfirmed inferred days (pre-boundary era)", () => {
    // Cap in May — the whole walk stays before the 2026-08-18 default flip.
    const s = computePerDiem(manual, inferred, 69, 0.8, 2026, new Date(2026, 4, 31));
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

describe("the 2026-08-18 default flip — unmarked counts FULL from the boundary on", () => {
  it("effectiveStatus: unmarked is full ON the boundary, home the day before; marks still win", () => {
    const manual = new Map<string, PerDiemStatus>([
      ["2026-08-20", "home"],
      ["2026-08-21", "half"],
    ]);
    const none = new Set<string>();
    expect(effectiveStatus("2026-08-17", new Map(), none)).toBe("home"); // pre-flip default
    expect(effectiveStatus("2026-08-18", new Map(), none)).toBe("full"); // the flip day itself
    expect(effectiveStatus("2026-08-20", manual, none)).toBe("home"); // explicit home wins
    expect(effectiveStatus("2026-08-21", manual, none)).toBe("half");
  });

  it("computePerDiem counts every unmarked post-boundary day through cap — and no further", () => {
    // Cap Aug 22: post-boundary days are 08-18..08-22 = 5. One marked home,
    // one marked half → 3 auto-full + 1 half. Nothing pre-boundary counts
    // (no marks, no loads), and 08-23+ doesn't exist yet.
    const manual = new Map<string, PerDiemStatus>([
      ["2026-08-19", "home"],
      ["2026-08-20", "half"],
    ]);
    const s = computePerDiem(manual, new Set(), 69, 0.8, 2026, new Date(2026, 7, 22));
    expect(s.fullDays).toBe(3);
    expect(s.halfDays).toBe(1);
    // (3*69 + 1*51.75) * 0.8 = 258.75 * 0.8 = 207
    expect(s.deductible).toBe(207);
    expect(s.inferredCount).toBe(0); // the confirm-nudge is pre-boundary only
  });

  it("a manual mark past the cap (planned home time) doesn't count yet", () => {
    const manual = new Map<string, PerDiemStatus>([["2026-08-25", "half"]]);
    const s = computePerDiem(manual, new Set(), 69, 0.8, 2026, new Date(2026, 7, 22));
    expect(s.halfDays).toBe(0);
    expect(s.fullDays).toBe(5); // 08-18..08-22 auto-full
  });

  it("pre-boundary inference still works alongside the post-boundary default", () => {
    const inferred = new Set<string>(["2026-08-15"]); // load-covered, pre-flip
    const s = computePerDiem(new Map(), inferred, 69, 0.8, 2026, new Date(2026, 7, 19));
    expect(s.fullDays).toBe(3); // 08-15 (inferred) + 08-18 + 08-19 (auto)
    expect(s.inferredCount).toBe(1);
  });

  it("a load span crossing the boundary: only its PRE-flip days need confirming", () => {
    // Haul 08-17 → 08-19 straddles the flip. 08-17 is a hollow inferred day
    // (confirmable); 08-18/19 are auto-full like any post-flip day — unmarked
    // IS the claim there, nothing to confirm.
    const inferred = new Set<string>(["2026-08-17", "2026-08-18", "2026-08-19"]);
    const s = computePerDiem(new Map(), inferred, 69, 0.8, 2026, new Date(2026, 7, 20));
    expect(s.fullDays).toBe(4); // 08-17 (inferred) + 08-18..08-20 (auto)
    expect(s.inferredCount).toBe(1); // 08-17 only
  });

  it("a past year is walked entirely under the old rules (unmarked = home)", () => {
    const manual = new Map<string, PerDiemStatus>([["2025-06-02", "half"]]);
    const inferred = new Set<string>(["2025-06-10"]);
    const s = computePerDiem(manual, inferred, 69, 0.8, 2025, new Date(2025, 11, 31));
    // 365 unmarked days stay home — only the mark and the load-covered day count.
    expect(s.fullDays).toBe(1);
    expect(s.halfDays).toBe(1);
    // (1*69 + 1*51.75) * 0.8 = 120.75 * 0.8 = 96.6 → 97
    expect(s.deductible).toBe(97);
    expect(s.inferredCount).toBe(1);
  });
});

describe("nextStatus cycle", () => {
  it("pre-boundary: unmarked → full → half → home → clear", () => {
    expect(nextStatus(undefined)).toBe("full");
    expect(nextStatus("full")).toBe("half");
    expect(nextStatus("half")).toBe("home");
    expect(nextStatus("home")).toBeNull();
  });

  it("post-boundary (autoFull): skips the no-op full — tap → half → home → clear", () => {
    expect(nextStatus(undefined, true)).toBe("half");
    expect(nextStatus("full", true)).toBe("half"); // legacy explicit full folds in
    expect(nextStatus("half", true)).toBe("home");
    expect(nextStatus("home", true)).toBeNull();
  });
});
