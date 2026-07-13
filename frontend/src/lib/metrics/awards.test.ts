import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { earnedAwards, newAwards, type Award } from "./awards";

const NOW = new Date("2026-07-10T12:00:00Z");

const L = (o: Record<string, unknown>): Load =>
  ({
    load_status: "delivered",
    agent_id: "ag1",
    agent: "Redwood",
    delivery_date: "2026-05-12",
    loaded_miles: 1000,
    deadhead_miles: 0,
    linehaul: "3000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    origin_market: "Dallas",
    delivery_market: "Atlanta",
    ...o,
  }) as unknown as Load;

describe("earnedAwards", () => {
  it("emits rank, mile club, relationship, and best-week ids", () => {
    const loads = Array.from({ length: 6 }, (_, k) => L({ load_id: `x${k}` }));
    const ids = earnedAwards({
      loads,
      periods: [],
      fuel: [],
      lifetimeMiles: 582450,
      obligationsDebtMonthly: 2411,
      now: NOW,
    }).map((a) => a.id);
    expect(ids).toContain("rank:road-captain");
    expect(ids).toContain("mileclub:500000");
    expect(ids.some((x) => x.startsWith("relationship:ag1:5"))).toBe(true);
    expect(ids.some((x) => x.startsWith("best-week:"))).toBe(true);
  });

  it("subsumes the closing month of a quarter — quarter pops, month doesn't", () => {
    // NOW is July, so June (last complete month) closes the same day as Q2.
    const loads = [L({ load_id: "j", delivery_date: "2026-06-15" })];
    const ids = earnedAwards({ loads, periods: [], fuel: [], lifetimeMiles: 0, obligationsDebtMonthly: 0, now: NOW }).map((a) => a.id);
    expect(ids).toContain("recap:quarter:Q2 2026");
    expect(ids).not.toContain("recap:month:Jun 2026");
  });

  it("a mid-quarter month still pops its own recap", () => {
    // NOW is mid-June: last complete month = May, last complete quarter = Q1 —
    // different close dates, so May is not subsumed.
    const NOW_JUN = new Date("2026-06-10T12:00:00Z");
    const loads = [L({ load_id: "m", delivery_date: "2026-05-12" })];
    const ids = earnedAwards({ loads, periods: [], fuel: [], lifetimeMiles: 0, obligationsDebtMonthly: 0, now: NOW_JUN }).map((a) => a.id);
    expect(ids).toContain("recap:month:May 2026");
  });

  it("re-earns: a bigger best week yields a new id so it pops again", () => {
    const base = { periods: [], fuel: [], lifetimeMiles: 0, obligationsDebtMonthly: 0, now: NOW };
    const a = earnedAwards({ ...base, loads: [L({ load_id: "1", linehaul: "4000" })] });
    const b = earnedAwards({ ...base, loads: [L({ load_id: "1", linehaul: "5000" })] });
    const idA = a.find((x) => x.id.startsWith("best-week:"))!.id;
    const idB = b.find((x) => x.id.startsWith("best-week:"))!.id;
    expect(idA).not.toBe(idB);
  });
});

describe("newAwards", () => {
  it("drops seen ids and orders marquee before burst", () => {
    const earned: Award[] = [
      { id: "best-week:5000", tier: "burst", name: "", detail: "", icon: "" },
      { id: "rank:road-captain", tier: "marquee", name: "", detail: "", icon: "" },
      { id: "seen-one", tier: "burst", name: "", detail: "", icon: "" },
    ];
    const fresh = newAwards(earned, new Set(["seen-one"]));
    expect(fresh.map((a) => a.id)).toEqual(["rank:road-captain", "best-week:5000"]);
  });

  it("orders recap ceremonies grandest first, ahead of marquees", () => {
    const earned: Award[] = [
      { id: "recap:month:Jun 2026", tier: "recap", scope: "month", name: "", detail: "", icon: "" },
      { id: "rank:road-captain", tier: "marquee", name: "", detail: "", icon: "" },
      { id: "recap:year:2026", tier: "recap", scope: "year", name: "", detail: "", icon: "" },
      { id: "recap:quarter:Q2 2026", tier: "recap", scope: "quarter", name: "", detail: "", icon: "" },
    ];
    const fresh = newAwards(earned, new Set());
    expect(fresh.map((a) => a.id)).toEqual([
      "recap:year:2026",
      "recap:quarter:Q2 2026",
      "recap:month:Jun 2026",
      "rank:road-captain",
    ]);
  });
});
