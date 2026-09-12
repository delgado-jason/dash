import { describe, it, expect } from "vitest";
import { DAY_PLAN, PLATE_LABEL, dayPlan } from "./dayPlan";

// Local-time dates on purpose — the plan follows Brandie's calendar.
const local = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);

describe("dayPlan — ADMIN-02 v1.1's week, keyed on the local weekday", () => {
  it("Monday is the capacity pass, then reactivation", () => {
    const p = dayPlan(local(2026, 9, 14)); // a Monday
    expect(p.short).toBe("MON");
    expect(p.plate).toBe("capacity");
    expect(p.lists).toEqual(["reactivation"]);
    expect(p.weekend).toBe(false);
  });

  it("Tuesday and Thursday lead with reactivation; Thursday adds prospecting", () => {
    expect(dayPlan(local(2026, 9, 15)).plate).toBe("reactivation");
    expect(dayPlan(local(2026, 9, 15)).lists).toEqual(["reactivation"]);
    expect(dayPlan(local(2026, 9, 17)).plate).toBe("reactivation");
    expect(dayPlan(local(2026, 9, 17)).lists).toEqual(["reactivation", "prospecting"]);
  });

  it("Wednesday is the nurture flags, Friday the five with nothing scheduled below", () => {
    expect(dayPlan(local(2026, 9, 16)).plate).toBe("nurture");
    expect(dayPlan(local(2026, 9, 16)).lists).toEqual(["reactivation"]);
    expect(dayPlan(local(2026, 9, 18)).plate).toBe("five");
    expect(dayPlan(local(2026, 9, 18)).lists).toEqual([]);
  });

  it("Saturday and Sunday have no plate and no lists", () => {
    for (const d of [19, 20]) {
      const p = dayPlan(local(2026, 9, d));
      expect(p.plate).toBe("none");
      expect(p.lists).toEqual([]);
      expect(p.weekend).toBe(true);
    }
  });

  it("reads the LOCAL day — late Sunday night is still Sunday, not UTC's Monday", () => {
    expect(dayPlan(local(2026, 9, 20, 23)).short).toBe("SUN");
    expect(dayPlan(local(2026, 9, 21, 0)).short).toBe("MON");
  });

  it("the table covers all seven days in getDay order and every plate has a label", () => {
    expect(DAY_PLAN.map((p) => p.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    for (const p of DAY_PLAN) expect(PLATE_LABEL[p.plate]).toBeTruthy();
  });
});
