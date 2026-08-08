import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import { facilityStops, agentStops, scoreStops, MIN_STOPS } from "./stopScore";

const L = (o: Record<string, unknown>): Load => o as unknown as Load;

// A load where FAC is the shipper: dwell = out−in, appt vs arrival, detention.
const shipLoad = (o: Record<string, unknown>) =>
  L({ shipper_facility_id: "FAC", detention_paid: false, ...o });

describe("facilityStops + scoreStops", () => {
  it("says 'not enough data' under the minimum", () => {
    const loads = [
      shipLoad({ shipper_in: "08:00", shipper_out: "10:00" }),
      shipLoad({ shipper_in: "08:00", shipper_out: "09:00" }),
    ];
    const score = scoreStops(facilityStops(loads, "FAC", 3));
    expect(score.timedStops).toBe(2); // < MIN_STOPS
    expect(score.hasData).toBe(false);
    expect(score.medianDwellMin).toBeNull();
  });

  it("medians dwell and counts detention past free time", () => {
    // dwells: 2h, 3h, 5h (=120,180,300 min); free 3h → detention on the 5h stop.
    const loads = [
      shipLoad({ shipper_in: "06:00", shipper_out: "08:00" }),
      shipLoad({ shipper_in: "06:00", shipper_out: "09:00" }),
      shipLoad({ shipper_in: "06:00", shipper_out: "11:00", detention_paid: false }),
    ];
    const score = scoreStops(facilityStops(loads, "FAC", 3));
    expect(score.hasData).toBe(true);
    expect(score.medianDwellMin).toBe(180); // median of 120/180/300
    expect(score.detentionCount).toBe(1); // only the 5h stop (120 over free)
    expect(score.unpaidCount).toBe(1);
  });

  it("scores on-time only over graded stops (excludes ones with no appt)", () => {
    // three graded (2 on-time, 1 late) + one with no appt (not graded)
    const loads = [
      shipLoad({ shipper_in: "08:50", shipper_out: "10:00", pickup_appt_start: "09:00" }),
      shipLoad({ shipper_in: "08:55", shipper_out: "10:00", pickup_appt_start: "09:00" }),
      shipLoad({ shipper_in: "09:30", shipper_out: "11:00", pickup_appt_start: "09:00" }),
      shipLoad({ shipper_in: "07:00", shipper_out: "08:00" }),
    ];
    const score = scoreStops(facilityStops(loads, "FAC", 3));
    expect(score.gradedStops).toBe(3); // the no-appt stop isn't graded
    expect(score.onTimePct).toBeCloseTo(2 / 3, 5); // 2 of 3 graded were on-time
  });

  it("counts an early arrival (before the window) as on-time, not against", () => {
    // window 09:00–12:00: early / within = made it; only after-the-end is late
    const loads = [
      shipLoad({ shipper_in: "07:00", shipper_out: "10:00", pickup_appt_start: "09:00", pickup_appt_end: "12:00" }), // early → waited
      shipLoad({ shipper_in: "10:00", shipper_out: "11:00", pickup_appt_start: "09:00", pickup_appt_end: "12:00" }), // within → on-time
      shipLoad({ shipper_in: "13:00", shipper_out: "14:00", pickup_appt_start: "09:00", pickup_appt_end: "12:00" }), // after end → late
    ];
    const score = scoreStops(facilityStops(loads, "FAC", 3));
    expect(score.gradedStops).toBe(3);
    expect(score.onTimePct).toBeCloseTo(2 / 3, 5); // early + within count; only the true-late one drags it
  });
});

describe("agentStops", () => {
  it("scores both stops of each load", () => {
    const loads = [
      L({
        shipper_in: "06:00",
        shipper_out: "08:00", // 2h
        receiver_in: "06:00",
        receiver_out: "10:00", // 4h → detention at 3h free
        detention_paid: false,
      }),
      L({
        shipper_in: "06:00",
        shipper_out: "07:30", // 1.5h
        receiver_in: "06:00",
        receiver_out: "07:00", // 1h
      }),
    ];
    const score = scoreStops(agentStops(loads, 3));
    expect(score.timedStops).toBe(4);
    expect(score.detentionCount).toBe(1); // the 4h receiver stop
  });
});

describe("MIN_STOPS", () => {
  it("is the documented threshold", () => {
    expect(MIN_STOPS).toBe(3);
  });
});
