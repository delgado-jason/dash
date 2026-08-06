import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import type { ScoreBasis } from "@/lib/metrics/loadScore";
import {
  dispatcherMedals,
  dispatcherPatches,
  dispatcherEarnedAwards,
  type DispatcherAwardInput,
} from "./dispatcherAwards";

const baseLoad: Load = {
  load_id: "L",
  load_number: "1",
  load_type: "standard flatbed",
  load_status: "delivered",
  broker_id: "b",
  broker: "B",
  agent_id: "a1",
  agent: "A",
  agent_email: null,
  pickup_date: "2026-06-10T04:00:00.000Z",
  origin_market_id: "m",
  origin_city: "X",
  origin_state: "TX",
  origin_market: "M",
  destination_market_id: "m2",
  destination_city: "Y",
  destination_state: "TN",
  delivery_market: "M2",
  delivery_date: "2026-06-12T04:00:00.000Z",
  deadhead_miles: 0,
  loaded_miles: 1000,
  linehaul: "5000",
  fuel_surcharge: "0",
  total_accessorials: "0",
  commodity: null,
  odometer_start: null,
  odometer_end: null,
  payment_status: "paid",
  booked_by: "me",
  detention_paid: false,
  created_at: "",
  updated_at: "",
};
const mk = (o: Partial<Load>): Load => ({ ...baseLoad, ...o });

const ladder: RateLadder = { walkAway: 4, minimum: 4.5, target: 5, strong: 6 };
// A basis where break-even ≈ $1/driven-mile, so a $10/mi load scores a STEAL.
const scoreBasis: ScoreBasis = { costPerDrivenMile: 1, payTake: 1 };

const input = (loads: Load[]): DispatcherAwardInput => ({
  loads,
  userId: "me",
  ladder,
  scoreBasis,
  freeHours: 2,
  streak: 0,
});

// A steal-quality load: $10/mi gross, no deadhead.
const stealLoad = (over: Partial<Load>) =>
  mk({ loaded_miles: 1000, linehaul: "10000", deadhead_miles: 0, ...over });

describe("dispatcherMedals", () => {
  it("tiers a rare feat on how many times earned, scoped to her non-cancelled loads", () => {
    const loads = [
      ...Array.from({ length: 5 }, (_, i) => stealLoad({ load_id: `S${i}` })),
      stealLoad({ load_id: "OTHER", booked_by: "someone-else" }), // excluded
      stealLoad({ load_id: "CX", load_status: "cancelled" }), // excluded
    ];
    const steal = dispatcherMedals(input(loads)).find((m) => m.key === "disp-steal")!;
    expect(steal.tier).toBe(2); // 5 steals → tiers [1,5,15] → II
  });

  it("Big Week tiers on the best single week's load count", () => {
    // 12 loads, all same week → best week = 12 → tiers [5,10,15] → II
    const loads = Array.from({ length: 12 }, (_, i) => mk({ load_id: `W${i}` }));
    const bw = dispatcherMedals(input(loads)).find((m) => m.key === "disp-big-week")!;
    expect(bw.tier).toBe(2);
  });
});

describe("dispatcherPatches", () => {
  it("counts the grind and reports milestone progress", () => {
    const loads = Array.from({ length: 30 }, (_, i) => mk({ load_id: `D${i}` }));
    const deal = dispatcherPatches(input(loads)).find((p) => p.key === "disp-deal-closer")!;
    expect(deal.earned).toBe(true);
    expect(deal.badge).toBe("×30");
    expect(deal.reached).toBe(1); // ≥25, <75 → 1 milestone
  });

  it("Lean Machine measures deadhead from the odometer, not the planning field", () => {
    const loads = [
      // Ran 1,050 mi to haul 1,000 → 4.8% actually empty → lean.
      mk({ load_id: "R", loaded_miles: 1000, odometer_start: 570000, odometer_end: 571050 }),
      // A tiny planning estimate but no odometer window: we don't know what it
      // really ran, so it can't count as lean.
      mk({ load_id: "U", loaded_miles: 1000, deadhead_miles: 10 }),
    ];
    const lean = dispatcherPatches(input(loads)).find((p) => p.key === "disp-lean")!;
    expect(lean.badge).toBe("×1"); // only the measured load
  });

  it("only counts her bookings", () => {
    const loads = [
      mk({ load_id: "A", booked_by: "me" }),
      mk({ load_id: "B", booked_by: "other" }),
      mk({ load_id: "C", booked_by: "me", load_status: "cancelled" }),
    ];
    const deal = dispatcherPatches(input(loads)).find((p) => p.key === "disp-deal-closer")!;
    expect(deal.badge).toBe("×1"); // only the one non-cancelled load she booked
  });

  it("Backhaul Boss chains loads whose origin market = the prior load's delivery market", () => {
    const loads = [
      mk({ load_id: "1", pickup_date: "2026-06-01T04:00:00.000Z", origin_market_id: "m", destination_market_id: "m2" }),
      mk({ load_id: "2", pickup_date: "2026-06-05T04:00:00.000Z", origin_market_id: "m2", destination_market_id: "m3" }), // chains off #1
      mk({ load_id: "3", pickup_date: "2026-06-10T04:00:00.000Z", origin_market_id: "m3", destination_market_id: "m4" }), // chains off #2
      mk({ load_id: "4", pickup_date: "2026-06-15T04:00:00.000Z", origin_market_id: "zzz", destination_market_id: "m5" }), // breaks it
    ];
    const bh = dispatcherPatches(input(loads)).find((p) => p.key === "disp-backhaul-boss")!;
    expect(bh.badge).toBe("×2"); // two consecutive market matches
    expect(bh.reached).toBe(0); // 2 < first milestone (3)
  });
});

describe("dispatcherEarnedAwards", () => {
  it("emits medal (tier) and patch (milestone) ids for the pop system", () => {
    const loads = Array.from({ length: 30 }, (_, i) => stealLoad({ load_id: `S${i}` }));
    const ids = dispatcherEarnedAwards(input(loads)).map((a) => a.id);
    // 30 steals → tier III (≥15)
    expect(ids).toContain("medal:disp-steal:3");
    // 30 loads booked → Deal Closer milestone 1
    expect(ids).toContain("patch:disp-deal-closer:1");
  });

  it("returns nothing before anything is earned", () => {
    expect(dispatcherEarnedAwards(input([]))).toEqual([]);
  });
});
