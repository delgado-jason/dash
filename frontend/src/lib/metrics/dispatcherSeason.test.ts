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
// `n` booked loads at a rate, distinct ids.
const nAt = (n: number, r: number): Load[] =>
  Array.from({ length: n }, (_, i) => atRpm(r, { load_id: `b${i}` }));

const trophy = (loads: Load[], key: "booking" | "rate" | "perfect") =>
  currentSeason(loads, "me", "month", ladder, 2, now).trophies.find(
    (t) => t.key === key,
  )!;

describe("dispatchSeason trophies", () => {
  it("Booking Champion earns at the month bar and shows progress below it", () => {
    const bar = BOOKING_BAR.month;
    const won = trophy(nAt(bar, 5), "booking");
    expect(won.earned).toBe(true);
    expect(won.detail).toBe(`${bar} loads booked`);
    expect(won.progress).toBe(1);

    const short = trophy(nAt(bar - 1, 5), "booking");
    expect(short.earned).toBe(false);
    expect(short.detail).toBe(`${bar - 1} / ${bar} loads`);
    expect(short.progress).toBeCloseTo((bar - 1) / bar, 6);

    expect(trophy([], "booking").progress).toBe(0);
  });

  it("Booking Champion caps progress at 1 past the bar", () => {
    const over = trophy(nAt(BOOKING_BAR.month + 2, 5), "booking");
    expect(over.earned).toBe(true);
    expect(over.progress).toBe(1);
  });

  it("Rate Champion earns when the period averages at/above target", () => {
    const over = [atRpm(6, { load_id: "a" }), atRpm(5, { load_id: "b" })]; // avg 5.5
    const won = trophy(over, "rate");
    expect(won.earned).toBe(true);
    expect(won.progress).toBe(1);

    const under = [atRpm(4, { load_id: "a" }), atRpm(4, { load_id: "b" })];
    const short = trophy(under, "rate");
    expect(short.earned).toBe(false);
    expect(short.progress).toBeCloseTo(4 / 5, 6); // avg 4 vs target 5

    expect(trophy([], "rate").progress).toBe(0); // no rate yet
  });

  it("Perfect Period needs every load at/above target and counts the misses", () => {
    const perfect = [atRpm(5, { load_id: "a" }), atRpm(6, { load_id: "b" })];
    const won = trophy(perfect, "perfect");
    expect(won.earned).toBe(true);
    expect(won.progress).toBe(1);

    const oneUnder = [atRpm(5, { load_id: "a" }), atRpm(4, { load_id: "b" })];
    const p = trophy(oneUnder, "perfect");
    expect(p.earned).toBe(false);
    expect(p.detail).toBe("1 load under target");
    expect(p.progress).toBeCloseTo(0.5, 6); // 1 of 2 at target

    expect(trophy([], "perfect").progress).toBe(0); // no loads yet
  });

  it("Perfect Period stays at zero progress while the ladder has no target", () => {
    // bookingLadder.target is null until the P&L fetch resolves (and forever
    // with no expense periods) — the meter must not light under "no target set".
    const noTarget: RateLadder = { walkAway: null, minimum: null, target: null, strong: null };
    const p = currentSeason([atRpm(5)], "me", "month", noTarget, 2, now).trophies.find(
      (t) => t.key === "perfect",
    )!;
    expect(p.earned).toBe(false);
    expect(p.detail).toBe("no target set");
    expect(p.progress).toBe(0);
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
    // Exactly the month bar — enough for the month, short of the quarter.
    expect(BOOKING_BAR.month).toBeLessThan(BOOKING_BAR.quarter);
    const loads = nAt(BOOKING_BAR.month, 6);
    const ids = dispatcherSeasonAwards(loads, "me", ladder, 2, now).map((a) => a.id);
    // Month: at the bar, avg 6 ≥ target, all at target → all three.
    expect(ids).toContain("trophy:disp-booking:month:Jun 2026");
    expect(ids).toContain("trophy:disp-rate:month:Jun 2026");
    expect(ids).toContain("trophy:disp-perfect:month:Jun 2026");
    // Quarter: rate/perfect earn, but the month bar is under the quarter bar so
    // no booking champion.
    expect(ids).toContain("trophy:disp-rate:quarter:Q2 2026");
    expect(ids).not.toContain("trophy:disp-booking:quarter:Q2 2026");
    expect(dispatcherSeasonAwards([], "me", ladder, 2, now)).toEqual([]);
  });
});
