import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { getQuarterPace } from "./quarterPace";

const load = (delivery_date: string, net: number): Load => ({
  load_id: delivery_date + ":" + net,
  load_number: "1",
  load_type: "standard flatbed",
  load_status: "delivered",
  broker_id: "b",
  broker: "B",
  agent_id: "a",
  agent: "A",
  agent_email: null,
  pickup_date: delivery_date,
  origin_market_id: "m",
  origin_city: "X",
  origin_state: "TX",
  origin_market: "M",
  destination_market_id: "m2",
  destination_city: "Y",
  destination_state: "TN",
  delivery_market: "M2",
  delivery_date,
  deadhead_miles: 0,
  loaded_miles: 1000,
  linehaul: "0",
  fuel_surcharge: "0",
  total_accessorials: "0",
  net_revenue: String(net),
  commodity: null,
  payment_status: "paid",
  created_at: "",
  updated_at: "",
});

// Q2 = Apr–Jun (previous), Q3 = Jul–Sep (current). NOW = day 37 of Q3.
const NOW = new Date("2026-08-06T12:00:00Z");
// Two Q2 loads inside its first 37 days (→ same-point $20k), two later (→ final $40k).
const q2 = [
  load("2026-04-15", 10000),
  load("2026-04-20", 10000),
  load("2026-05-20", 10000),
  load("2026-06-10", 10000),
];

describe("getQuarterPace", () => {
  it("projects off last quarter's same-point pace and calls a beat", () => {
    // $24k over 3 loads by day 37 vs Q2's $20k by day 37 → +20% → projects $48k.
    const q3 = [
      load("2026-07-10", 8000),
      load("2026-07-20", 8000),
      load("2026-08-01", 8000),
    ];
    const p = getQuarterPace([...q2, ...q3], NOW);
    expect(p.label).toBe("Q3 2026");
    expect(p.prevLabel).toBe("Q2 2026");
    expect(p.currentNet).toBe(24000);
    expect(p.currentLoads).toBe(3);
    expect(p.prevSamePointNet).toBe(20000);
    expect(p.prevFinalNet).toBe(40000);
    expect(p.pacePct).toBeCloseTo(0.2, 5);
    expect(p.projectedNet).toBeCloseTo(48000, 2);
    expect(p.verdict).toBe("beat");
  });

  it("calls behind when pacing under last quarter", () => {
    const q3 = [
      load("2026-07-10", 5000),
      load("2026-07-20", 5000),
      load("2026-08-01", 6000),
    ]; // $16k vs $20k same-point → 0.8 → projects $32k < $40k
    const p = getQuarterPace([...q2, ...q3], NOW);
    expect(p.projectedNet).toBeCloseTo(32000, 2);
    expect(p.verdict).toBe("behind");
  });

  it("calls even inside the ±2% band", () => {
    const q3 = [
      load("2026-07-10", 6700),
      load("2026-07-20", 6700),
      load("2026-08-01", 6700),
    ]; // $20.1k ≈ $20k same-point → ~+0.5% → even
    expect(getQuarterPace([...q2, ...q3], NOW).verdict).toBe("even");
  });

  it("holds back a verdict while it's too early to call", () => {
    const early = new Date("2026-07-06T12:00:00Z"); // day 6 of Q3
    const q3 = [load("2026-07-02", 8000), load("2026-07-04", 8000)];
    const p = getQuarterPace([...q2, ...q3], early);
    expect(p.verdict).toBe("early");
    expect(p.projectedNet).toBeNull();
  });

  it("has no verdict when there's no prior quarter to compare", () => {
    const q3 = [
      load("2026-07-10", 8000),
      load("2026-07-20", 8000),
      load("2026-08-01", 8000),
    ];
    const p = getQuarterPace(q3, NOW); // no Q2 loads
    expect(p.verdict).toBe("no-prior");
    expect(p.prevFinalNet).toBe(0);
  });
});
