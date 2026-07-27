import { describe, it, expect } from "vitest";
import { marketTrend, youVsMarket } from "./marketSignal";

const idx = (vals: number[], startYear = 2026): { month: string; value: number }[] =>
  vals.map((value, i) => ({
    month: `${startYear}-${String(i + 1).padStart(2, "0")}`,
    value,
  }));

describe("marketTrend", () => {
  it("reads a rising series as firming", () => {
    const t = marketTrend(idx([150, 151, 153, 156]), 3)!; // +4% over 3mo
    expect(t.direction).toBe("firming");
    expect(t.pctChange).toBeCloseTo((156 - 150) / 150, 5);
  });

  it("reads a falling series as softening", () => {
    expect(marketTrend(idx([160, 158, 156, 152]), 3)!.direction).toBe("softening");
  });

  it("reads a tiny wobble as flat", () => {
    expect(marketTrend(idx([155, 155.1, 154.9, 155.2]), 3)!.direction).toBe("flat");
  });

  it("null when there aren't enough points", () => {
    expect(marketTrend(idx([150, 151]), 3)).toBeNull();
    expect(marketTrend([], 3)).toBeNull();
  });
});

describe("youVsMarket", () => {
  const mkt = idx([150, 151, 152, 153, 154, 155, 156]); // ~+4% Jan→Jul

  it("beating: your rate climbs faster than the market", () => {
    const mine = [
      { month: "2026-01", median: 3.0 },
      { month: "2026-07", median: 4.5 }, // +50%
    ];
    const r = youVsMarket(mine, mkt, 6)!;
    expect(r.yourPct).toBeCloseTo(0.5, 5);
    expect(r.marketPct).toBeGreaterThan(0);
    expect(r.verdict).toBe("beating");
  });

  it("lagging: market rises, your rate flat", () => {
    const mine = [
      { month: "2026-01", median: 4.0 },
      { month: "2026-07", median: 4.0 }, // 0%
    ];
    expect(youVsMarket(mine, mkt, 6)!.verdict).toBe("lagging");
  });

  it("inline when both move about the same", () => {
    const mine = [
      { month: "2026-01", median: 4.0 },
      { month: "2026-07", median: 4.16 }, // +4%, ~ market
    ];
    expect(youVsMarket(mine, mkt, 6)!.verdict).toBe("inline");
  });

  it("null without enough of your own points", () => {
    expect(youVsMarket([{ month: "2026-07", median: 4 }], mkt, 6)).toBeNull();
    expect(youVsMarket([], mkt, 6)).toBeNull();
  });
});
