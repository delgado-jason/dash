import { describe, it, expect } from "vitest";
import { marketSignal, youVsMarket, shiftMonth, indexSentence, DIR_THRESHOLD, PRINTS_TO_HOLD, YVM_MIN_LOADS } from "./marketSignal";

// A monthly series from a list of values, Jan ’26 onward.
const series = (values: number[], from = "2026-01") =>
  values.map((value, i) => ({ month: shiftMonth(from, i), value }));

describe("marketSignal — what the index is allowed to say", () => {
  it("one print of +3% reads firming but does not hold — the rule waits for two", () => {
    // flat all year, then September jumps 4.3% (the real Sep ’26 print)
    const s = marketSignal(series([170, 170, 170, 170, 170, 170, 168, 168, 175.7]))!;
    expect(s.raw).toBe("firming");
    expect(s.prints).toBe(1);
    expect(s.holds).toBe(false);
    expect(s.direction).toBe("flat");
    expect(s.latestMonth).toBe("2026-09");
    expect(s.windowStart).toBe("2026-06");
  });

  it("two prints running holds, and the direction may be used", () => {
    const s = marketSignal(series([160, 160, 160, 164, 166, 168, 170, 172, 174]))!;
    expect(s.raw).toBe("firming");
    expect(s.prints).toBeGreaterThanOrEqual(PRINTS_TO_HOLD);
    expect(s.holds).toBe(true);
    expect(s.direction).toBe("firming");
  });

  it("a 1.5% three-month move is flat — under the 2.5% threshold, inside the index's own noise", () => {
    const s = marketSignal(series([170, 170, 170, 170, 170, 170, 171, 172, 172.5]))!;
    expect(s.pctChange).toBeCloseTo(0.0147, 3);
    expect(DIR_THRESHOLD).toBe(0.025);
    expect(s.raw).toBe("flat");
    expect(s.direction).toBe("flat");
  });

  it("diesel moving the same way past 10% makes it a fuel move: named, never a call", () => {
    const index = series([160, 160, 160, 164, 166, 168, 170, 172, 174]);
    const diesel = series([3.5, 3.5, 3.5, 3.5, 3.6, 5.02, 5.4, 5.8, 6.29]);
    const s = marketSignal(index, diesel)!;
    expect(s.holds).toBe(true);
    expect(s.dieselPct).toBeCloseTo((6.29 - 5.02) / 5.02, 4);
    expect(s.fuelDriven).toBe(true);
    expect(s.direction).toBe("flat");
    expect(indexSentence(s)).toMatch(/fuel move/);
  });

  it("diesel moving the other way doesn't excuse the move", () => {
    const index = series([160, 160, 160, 164, 166, 168, 170, 172, 174]);
    const diesel = series([6, 6, 6, 6, 6, 6, 5.5, 5.2, 5]);
    const s = marketSignal(index, diesel)!;
    expect(s.fuelDriven).toBe(false);
    expect(s.direction).toBe("firming");
  });

  it("a missing month is a missing read — the window is never stretched", () => {
    const pts = series([170, 170, 170, 170, 170, 170, 168, 168, 175.7]).filter((p) => p.month !== "2026-06");
    expect(marketSignal(pts)).toBeNull();
    expect(marketSignal([])).toBeNull();
  });

  it("softening counts prints the same way", () => {
    const s = marketSignal(series([180, 180, 180, 176, 173, 170, 168, 166, 164]))!;
    expect(s.raw).toBe("softening");
    expect(s.holds).toBe(true);
    expect(s.direction).toBe("softening");
    expect(indexSentence(s)).toMatch(/softening for \d+ prints/);
  });
});

describe("youVsMarket — three months against the three before, the same months on both sides", () => {
  const pt = (date: string, rate: number, bucket = "standard") => ({ date, rate, bucket });
  const loads = (ym: string, rates: number[], bucket = "standard") => rates.map((r, i) => pt(`${ym}-${String(i + 2).padStart(2, "0")}`, r, bucket));
  const index = series([170, 170, 170, 170, 170, 170, 175, 175, 175]); // Apr–Jun 170 · Jul–Sep 175 → +2.9%

  it("beating: your standard median rose 20% while the index rose 3%, with the counts and the months named", () => {
    const pts = [
      ...loads("2026-04", [4, 4, 4]), ...loads("2026-05", [4, 4, 4]), ...loads("2026-06", [4, 4, 4]),
      ...loads("2026-07", [4.8, 4.8, 4.8]), ...loads("2026-08", [4.8, 4.8, 4.8]), ...loads("2026-09", [4.8, 4.8, 4.8]),
    ];
    const r = youVsMarket(pts, index)!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recent).toMatchObject({ label: "Jul–Sep", n: 9, median: 4.8, index: 175 });
    expect(r.prior).toMatchObject({ label: "Apr–Jun", n: 9, median: 4, index: 170 });
    expect(r.yourPct).toBeCloseTo(0.2, 4);
    expect(r.marketPct).toBeCloseTo(5 / 170, 4);
    expect(r.verdict).toBe("beating");
  });

  it("fewer than eight standard loads on a side is not enough to compare — said with the counts", () => {
    const pts = [...loads("2026-05", [4, 4, 4, 4, 4, 4, 4, 4]), ...loads("2026-08", [4.8, 4.8, 4.8, 4.8, 4.8])];
    const r = youVsMarket(pts, index)!;
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.recent).toMatchObject({ label: "Jul–Sep", n: 5 });
    expect(r.prior).toMatchObject({ label: "Apr–Jun", n: 8 });
    expect(r.need).toBe(YVM_MIN_LOADS);
  });

  it("oversize loads never enter the comparison, and an October load doesn't either — the index ends in September", () => {
    const pts = [
      ...loads("2026-05", [4, 4, 4, 4, 4, 4, 4, 4]), ...loads("2026-08", [4, 4, 4, 4, 4, 4, 4, 4]),
      ...loads("2026-08", [9, 9, 9], "specialized"), ...loads("2026-10", [8, 8, 8, 8]),
    ];
    const r = youVsMarket(pts, index)!;
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recent.n).toBe(8);
    expect(r.verdict).toBe("inline"); // you flat, the index +2.9% → a 2.9-pt gap, inside the 3-pt band
  });

  it("no index → null", () => {
    expect(youVsMarket([], [])).toBeNull();
  });
});
