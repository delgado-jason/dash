import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  onTimeStatus,
  stopDetentionMinutes,
  detentionMinutes,
  detentionLabel,
  detentionOwed,
  tonuOwed,
  loadFlag,
} from "./detention";

const L = (o: Record<string, unknown>): Load => o as unknown as Load;

describe("onTimeStatus", () => {
  it("set appointment — on time if you arrive at/before it", () => {
    expect(onTimeStatus("09:00", null, "08:50")).toBe("on-time");
    expect(onTimeStatus("09:00", null, "09:00")).toBe("on-time");
    expect(onTimeStatus("09:00", null, "09:15")).toBe("late");
  });

  it("window — on time inside, waited if early, late if after", () => {
    expect(onTimeStatus("06:00", "10:00", "07:30")).toBe("on-time");
    expect(onTimeStatus("06:00", "10:00", "06:00")).toBe("on-time");
    expect(onTimeStatus("06:00", "10:00", "10:00")).toBe("on-time");
    expect(onTimeStatus("06:00", "10:00", "05:30")).toBe("waited");
    expect(onTimeStatus("06:00", "10:00", "10:30")).toBe("late");
  });

  it("null when appt or arrival is missing", () => {
    expect(onTimeStatus(null, null, "09:00")).toBeNull();
    expect(onTimeStatus("09:00", null, null)).toBeNull();
  });
});

describe("stopDetentionMinutes", () => {
  it("charges dwell beyond the free window", () => {
    // 08:50 → 14:10 = 5h20m = 320 min; free 3h → 140 billable
    expect(stopDetentionMinutes("08:50", "14:10", 3)).toBe(140);
  });

  it("is zero within the free window", () => {
    expect(stopDetentionMinutes("06:00", "07:30", 3)).toBe(0);
  });

  it("is zero when times are missing", () => {
    expect(stopDetentionMinutes(null, "07:30", 3)).toBe(0);
  });

  it("honors a lower free-time setting", () => {
    // same 90-min stay bills 30 when free time drops to 1h
    expect(stopDetentionMinutes("06:00", "07:30", 1)).toBe(30);
  });
});

describe("detention across both stops + owed/paid", () => {
  const load = L({
    load_status: "delivered",
    shipper_in: "08:50",
    shipper_out: "14:10", // 5h20 → 140 billable at 3h free
    receiver_in: "06:00",
    receiver_out: "07:30", // under free → 0
    detention_paid: false,
    tonu_paid: false,
  });

  it("sums billable minutes across stops", () => {
    expect(detentionMinutes(load, 3)).toBe(140);
    expect(detentionLabel(load, 3)).toBe("2h 20m");
  });

  it("is owed when billable and unpaid, cleared once paid", () => {
    expect(detentionOwed(load, 3)).toBe(true);
    expect(detentionOwed({ ...load, detention_paid: true }, 3)).toBe(false);
  });

  it("is not owed when nothing crosses the free window", () => {
    const quick = L({ shipper_in: "06:00", shipper_out: "07:00", detention_paid: false });
    expect(detentionOwed(quick, 3)).toBe(false);
  });
});

describe("tonuOwed", () => {
  it("owed for an unpaid TONU, not for other statuses or once paid", () => {
    expect(tonuOwed(L({ load_status: "tonu", tonu_paid: false }))).toBe(true);
    expect(tonuOwed(L({ load_status: "tonu", tonu_paid: true }))).toBe(false);
    expect(tonuOwed(L({ load_status: "delivered", tonu_paid: false }))).toBe(false);
  });
});

describe("loadFlag priority", () => {
  const detentioned = { shipper_in: "08:00", shipper_out: "14:00" }; // 6h → owed at 3h free

  it("unpaid TONU wins even over detention", () => {
    expect(
      loadFlag(L({ load_status: "tonu", tonu_paid: false, ...detentioned }), 3),
    ).toBe("tonu");
  });

  it("unpaid detention beats in-transit", () => {
    expect(
      loadFlag(L({ load_status: "in_transit", detention_paid: false, ...detentioned }), 3),
    ).toBe("detention");
  });

  it("in-transit when nothing is owed", () => {
    expect(loadFlag(L({ load_status: "in_transit" }), 3)).toBe("in-transit");
  });

  it("null once fees are paid / nothing applies", () => {
    expect(
      loadFlag(L({ load_status: "tonu", tonu_paid: true }), 3),
    ).toBeNull();
    expect(loadFlag(L({ load_status: "delivered" }), 3)).toBeNull();
  });
});
