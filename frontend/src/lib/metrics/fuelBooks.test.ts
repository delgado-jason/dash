import { describe, it, expect } from "vitest";
import { fuelBooksVsLog } from "./fuelBooks";

const NOW = new Date("2026-11-15T20:00:00Z");
const fill = (fuel_date: string, dollars: number) => ({ fuel_date, gallons: 100, price_per_gallon: dollars / 100 });
const period = (period_month: string, fuel_total: number | null) => ({ period_month, fuel_total });

describe("fuelBooksVsLog", () => {
  it("names the gaps, the matches, the unfiled month and the partial first month — Jason's 2026 shape", () => {
    const entries = [
      fill("2026-05-24", 2073),
      fill("2026-06-10", 4404),
      fill("2026-07-10", 6250),
      fill("2026-09-10", 8943),
      fill("2026-10-10", 3164),
      fill("2026-11-10", 3739),
    ];
    const periods = [
      period("2026-05-01", 5776),
      period("2026-06-01", 4128),
      period("2026-07-01", 5471),
      period("2026-08-01", 4902), // nothing logged in August here
      period("2026-09-01", 8607),
      period("2026-10-01", 3284),
    ];
    const rows = fuelBooksVsLog(entries, periods, NOW);
    expect(rows.map((r) => r.month)).toEqual(["2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"]);
    expect(rows[0]).toMatchObject({ books: null, read: "no P&L filed yet", tone: "quiet" });
    expect(rows[1]).toMatchObject({ logged: 3164, books: 3284, read: "$120 more in the books", tone: "gap" });
    expect(rows[2]).toMatchObject({ read: "$336 more logged than filed", tone: "gap" });
    expect(rows[3]).toMatchObject({ logged: 0, books: 4902, read: "$4,902 more in the books", tone: "gap" });
    expect(rows[4]).toMatchObject({ read: "$779 more logged than filed", tone: "gap" });
    expect(rows[5]).toMatchObject({ read: "$276 more logged than filed", tone: "gap" });
    expect(rows[6]).toMatchObject({ read: "the log began May 24 — a partial month, not read", tone: "quiet" });
  });

  it("a gap inside $25 or 1% is a match; an exact figure says so", () => {
    const rows = fuelBooksVsLog([fill("2026-06-01", 4000), fill("2026-07-01", 4000)], [period("2026-06-01", 4030), period("2026-07-01", 4000)], NOW);
    expect(rows.find((r) => r.month === "2026-06")).toMatchObject({ read: "matches", tone: "match" });
    expect(rows.find((r) => r.month === "2026-07")).toMatchObject({ read: "exact", tone: "match" });
  });

  it("a filed month with no Fuel line is a $0 line, not a missing month; months before the log are left out", () => {
    const rows = fuelBooksVsLog([fill("2026-06-01", 500)], [period("2026-03-01", 6596), period("2026-06-01", null)], NOW);
    expect(rows.map((r) => r.month)).toEqual(["2026-06"]);
    expect(rows[0]).toMatchObject({ books: 0, read: "$500 more logged than filed" });
  });

  it("no fills → no rows", () => {
    expect(fuelBooksVsLog([], [period("2026-06-01", 100)], NOW)).toEqual([]);
  });
});
