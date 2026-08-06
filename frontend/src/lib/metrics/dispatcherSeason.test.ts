import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { RateLadder } from "./rateTargets";
import {
  currentSeason,
  dispatcherSeasonAwards,
  BOOKING_BAR,
} from "./dispatcherSeason";

// now = mid-June 2026 → current month "Jun 2026", quarter "Q2 2026", year "2026".
const now = new Date("2026-06-15T00:00:00Z");
const ladder: RateLadder = { walkAway: 4, minimum: 4.5, target: 5, strong: 6 };

const base: Load = {
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
  origin_market: "Dallas",
  destination_market_id: "m2",
  destination_city: "Y",
  destination_state: "TN",
  delivery_market: "Memphis",
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
// A booked load at a chosen gross $/mile (1000 loaded miles).
const atRpm = (r: number, o: Partial<Load> = {}): Load => ({
  ...base,
  loaded_miles: 1000,
  linehaul: String(r * 1000),
  ...o,
});

describe("dispatchSeason trophies", () => {
  it("Booking Champion earns at the month bar and shows progress below it", () => {
    const eight = Array.from({ length: BOOKING_BAR.month }, (_, i) =>
      atRpm(5, { load_id: `b${i}` }),
    );
    const won = currentSeason(eight, "me", "month", ladder, 2, now).trophies.find(
      (t) => t.key === "booking",
    )!;
    expect(won.earned).toBe(true);
    expect(won.detail).toBe("8 loads booked");

    const short = currentSeason(eight.slice(0, 7), "me", "month", ladder, 2, now)
      .trophies.find((t) => t.key === "booking")!;
    expect(short.earned).toBe(false);
    expect(short.detail).toBe("7 / 8 loads");
  });

  it("Rate Champion earns when the period averages at/above target", () => {
    const over = [atRpm(6, { load_id: "a" }), atRpm(5, { load_id: "b" })]; // avg 5.5
    expect(
      currentSeason(over, "me", "month", ladder, 2, now).trophies.find(
        (t) => t.key === "rate",
      )!.earned,
    ).toBe(true);
    const under = [atRpm(4, { load_id: "a" }), atRpm(4, { load_id: "b" })];
    expect(
      currentSeason(under, "me", "month", ladder, 2, now).trophies.find(
        (t) => t.key === "rate",
      )!.earned,
    ).toBe(false);
  });

  it("Perfect Period needs every load at/above target and counts the misses", () => {
    const perfect = [atRpm(5, { load_id: "a" }), atRpm(6, { load_id: "b" })];
    expect(
      currentSeason(perfect, "me", "month", ladder, 2, now).trophies.find(
        (t) => t.key === "perfect",
      )!.earned,
    ).toBe(true);
    const oneUnder = [atRpm(5, { load_id: "a" }), atRpm(4, { load_id: "b" })];
    const p = currentSeason(oneUnder, "me", "month", ladder, 2, now).trophies.find(
      (t) => t.key === "perfect",
    )!;
    expect(p.earned).toBe(false);
    expect(p.detail).toBe("1 load under target");
  });

  it("scopes to the person's own non-cancelled loads inside the period", () => {
    const loads = [
      atRpm(5, { load_id: "mine" }),
      atRpm(5, { load_id: "other", booked_by: "someone" }),
      atRpm(5, { load_id: "cx", load_status: "cancelled" }),
      atRpm(5, { load_id: "old", pickup_date: "2026-01-05T04:00:00.000Z" }),
    ];
    const s = currentSeason(loads, "me", "month", ladder, 2, now);
    expect(s.loadsBooked).toBe(1);
    expect(s.grossBooked).toBe(5000);
  });
});

describe("dispatcherSeasonAwards", () => {
  it("emits only earned trophies keyed by scope + period; empty when none", () => {
    const eight = Array.from({ length: 8 }, (_, i) => atRpm(6, { load_id: `b${i}` }));
    const ids = dispatcherSeasonAwards(eight, "me", ladder, 2, now).map((a) => a.id);
    // Month: 8 loads, avg 6 ≥ target, all at target → all three.
    expect(ids).toContain("trophy:disp-booking:month:Jun 2026");
    expect(ids).toContain("trophy:disp-rate:month:Jun 2026");
    expect(ids).toContain("trophy:disp-perfect:month:Jun 2026");
    // Quarter: rate/perfect earn, but 8 < 24 so no booking champion.
    expect(ids).toContain("trophy:disp-rate:quarter:Q2 2026");
    expect(ids).not.toContain("trophy:disp-booking:quarter:Q2 2026");
    expect(dispatcherSeasonAwards([], "me", ladder, 2, now)).toEqual([]);
  });
});
