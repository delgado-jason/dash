// SCORE-02 · PNL-03 — a missing input is unknown, never zero.
//
// Locked rules: a load with no deadhead logged is not graded as zero-empty (the
// best possible grade for the worst-known data); a P&L subtotal row with a
// blank amount is refused, not filed as $0. A red test here means a business
// rule moved: the PR body must say "Rule change: <id> — <why>".
import { describe, it, expect } from "vitest";
import { syntheticBook, TODAY } from "@/test/fixtures/book";
import { computeRateTargets, monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { scoreLoad, DEADHEAD_UNKNOWN } from "@/lib/metrics/loadScore";
import { parsePnlRows } from "@/lib/pnl/parsePnl";

const now = new Date(`${TODAY}T00:00:00Z`);

describe("SCORE-02 · a null deadhead is unknown, never zero-empty", () => {
  const book = syntheticBook();
  const t = computeRateTargets(book.loads, book.periods, monthlyObligationCost(book.obligations), book.schedule, now);
  const basis = { costPerDrivenMile: t.basis.costPerTotalMile, payTake: t.basis.payTake };
  const load = book.loads[0];
  const input = {
    rate: Number(load.gross_revenue),
    loadedMiles: load.loaded_miles,
    deadheadMiles: (load.odometer_end as number) - (load.odometer_start as number) - load.loaded_miles,
  };

  it("deadhead_miles: null yields no verdict, no figures, and the missing words", () => {
    const s = scoreLoad({ ...input, deadheadMiles: null }, basis);
    expect(s.verdict).toBeNull();
    expect(s.allInRpm).toBeNull();
    expect(s.profit).toBeNull();
    expect(s.missing).toEqual([DEADHEAD_UNKNOWN]);
    expect(DEADHEAD_UNKNOWN).toBe("deadhead unknown — needs the odometer");
  });

  it("a typed zero is a real answer (the truck was at the shipper) and still grades", () => {
    const s = scoreLoad({ ...input, deadheadMiles: 0 }, basis);
    expect(s.missing).toEqual([]);
    expect(s.verdict).not.toBeNull();
  });

  it("control: with the odometer's deadhead the book load carries its pinned verdict", () => {
    const s = scoreLoad(input, basis);
    expect(s.missing).toEqual([]);
    // derived: $3,790 over 650 loaded + 25 empty (500,675 − 500,000 − 650) = 675 driven mi → $5.6148/mi;
    // ÷ the break-even $5.1113 − 1 = +9.85% over break-even — above 0, under the 20% target tier → "meh" (THIN)
    expect(s.breakevenRpm).toBeCloseTo(5.1113, 4);
    expect(s.drivenMiles).toBe(675);
    expect(s.pctOverBreakeven).toBeCloseTo(0.0985, 4);
    expect(s.verdict).toBe("meh");
  });
});

describe("PNL-03 · a P&L row with a blank amount is refused, not read as $0", () => {
  const rows: string[][] = [
    ["Delgado Trucking Services", "", ""],
    ["", "Jun 2026", "May 2026 (PP)"],
    ["Expenses", "", ""],
    ["Insurance", "", ""],
    ["CPP", "125.00", "125.00"],
    ["Total for Insurance", "", "125.00"],
    ["Wages", "700.00", "500.00"],
    ["Total for Expenses", "825.00", "625.00"],
  ];

  it("names the row, files no $0 line for it", () => {
    const p = parsePnlRows(rows);
    expect(p.errors.some((e) => e.includes('"Total Insurance" has no amount for this month'))).toBe(true);
    expect(p.lines.find((l) => l.name === "Insurance")).toBeUndefined();
  });

  it("control: the same row with its amount parses with no row refusal", () => {
    const filled = rows.map((r) => (r[0] === "Total for Insurance" ? [r[0], "125.00", "125.00"] : r));
    const p = parsePnlRows(filled);
    expect(p.errors.some((e) => e.includes("has no amount"))).toBe(false);
    expect(p.lines.find((l) => l.name === "Insurance")?.current).toBe(125);
  });
});
