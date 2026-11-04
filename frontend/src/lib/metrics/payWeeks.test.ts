import { describe, it, expect } from "vitest";
import { payWeekOf, weeksOwed, milesInWeeks, weekLabel, isFirstFriday, monthStartOf, completedPayWeekTotals, bestPayWeek } from "./payWeeks";
import type { Load } from "@/types/load";

describe("payWeekOf — Wednesday to Tuesday", () => {
  it("Tue Sep 22 sits in the week of Wed Sep 16", () => {
    expect(payWeekOf("2026-09-22")).toEqual({ start: "2026-09-16", end: "2026-09-22" });
  });
  it("Fri Sep 25 sits in the week of Wed Sep 23", () => {
    expect(payWeekOf("2026-09-25")).toEqual({ start: "2026-09-23", end: "2026-09-29" });
  });
  it("Wednesday starts its own week", () => {
    expect(payWeekOf("2026-09-23").start).toBe("2026-09-23");
  });
});

describe("weeksOwed — a closed pay week accrues once", () => {
  it("with no history, only the latest closed week is owed (the rules start now)", () => {
    expect(weeksOwed("2026-09-25", null)).toEqual({
      weeks: [{ start: "2026-09-16", end: "2026-09-22" }],
      truncated: false,
    });
  });
  it("on Tue Sep 22 the week Sep 16–22 is NOT closed yet — the week before is", () => {
    expect(weeksOwed("2026-09-22", null).weeks).toEqual([{ start: "2026-09-09", end: "2026-09-15" }]);
  });
  it("after Friday accrued Sep 16–22, a money day on Wed Oct 14 owes the three weeks since — Oct 7–13 closed the night before", () => {
    expect(weeksOwed("2026-10-14", "2026-09-16").weeks).toEqual([
      { start: "2026-09-23", end: "2026-09-29" },
      { start: "2026-09-30", end: "2026-10-06" },
      { start: "2026-10-07", end: "2026-10-13" },
    ]);
  });
  it("the Friday after that money day owes nothing — the Wednesday took it", () => {
    expect(weeksOwed("2026-10-16", "2026-10-07").weeks).toEqual([]);
    expect(weeksOwed("2026-10-16", "2026-10-07").truncated).toBe(false);
  });
  it("a long gap is capped at the most recent weeks and says so", () => {
    const r = weeksOwed("2026-12-18", "2026-09-16", 8);
    expect(r.weeks.length).toBe(8);
    expect(r.truncated).toBe(true);
    expect(r.weeks[r.weeks.length - 1]).toEqual({ start: "2026-12-09", end: "2026-12-15" });
  });
});

describe("milesInWeeks — the week's loads, by pickup date", () => {
  const loads = [
    { load_number: "7330381", pickup_date: "2026-09-18", loaded_miles: 1130, deadhead_miles: 316 },
    { load_number: "2990007", pickup_date: "2026-09-22T00:00:00.000Z", loaded_miles: 539, deadhead_miles: 14 },
    { load_number: "older", pickup_date: "2026-09-15", loaded_miles: 900, deadhead_miles: 0 },
    { load_number: "later", pickup_date: "2026-09-23", loaded_miles: 500, deadhead_miles: 50 },
  ];
  it("this pay week: 1,669 loaded + 330 deadhead = 1,999 from two loads", () => {
    const m = milesInWeeks(loads, [{ start: "2026-09-16", end: "2026-09-22" }]);
    expect(m).toEqual({ loads: 2, loadedMiles: 1669, deadheadMiles: 330, miles: 1999, noDeadhead: 0, loadNumbers: ["7330381", "2990007"] });
  });
  it("a zero deadhead is flagged, not treated as free miles", () => {
    const m = milesInWeeks(loads, [{ start: "2026-09-09", end: "2026-09-15" }]);
    expect(m.miles).toBe(900);
    expect(m.noDeadhead).toBe(1);
  });
  it("a cancelled load was never driven — its miles don't accrue", () => {
    const m = milesInWeeks(
      [...loads, { load_number: "dead", load_status: "cancelled", pickup_date: "2026-09-17", loaded_miles: 2000, deadhead_miles: 400 }],
      [{ start: "2026-09-16", end: "2026-09-22" }],
    );
    expect(m.miles).toBe(1999);
    expect(m.loads).toBe(2);
  });
  it("two owed weeks add up", () => {
    const m = milesInWeeks(loads, [
      { start: "2026-09-16", end: "2026-09-22" },
      { start: "2026-09-23", end: "2026-09-29" },
    ]);
    expect(m.miles).toBe(2549);
    expect(m.loads).toBe(3);
  });
});

describe("weekLabel", () => {
  it("names the week inside a month and across one", () => {
    expect(weekLabel({ start: "2026-09-16", end: "2026-09-22" })).toBe("Sep 16–22");
    expect(weekLabel({ start: "2026-09-30", end: "2026-10-06" })).toBe("Sep 30–Oct 6");
  });
});

describe("milesInWeeks — a TONU's planned miles are not driven miles (2026-11-04)", () => {
  it("skips tonu like cancelled", () => {
    const w = [{ start: "2026-11-04", end: "2026-11-10" }];
    const loads = [
      { load_number: "a", load_status: "tonu", pickup_date: "2026-11-05", loaded_miles: 301, deadhead_miles: 124 },
      { load_number: "b", load_status: "booked", pickup_date: "2026-11-05", loaded_miles: 500, deadhead_miles: 50 },
    ];
    expect(milesInWeeks(loads, w)).toMatchObject({ loads: 1, miles: 550 });
  });
});


describe("isFirstFriday / monthStartOf — the month's first Friday is the new month's Friday (2026-11-04)", () => {
  it("Nov 6, 2026 is the first Friday; Nov 13 is not; Nov 4 (a Wednesday) is not", () => {
    expect(isFirstFriday("2026-11-06")).toBe(true);
    expect(isFirstFriday("2026-11-13")).toBe(false);
    expect(isFirstFriday("2026-11-04")).toBe(false);
  });
  it("a Friday on the 7th still counts; the 8th never does", () => {
    expect(isFirstFriday("2026-08-07")).toBe(true);
    expect(isFirstFriday("2027-01-08")).toBe(false);
  });
  it("slices a timestamp to its day", () => {
    expect(isFirstFriday("2026-10-02T00:00:00.000Z")).toBe(true);
    expect(monthStartOf("2026-11-04T12:00:00Z")).toBe("2026-11-01");
  });
});

describe("completedPayWeekTotals / bestPayWeek — one best week, pay weeks, gross (2026-11-04, §5)", () => {
  const L = (delivery_date: string, linehaul: number, extra: Record<string, unknown> = {}) =>
    ({ load_status: "delivered", delivery_date, linehaul, fuel_surcharge: 0, total_accessorials: 0, ...extra }) as unknown as Load;
  const loads = [
    L("2026-05-12", 3200), // Tue → week May 6–12
    L("2026-05-13", 1000, { fuel_surcharge: 300 }), // Wed → week May 13–19 (gross 1,300)
    L("2026-05-15", 2600), // same week May 13–19
    L("2026-05-21", 9000), // the running week on May 20 — never counts yet
    L("2026-05-14", 5000, { load_status: "booked" }), // not delivered — not freight hauled
  ];

  it("groups delivered loads by the Wednesday→Tuesday week they delivered in, at gross", () => {
    const t = completedPayWeekTotals(loads, "2026-05-20");
    expect(t.map((w) => [w.week.start, w.gross, w.loads])).toEqual([
      ["2026-05-06", 3200, 1],
      ["2026-05-13", 3900, 2],
    ]);
  });

  it("the best week is the highest gross; the Monday-week grouping would have put May 12 and 13 together", () => {
    expect(bestPayWeek(loads, "2026-05-20")).toMatchObject({ week: { start: "2026-05-13", end: "2026-05-19" }, gross: 3900, loads: 2 });
  });

  it("the running week joins once it completes", () => {
    expect(bestPayWeek(loads, "2026-05-27")!.gross).toBe(9000);
  });

  it("bounds select weeks by their start — the recap's range", () => {
    expect(bestPayWeek(loads, "2026-06-30", { from: "2026-05-13", before: "2026-05-20" })!.gross).toBe(3900);
    expect(bestPayWeek(loads, "2026-06-30", { before: "2026-05-13" })!.gross).toBe(3200);
    expect(bestPayWeek(loads, "2026-06-30", { from: "2026-06-01" })).toBeNull();
  });

  it("a tie goes to the later week; nothing delivered → null", () => {
    const tie = [L("2026-05-12", 1000), L("2026-05-19", 1000)];
    expect(bestPayWeek(tie, "2026-05-27")!.week.start).toBe("2026-05-13");
    expect(bestPayWeek([], "2026-05-27")).toBeNull();
  });
});
