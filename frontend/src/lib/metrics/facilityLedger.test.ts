import { describe, it, expect } from "vitest";
import { facilityTimes, timedStopCount } from "./facilityLedger";
import type { Load } from "@/types/load";

const load = (over: Partial<Load>): Load => over as Load;

describe("facilityTimes", () => {
  it("medians dwell across both roles and tracks the last visit", () => {
    const t = facilityTimes(
      [
        load({
          shipper_facility_id: "f1",
          shipper_in: "06:00:00",
          shipper_out: "16:45:00", // 645m
          pickup_date: "2026-07-31",
        }),
        load({
          receiver_facility_id: "f1",
          receiver_in: "07:00:00",
          receiver_out: "08:23:00", // 83m
          delivery_date: "2026-08-06",
        }),
        load({
          shipper_facility_id: "f1",
          shipper_in: "06:00:00",
          shipper_out: "12:00:00", // 360m
          pickup_date: "2026-07-24",
        }),
      ],
      "f1",
    );
    expect(t.medianDwellMin).toBe(360);
    expect(t.timed).toBe(3);
    expect(t.lastVisit).toBe("2026-08-06");
  });

  it("counts untimed visits into lastVisit but never into the median", () => {
    const t = facilityTimes(
      [
        load({ shipper_facility_id: "f1", pickup_date: "2026-05-08" }),
        load({
          shipper_facility_id: "f1",
          shipper_in: "08:00:00",
          shipper_out: "09:00:00",
          pickup_date: "2026-04-27",
        }),
      ],
      "f1",
    );
    expect(t.medianDwellMin).toBe(60);
    expect(t.timed).toBe(1);
    expect(t.lastVisit).toBe("2026-05-08");
  });

  it("falls back to pickup date for a receiver stop with no delivery date", () => {
    const t = facilityTimes(
      [load({ receiver_facility_id: "f1", pickup_date: "2026-06-01" })],
      "f1",
    );
    expect(t.lastVisit).toBe("2026-06-01");
    expect(t.medianDwellMin).toBeNull();
  });

  it("is empty for a facility with no stops", () => {
    expect(facilityTimes([], "f1")).toEqual({
      medianDwellMin: null,
      timed: 0,
      lastVisit: null,
    });
  });
});

describe("timedStopCount", () => {
  it("counts each timed stop side independently, at known facilities only", () => {
    expect(
      timedStopCount([
        load({
          shipper_facility_id: "f1",
          shipper_in: "06:00:00",
          shipper_out: "07:00:00",
          receiver_facility_id: "f2",
          receiver_in: "10:00:00",
          receiver_out: "11:00:00",
        }),
        load({
          shipper_facility_id: "f3",
          shipper_in: "06:00:00", // no out — not timed
          receiver_in: "10:00:00",
          receiver_out: "11:00:00", // timed, but no facility id
        }),
      ]),
    ).toBe(2);
  });

  it("is zero with no loads", () => {
    expect(timedStopCount([])).toBe(0);
  });
});
