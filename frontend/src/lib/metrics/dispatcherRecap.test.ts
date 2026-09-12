import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { RateLadder } from "./rateTargets";
import { rangeFor } from "./recap";
import { BOOKING_BAR } from "./dispatcherSeason";
import { dispatcherRecap } from "./dispatcherRecap";

const ladder: RateLadder = { walkAway: 4, minimum: 4.5, target: 5, strong: 6 };
const FREE_HOURS = 2;

// A delivered load she booked: 1000 loaded miles at $5/mi unless overridden.
const L = (o: Record<string, unknown>): Load =>
  ({
    load_id: "L",
    load_status: "delivered",
    booked_by: "me",
    pickup_date: "2026-08-12T04:00:00.000Z",
    delivery_date: "2026-08-14T04:00:00.000Z",
    loaded_miles: 1000,
    linehaul: "5000",
    fuel_surcharge: "0",
    total_accessorials: "0",
    agent: "Redwood",
    origin_market: "Dallas",
    delivery_market: "Memphis",
    ...o,
  }) as unknown as Load;

// Aug 2026 — Aug 1 is a Saturday, so the Wed-start pay weeks run Jul 29–Aug 4
// (partial: only Aug 1–4 pickups are in range), Aug 5–11, 12–18, 19–25, and
// Aug 26–Sep 1 (straddles the month end).
const AUG = rangeFor("month", 2026, 7);

describe("dispatcherRecap", () => {
  it("returns nulls (not zeros) and 0 detention for an empty period", () => {
    const r = dispatcherRecap([], "me", "month", AUG, ladder, FREE_HOURS);
    expect(r.hasData).toBe(false);
    expect(r.loadsBooked).toBe(0);
    expect(r.avgRpm).toBeNull();
    expect(r.onTimePct).toBeNull();
    expect(r.bestLoad).toBeNull();
    expect(r.topAgent).toBeNull();
    expect(r.topLane).toBeNull();
    expect(r.bestWeekGross).toBeNull();
    expect(r.detentionCollectedMin).toBe(0);
  });

  it("counts only her own non-cancelled loads picked up inside the range", () => {
    const loads = [
      L({ load_id: "mine" }),
      L({ load_id: "other", booked_by: "someone", linehaul: "9000" }),
      L({ load_id: "cx", load_status: "cancelled", linehaul: "9000" }),
      L({ load_id: "july", pickup_date: "2026-07-30T04:00:00.000Z", linehaul: "9000" }),
      L({ load_id: "sept", pickup_date: "2026-09-01T04:00:00.000Z", linehaul: "9000" }),
    ];
    const r = dispatcherRecap(loads, "me", "month", AUG, ladder, FREE_HOURS);
    expect(r.loadsBooked).toBe(1);
    expect(r.grossBooked).toBe(5000);
    expect(r.bestWeekGross).toBe(5000);
  });

  it("sums detention only when it is confirmed billable AND paid", () => {
    // Appt 08:00, released 12:00, 2h free → 120 billable minutes at the shipper.
    const dwell = {
      pickup_appt_start: "08:00:00",
      shipper_in: "08:00:00",
      shipper_out: "12:00:00",
    };
    const loads = [
      L({ load_id: "collected", ...dwell, detention_billable: true, detention_paid: true }),
      L({ load_id: "owed", ...dwell, detention_billable: true, detention_paid: false }),
      L({ load_id: "undecided", ...dwell, detention_billable: null, detention_paid: true }),
      L({ load_id: "dismissed", ...dwell, detention_billable: false, detention_paid: true }),
    ];
    const r = dispatcherRecap(loads, "me", "month", AUG, ladder, FREE_HOURS);
    expect(r.detentionCollectedMin).toBe(120);
  });

  it("buckets best week by pay-week (Wed–Tue), across the month boundary", () => {
    const loads = [
      L({ load_id: "a", pickup_date: "2026-08-25T04:00:00.000Z", linehaul: "5000" }), // Tue → week of Aug 19
      L({ load_id: "b", pickup_date: "2026-08-26T04:00:00.000Z", linehaul: "3000" }), // Wed → week of Aug 26
      L({ load_id: "c", pickup_date: "2026-08-31T04:00:00.000Z", linehaul: "4000" }), // Mon → same week
      L({ load_id: "d", pickup_date: "2026-09-01T04:00:00.000Z", linehaul: "9000" }), // Sep — outside the range
    ];
    const r = dispatcherRecap(loads, "me", "month", AUG, ladder, FREE_HOURS);
    expect(r.loadsBooked).toBe(3);
    expect(r.bestWeekGross).toBe(7000); // b + c, not a alone, not d
  });

  it("counts a lone load in the partial leading pay-week as her best week", () => {
    // Her only August load was picked up Aug 3 (the Jul 29–Aug 4 week). Best
    // week must be that load's gross, not $0 from the empty full weeks.
    const loads = [
      L({ load_id: "lead", pickup_date: "2026-08-03T04:00:00.000Z", linehaul: "8000" }),
    ];
    const r = dispatcherRecap(loads, "me", "month", AUG, ladder, FREE_HOURS);
    expect(r.loadsBooked).toBe(1);
    expect(r.bestWeekGross).toBe(8000);
  });

  it("lets a full week beat the clipped partial leading week", () => {
    const loads = [
      L({ load_id: "lead", pickup_date: "2026-08-03T04:00:00.000Z", linehaul: "4000" }), // Jul 29–Aug 4 week
      L({ load_id: "july", pickup_date: "2026-07-30T04:00:00.000Z", linehaul: "9000" }), // same week, out of range
      L({ load_id: "full-a", pickup_date: "2026-08-12T04:00:00.000Z", linehaul: "3000" }), // Aug 12–18 week
      L({ load_id: "full-b", pickup_date: "2026-08-18T04:00:00.000Z", linehaul: "3000" }), // same week
    ];
    const r = dispatcherRecap(loads, "me", "month", AUG, ladder, FREE_HOURS);
    expect(r.loadsBooked).toBe(3);
    expect(r.bestWeekGross).toBe(6000); // full-a + full-b; the July load never leaks in
  });

  it("carries Booking Champion progress at the per-booker bars", () => {
    const Q3 = rangeFor("quarter", 2026, 2);
    const half = BOOKING_BAR.quarter / 2;
    const some = Array.from({ length: half }, (_, i) => L({ load_id: `q${i}` }));
    const booking = dispatcherRecap(some, "me", "quarter", Q3, ladder, FREE_HOURS)
      .trophies.find((t) => t.key === "booking")!;
    expect(booking.earned).toBe(false);
    expect(booking.detail).toBe(`${half} / ${BOOKING_BAR.quarter} loads`);
    expect(booking.progress).toBeCloseTo(0.5, 6);

    const Y = rangeFor("year", 2026, 0);
    const plenty = Array.from({ length: BOOKING_BAR.year }, (_, i) => L({ load_id: `y${i}` }));
    const won = dispatcherRecap(plenty, "me", "year", Y, ladder, FREE_HOURS)
      .trophies.find((t) => t.key === "booking")!;
    expect(won.earned).toBe(true);
    expect(won.progress).toBe(1);
  });
});
