import { describe, it, expect } from "vitest";
import { scoreForecasts, actualEnding, ENOUGH, type ForecastRecord } from "./forecastScore";
import type { CashCheck } from "./cashBoard";

const chk = (date: string, balance: number): CashCheck =>
  ({ date, balance, kind: "snapshot", note: null }) as CashCheck;

const rec = (start: string, end: string, ending: number | null, daysBefore = 7): ForecastRecord => ({
  pay_week_start: start, pay_week_end: end,
  forecast_ending: ending, forecast_deposit: null, forecast_fuel: null,
  days_before_end: daysBefore, recorded_at: `${start}T12:00:00Z`,
});

describe("actualEnding — the first reading on or AFTER the period closed", () => {
  it("takes the first balance from the close, not the last one inside", () => {
    // The board's Ending is struck after the period's own bills have drafted,
    // so a Friday reading mid-week has not seen them yet and is not the ending.
    const checks = [chk("2026-10-30", 9000), chk("2026-11-03", 6275), chk("2026-11-06", 4376)];
    expect(actualEnding("2026-11-03", checks)).toBe(6275);
  });

  it("refuses a reading too far past the close to be that period's ending", () => {
    // Three weeks later has absorbed another period's money entirely.
    expect(actualEnding("2026-11-03", [chk("2026-11-28", 5000)])).toBeNull();
    expect(actualEnding("2026-11-03", [chk("2026-11-10", 5000)])).toBe(5000);
  });

  it("is null when nothing was typed at all", () => {
    expect(actualEnding("2026-11-03", [])).toBeNull();
    expect(actualEnding("2026-11-03", [chk("2026-10-30", 9000)])).toBeNull();
  });
});

describe("scoreForecasts", () => {
  const checks = [chk("2026-11-03", 6275), chk("2026-10-27", 11886), chk("2026-10-20", 14725)];
  const records = [
    rec("2026-10-28", "2026-11-03", 6980),
    rec("2026-10-21", "2026-10-27", 11640),
    rec("2026-10-14", "2026-10-20", 14980),
  ];

  it("misses are signed: positive means the board was PESSIMISTIC", () => {
    const s = scoreForecasts(records, checks, "2026-11-10");
    expect(s.periods[0]).toMatchObject({ forecast: 6980, actual: 6275, miss: -705 });
    expect(s.periods[1].miss).toBe(246);
    expect(s.periods[2].miss).toBe(-255);
  });

  it("averages the miss across the periods it could score", () => {
    const s = scoreForecasts(records, checks, "2026-11-10");
    expect(s.scored).toBe(3);
    expect(s.averageMiss).toBeCloseTo((-705 + 246 - 255) / 3, 2);
  });

  it("calls three periods THIN — an average on three samples is not a finding", () => {
    const s = scoreForecasts(records, checks, "2026-11-10");
    expect(s.thin).toBe(true);
    expect(ENOUGH).toBe(8);
  });

  it("ignores a period that has not closed yet", () => {
    // Today is inside Nov 4–10, so that period cannot be scored.
    const open = [rec("2026-11-04", "2026-11-10", 5258), ...records];
    const s = scoreForecasts(open, checks, "2026-11-10");
    expect(s.periods.some((p) => p.start === "2026-11-04")).toBe(false);
  });

  it("says WHY a closed period could not be scored", () => {
    const noReading = scoreForecasts([rec("2026-09-30", "2026-10-06", 8000)], checks, "2026-11-10");
    expect(noReading.periods[0]).toMatchObject({ unscored: "no-reading", miss: null });
    expect(noReading.averageMiss).toBeNull();

    const noForecast = scoreForecasts([rec("2026-10-28", "2026-11-03", null)], checks, "2026-11-10");
    expect(noForecast.periods[0].unscored).toBe("no-forecast");
  });

  it("is empty and honest on day one", () => {
    const s = scoreForecasts([], checks, "2026-11-10");
    expect(s).toMatchObject({ scored: 0, averageMiss: null, averagePct: null, thin: false });
    expect(s.periods).toEqual([]);
  });

  it("averages the PERCENT per period, so one big week cannot dominate", () => {
    // +$100 on a $1,000 week is 10%; +$100 on a $100,000 week is 0.1%. The
    // mean of the two rates is ~5%, not the 0.2% a pooled ratio would give.
    const s = scoreForecasts(
      [rec("2026-10-28", "2026-11-03", 1000), rec("2026-10-21", "2026-10-27", 100000)],
      [chk("2026-11-03", 1100), chk("2026-10-27", 100100)],
      "2026-11-10",
    );
    expect(s.averagePct).toBeCloseTo((0.1 + 0.001) / 2, 4);
  });

  it("keeps only the most recent periods, newest first", () => {
    // Walk the real calendar — an earlier draft of this test built
    // "2026-08-80" by adding 7 to a day number, which is not a date.
    const addDays = (k: string, n: number) =>
      new Date(new Date(`${k}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
    const many = Array.from({ length: 12 }, (_, i) => {
      const start = addDays("2026-08-05", i * 7);
      return rec(start, addDays(start, 6), 1000);
    });
    const s = scoreForecasts(many, checks, "2026-12-01");
    expect(s.periods.length).toBeLessThanOrEqual(ENOUGH);
    expect(s.periods[0].start > s.periods[1].start).toBe(true);
  });
});
