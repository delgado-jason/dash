import { describe, it, expect } from "vitest";
import { capDoors, dateChips, outcomeLabel } from "./touchOptions";

// Local-time dates on purpose — the chips are Brandie's calendar.
const local = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);

describe("dateChips — callback dates in local days", () => {
  it("Thu is the NEXT Thursday, never today", () => {
    // 2026-09-14 is a Monday → Thu 2026-09-17
    expect(dateChips(local(2026, 9, 14)).find((c) => c.label === "Thu")?.key).toBe("2026-09-17");
    // on a Thursday the chip rolls a full week
    expect(dateChips(local(2026, 9, 17)).find((c) => c.label === "Thu")?.key).toBe("2026-09-24");
    // Friday → the coming Thursday
    expect(dateChips(local(2026, 9, 18)).find((c) => c.label === "Thu")?.key).toBe("2026-09-24");
  });

  it("+1 wk / +2 wk / +1 mo count from today, across a month and a year edge", () => {
    const chips = Object.fromEntries(dateChips(local(2026, 12, 28, 23)).map((c) => [c.label, c.key]));
    expect(chips["+1 wk"]).toBe("2027-01-04");
    expect(chips["+2 wk"]).toBe("2027-01-11");
    expect(chips["+1 mo"]).toBe("2027-01-28");
  });

  it("late in the evening stays on the local day — no toISOString rollover", () => {
    const chips = Object.fromEntries(dateChips(local(2026, 9, 14, 23)).map((c) => [c.label, c.key]));
    expect(chips["+1 wk"]).toBe("2026-09-21");
  });

  it("+1 mo clamps to the end of the next month — Jan 31 → Feb 28, Feb 29 in a leap year, never March 3", () => {
    const plusMonth = (d: Date) => dateChips(d).find((c) => c.label === "+1 mo")?.key;
    expect(plusMonth(local(2026, 1, 31))).toBe("2026-02-28");
    expect(plusMonth(local(2028, 1, 31))).toBe("2028-02-29");
    expect(plusMonth(local(2026, 3, 31))).toBe("2026-04-30");
    expect(plusMonth(local(2026, 12, 31, 23))).toBe("2027-01-31"); // a year edge, late at night
    expect(plusMonth(local(2026, 9, 14))).toBe("2026-10-14"); // an ordinary day is untouched
  });
});

describe("outcomeLabel", () => {
  it("names the four outcomes and nothing else", () => {
    expect(outcomeLabel("reached")).toBe("Reached");
    expect(outcomeLabel("no_answer")).toBe("No answer");
    expect(outcomeLabel("bad_number")).toBe("Bad number");
    expect(outcomeLabel(null)).toBeNull();
    expect(outcomeLabel("email")).toBeNull();
  });
});

describe("capDoors — a call is never folded", () => {
  it("a message may fold; a call may not", () => {
    expect(capDoors("text").fold).toBe(true);
    expect(capDoors("email").fold).toBe(true);
    expect(capDoors("call").fold).toBe(false);
  });

  it("log anyway is open on every method — the note is the reason", () => {
    for (const m of ["call", "text", "email"] as const) expect(capDoors(m).logAnyway).toBe(true);
  });
});
