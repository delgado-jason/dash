import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { currentSeason } from "./dispatcherSeason";

// now = mid-June 2026 → current month "Jun 2026", quarter "Q2 2026", year "2026".
const now = new Date("2026-06-15T00:00:00Z");

const base: Load = {
  load_id: "L",
  load_number: "1",
  load_type: "standard flatbed",
  load_status: "delivered",
  agency_id: "b",
  agency_code: "B",
  posting_code: null,
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

describe("a TONU is never a booked load (GL-104)", () => {
  it("the booking count and the season rate ignore it", () => {
    const real = nAt(3, 5);
    const withTonu = [...real, atRpm(8.31, { load_id: "t", load_status: "tonu" })];
    const a = currentSeason(withTonu, "me", "month", 2, now);
    const b = currentSeason(real, "me", "month", 2, now);
    expect(a.loadsBooked).toBe(b.loadsBooked);
    expect(a.grossBooked).toBe(b.grossBooked);
    expect(a.avgRpm).toBe(b.avgRpm);
  });
});

describe("dispatchSeason", () => {
  it("scopes to the person's own non-cancelled loads inside the period", () => {
    const loads = [
      atRpm(5, { load_id: "mine" }),
      atRpm(5, { load_id: "other", booked_by: "someone" }),
      atRpm(5, { load_id: "cx", load_status: "cancelled" }),
      atRpm(5, { load_id: "old", pickup_date: "2026-01-05T04:00:00.000Z" }),
    ];
    const s = currentSeason(loads, "me", "month", 2, now);
    expect(s.loadsBooked).toBe(1);
    expect(s.grossBooked).toBe(5000);
  });
});
