import { describe, it, expect } from "vitest";
import { payWeekOf, weeksOwed, milesInWeeks, weekLabel } from "./payWeeks";

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
