import { describe, it, expect } from "vitest";
import type { PerDiemRate } from "@/types/perDiemRate";
import {
  rateInForce,
  priceDays,
  segmentWords,
  missingDaysWords,
  moneyRate,
  ratesWords,
  dayWords,
} from "./rates";

const R69: PerDiemRate = { rate_id: "r69", effective_from: "2025-01-01", rate: 69, note: "the rate 2025 was filed at" };
const R80: PerDiemRate = { rate_id: "r80", effective_from: "2026-01-01", rate: 80, note: "IRS FY2026 transportation rate" };
// Deliberately out of order — the rules must not depend on the API's ordering.
const RATES = [R80, R69];

describe("rateInForce — the latest start on or before the day (GL-136)", () => {
  it("the start day itself is in force; the day before is the older row", () => {
    expect(rateInForce(RATES, "2026-01-01")?.rate_id).toBe("r80");
    expect(rateInForce(RATES, "2025-12-31")?.rate_id).toBe("r69");
  });
  it("a day before the first row has NO rate", () => {
    expect(rateInForce(RATES, "2024-12-31")).toBeNull();
    expect(rateInForce([], "2026-06-01")).toBeNull();
  });
  it("far past the last start, the last row still holds", () => {
    expect(rateInForce(RATES, "2031-07-04")?.rate_id).toBe("r80");
  });
});

describe("priceDays — each day at its own rate, a missing rate withholds the total", () => {
  it("two rates across a year boundary make two segments", () => {
    const p = priceDays(
      [
        ["2025-12-30", "half"],
        ["2025-12-31", "full"],
        ["2026-01-01", "full"],
        ["2026-01-02", "full"],
      ],
      RATES,
    );
    expect(p.missingDays).toEqual([]);
    expect(p.segments.map((s) => s.rate_id)).toEqual(["r69", "r80"]); // oldest first
    expect(p.segments[0]).toMatchObject({ fullDays: 1, halfDays: 1 });
    expect(p.segments[0].amount).toBeCloseTo(69 + 51.75, 6);
    expect(p.segments[1]).toMatchObject({ fullDays: 2, halfDays: 0, amount: 160 });
    expect(p.gross).toBeCloseTo(69 + 51.75 + 160, 6);
  });
  it("a day no rate covers is listed, never priced; the total is null", () => {
    const p = priceDays(
      [
        ["2024-12-30", "full"],
        ["2024-12-31", "half"],
        ["2025-01-01", "full"],
      ],
      RATES,
    );
    expect(p.missingDays).toEqual(["2024-12-30", "2024-12-31"]);
    expect(p.gross).toBeNull();
    // the covered day is still priced so the page can say what IS known
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0]).toMatchObject({ rate_id: "r69", fullDays: 1, amount: 69 });
  });
  it("no days → no segments, nothing missing, a zero total (a real zero)", () => {
    expect(priceDays([], RATES)).toEqual({ segments: [], missingDays: [], gross: 0 });
  });
});

describe("words", () => {
  it("segmentWords reads like the sheet", () => {
    const seg = { ...R80, fullDays: 22, halfDays: 3, amount: 0 };
    expect(segmentWords(seg)).toBe("22 full + 3 half days × $80 (from Jan 1, 2026)");
  });
  it("moneyRate keeps cents only when there are cents", () => {
    expect(moneyRate(80)).toBe("$80");
    expect(moneyRate(69.5)).toBe("$69.50");
  });
  it("missingDaysWords: one day, or a sorted range", () => {
    expect(missingDaysWords([])).toBe("");
    expect(missingDaysWords(["2024-01-03"])).toBe("1 day (Jan 3, 2024)");
    expect(missingDaysWords(["2024-01-12", "2024-01-01", "2024-01-05"])).toBe("3 days (Jan 1, 2024 – Jan 12, 2024)");
  });
  it("ratesWords lists every rate oldest first; dayWords never shifts a day", () => {
    expect(ratesWords(RATES)).toBe("$69 from Jan 1, 2025 · $80 from Jan 1, 2026");
    expect(dayWords("2026-01-01")).toBe("Jan 1, 2026");
    expect(dayWords("2026-01-01T05:00:00.000Z")).toBe("Jan 1, 2026");
  });
});
