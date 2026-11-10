import { describe, it, expect } from "vitest";
import { dispatchBoard, APPOINTMENT_LEAD_DAYS } from "./dispatchBoard";
import type { Load } from "@/types/load";

const TODAY = "2026-11-09";
const FREE_HOURS = 3;

const load = (over: Partial<Load> = {}): Load =>
  ({
    load_number: "L1",
    load_status: "in_transit",
    payment_status: "unpaid",
    pickup_date: "2026-11-09",
    delivery_date: "2026-11-10",
    delivery_appt_start: "08:00:00",
    origin_city: "Ennis",
    origin_state: "TX",
    destination_city: "Odessa",
    destination_state: "TX",
    shipper_in: "2026-11-09T14:00:00Z",
    detention_billable: null,
    detention_paid: false,
    ...over,
  }) as unknown as Load;

describe("dispatchBoard — now", () => {
  it("reads the rolling load's delivery day, its appointment and where it frees", () => {
    const b = dispatchBoard([load()], FREE_HOURS, TODAY);
    expect(b.now).toHaveLength(1);
    expect(b.now[0]).toMatchObject({
      deliversOn: "2026-11-10",
      deliversAt: "08:00", // the column's seconds are never shown
      freeCity: "Odessa",
      freeState: "TX",
      needsInTime: false,
    });
  });
  it("flags a rolling load with no in-time — the detention clock was never started", () => {
    const b = dispatchBoard([load({ shipper_in: null })], FREE_HOURS, TODAY);
    expect(b.now[0].needsInTime).toBe(true);
    expect(b.owed.find((o) => o.kind === "intime")).toMatchObject({ count: 1, loads: ["L1"] });
  });
  it("a missing appointment is null, never a made-up time", () => {
    const b = dispatchBoard([load({ delivery_appt_start: null })], FREE_HOURS, TODAY);
    expect(b.now[0].deliversAt).toBeNull();
    expect(b.now[0].deliversOn).toBe("2026-11-10");
  });
});

describe("dispatchBoard — the gap", () => {
  it("the state that prompted this page: one rolling, nothing booked", () => {
    const b = dispatchBoard([load()], FREE_HOURS, TODAY);
    expect(b.gap).toMatchObject({
      booked: 0,
      rolling: 1,
      freeOn: "2026-11-10",
      freeAt: "08:00",
      freeCity: "Odessa",
      sittingNow: false,
    });
  });
  it("the truck frees on the LAST load to deliver, not the first", () => {
    const b = dispatchBoard(
      [load({ load_number: "A", delivery_date: "2026-11-10", destination_city: "Odessa" }),
       load({ load_number: "B", delivery_date: "2026-11-13", destination_city: "Laredo" })],
      FREE_HOURS, TODAY,
    );
    expect(b.gap.freeOn).toBe("2026-11-13");
    expect(b.gap.freeCity).toBe("Laredo");
  });
  it("with nothing rolling it reads the booked work instead", () => {
    const b = dispatchBoard(
      [load({ load_status: "booked", delivery_date: "2026-11-14", destination_city: "Tulsa" })],
      FREE_HOURS, TODAY,
    );
    expect(b.gap).toMatchObject({ booked: 1, rolling: 0, freeOn: "2026-11-14", freeCity: "Tulsa", sittingNow: false });
  });
  it("nothing rolling and nothing booked is SITTING — the loudest state on the page", () => {
    const b = dispatchBoard([load({ load_status: "delivered" })], FREE_HOURS, TODAY);
    expect(b.gap.sittingNow).toBe(true);
    expect(b.gap.freeOn).toBeNull();
  });
  it("an undated load never sets the free moment, and never blocks one that can", () => {
    const b = dispatchBoard(
      [load({ load_number: "A", delivery_date: null }),
       load({ load_number: "B", delivery_date: "2026-11-12", destination_city: "Waco" })],
      FREE_HOURS, TODAY,
    );
    expect(b.gap.freeOn).toBe("2026-11-12");
    expect(b.gap.freeCity).toBe("Waco");
  });
  it("an empty book is sitting, not a crash", () => {
    const b = dispatchBoard([], FREE_HOURS, TODAY);
    expect(b.gap.sittingNow).toBe(true);
    expect(b.now).toEqual([]);
    expect(b.owed).toEqual([]);
  });
});

describe("dispatchBoard — owed", () => {
  const far = `2026-11-${String(9 + APPOINTMENT_LEAD_DAYS + 2).padStart(2, "0")}`;
  it("a pickup inside the lead window with no window set is a call to make", () => {
    const b = dispatchBoard(
      [load({ load_number: "SOON", load_status: "booked", pickup_date: "2026-11-11", pickup_appt_start: null })],
      FREE_HOURS, TODAY,
    );
    expect(b.owed.find((o) => o.kind === "appointment")).toMatchObject({ count: 1, loads: ["SOON"] });
  });
  it("a pickup further out than the lead window is not today's problem", () => {
    const b = dispatchBoard(
      [load({ load_status: "booked", pickup_date: far, pickup_appt_start: null })],
      FREE_HOURS, TODAY,
    );
    expect(b.owed.find((o) => o.kind === "appointment")).toBeUndefined();
  });
  it("a booked load that already has its window is not chased", () => {
    const b = dispatchBoard(
      [load({ load_status: "booked", pickup_date: "2026-11-11", pickup_appt_start: "09:00:00" })],
      FREE_HOURS, TODAY,
    );
    expect(b.owed.find((o) => o.kind === "appointment")).toBeUndefined();
  });
  it("detention already PAID is finished, not a chase", () => {
    const b = dispatchBoard(
      [load({ detention_billable: true, detention_paid: true })],
      FREE_HOURS, TODAY,
    );
    expect(b.owed.find((o) => o.kind === "detention")).toBeUndefined();
  });
  it("detention confirmed and unpaid IS a chase", () => {
    const b = dispatchBoard(
      [load({ load_number: "DET", detention_billable: true, detention_paid: false })],
      FREE_HOURS, TODAY,
    );
    expect(b.owed.find((o) => o.kind === "detention")).toMatchObject({ count: 1, loads: ["DET"] });
  });
});
