import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Load } from "@/types/load";
import type { RateLadder } from "./rateTargets";
import { getDispatcherCard, dispatchRank } from "./dispatcherCard";

const baseLoad: Load = {
  load_id: "L",
  load_number: "1",
  load_type: "standard flatbed",
  load_status: "delivered",
  broker_id: "b",
  broker: "B",
  agent_id: "a",
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
  loaded_miles: 0,
  linehaul: "0",
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

const ladder: RateLadder = {
  walkAway: 4.0,
  minimum: 4.5,
  target: 5.0,
  strong: 6.0,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-22T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("getDispatcherCard", () => {
  it("scopes to the user's real bookings; gross + avg rate over break-even", () => {
    const loads = [
      // mine: 1000 mi @ $5000 gross → $5.00/mi
      mk({ load_id: "A", loaded_miles: 1000, linehaul: "5000" }),
      // mine: 1000 mi @ $4400 gross → $4.40/mi
      mk({ load_id: "B", load_status: "booked", loaded_miles: 1000, linehaul: "4400" }),
      // someone else's booking → excluded
      mk({ load_id: "C", booked_by: "other", loaded_miles: 1000, linehaul: "9999" }),
      // mine but cancelled → not counted
      mk({ load_id: "D", load_status: "cancelled", loaded_miles: 1000, linehaul: "9999" }),
    ];

    const card = getDispatcherCard(loads, "me", ladder, 2, new Date());
    expect(card.loadsBookedLifetime).toBe(2);
    expect(card.loadsBookedMonth).toBe(2); // both pick up in June
    expect(card.grossBooked).toBe(9400);
    expect(card.avgBookedRate).toBeCloseTo(4.7, 5); // 9400 / 2000
    expect(card.overBreakEven).toBeCloseTo(0.7, 5); // 4.70 − 4.00
  });

  it("detention collected counts only confirmed + paid detention", () => {
    const loads = [
      // past appt (08:00) + 2h free → 180 min; confirmed billable AND paid
      mk({ load_id: "E", shipper_in: "08:00", shipper_out: "13:00", detention_billable: true, detention_paid: true }),
      // confirmed but not yet collected → excluded
      mk({ load_id: "F", shipper_in: "08:00", shipper_out: "13:00", detention_billable: true, detention_paid: false }),
      // paid flag set but never confirmed billable → excluded (shouldn't happen, but guard)
      mk({ load_id: "G", shipper_in: "08:00", shipper_out: "13:00", detention_paid: true }),
    ];
    const card = getDispatcherCard(loads, "me", ladder, 2, new Date());
    expect(card.detentionCollectedMin).toBe(180);
  });

  it("is all-zero when the user has booked nothing", () => {
    const loads = [mk({ booked_by: "other", loaded_miles: 500, linehaul: "3000" })];
    const card = getDispatcherCard(loads, "me", ladder, 2, new Date());
    expect(card.loadsBookedLifetime).toBe(0);
    expect(card.grossBooked).toBe(0);
    expect(card.avgBookedRate).toBeNull();
    expect(card.overBreakEven).toBeNull();
    expect(card.rank.name).toBe("Rookie Dispatcher");
  });
});

describe("dispatchRank", () => {
  it("climbs tiers on lifetime loads booked", () => {
    expect(dispatchRank(0).name).toBe("Rookie Dispatcher");
    expect(dispatchRank(24).name).toBe("Rookie Dispatcher");
    expect(dispatchRank(25).name).toBe("Load Wrangler");
    expect(dispatchRank(80).name).toBe("Freight Closer");
    expect(dispatchRank(500).name).toBe("Dispatch Legend");
  });

  it("reports progress toward the next tier; tops out at Legend", () => {
    const r = dispatchRank(50); // Load Wrangler [25, 75)
    expect(r.next?.name).toBe("Freight Closer");
    expect(r.toNext).toBe(25); // 75 − 50
    expect(r.pct).toBeCloseTo(0.5, 5); // (50−25)/(75−25)

    const top = dispatchRank(600);
    expect(top.next).toBeNull();
    expect(top.toNext).toBe(0);
    expect(top.pct).toBe(1);
  });
});
