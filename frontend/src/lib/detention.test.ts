import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  onTimeStatus,
  stopDetentionMinutes,
  detentionMinutes,
  detentionLabel,
  detentionEligible,
  detentionOwed,
  detentionCollected,
  detentionCollectedMinutes,
  tonuOwed,
  loadFlag,
} from "./detention";

const L = (o: Record<string, unknown>): Load => o as unknown as Load;

describe("onTimeStatus", () => {
  it("set appointment — on time if you arrive at/before it", () => {
    expect(onTimeStatus("09:00", null, "08:50")).toBe("on-time");
    expect(onTimeStatus("09:00", null, "09:15")).toBe("late");
  });
  it("window — on time inside, waited if early, late if after", () => {
    expect(onTimeStatus("06:00", "10:00", "07:30")).toBe("on-time");
    expect(onTimeStatus("06:00", "10:00", "05:30")).toBe("waited");
    expect(onTimeStatus("06:00", "10:00", "10:30")).toBe("late");
  });
  it("null when appt or arrival is missing", () => {
    expect(onTimeStatus(null, null, "09:00")).toBeNull();
    expect(onTimeStatus("09:00", null, null)).toBeNull();
  });
});

describe("stopDetentionMinutes — clock starts at the appointment, not arrival", () => {
  it("set appointment: free time runs from the appt, so early arrival earns nothing", () => {
    // appt 08:00, arrive 07:30 (early), released 12:00, free 3h → clock out 11:00 → 60 min
    expect(stopDetentionMinutes("07:30", "12:00", "08:00", null, 3)).toBe(60);
  });

  it("window: free time runs from the END of the window", () => {
    // window 08:00–11:00, released 15:20, free 3h → clock out 14:00 → 80 min
    expect(stopDetentionMinutes("07:45", "15:20", "08:00", "11:00", 3)).toBe(80);
  });

  it("is zero when released within the free window", () => {
    // appt 08:00 + 3h = 11:00; released 10:30 → nothing
    expect(stopDetentionMinutes("07:30", "10:30", "08:00", null, 3)).toBe(0);
  });

  it("does NOT charge for a long early wait (the old dwell bug)", () => {
    // arrive 05:00 for an 08:00 appt, released 10:30 — 5.5h at the dock, but
    // released before appt+3h, so ZERO detention (was 2.5h under the old rule).
    expect(stopDetentionMinutes("05:00", "10:30", "08:00", null, 3)).toBe(0);
  });

  it("falls back to arrival when no appointment is recorded", () => {
    // no appt → clock = arrival 08:50; released 14:10, free 3h → 140 min
    expect(stopDetentionMinutes("08:50", "14:10", null, null, 3)).toBe(140);
  });

  it("handles release after midnight", () => {
    // appt 22:00 + 3h = 01:00; released 01:30 → 30 min
    expect(stopDetentionMinutes("21:30", "01:30", "22:00", null, 3)).toBe(30);
  });

  it("is zero when the out time is missing", () => {
    expect(stopDetentionMinutes("08:00", null, "08:00", null, 3)).toBe(0);
  });
});

describe("detention across both stops", () => {
  const load = L({
    load_status: "delivered",
    // shipper: appt 08:00, released 11:00 → exactly free, 0
    shipper_in: "07:30",
    shipper_out: "11:00",
    pickup_appt_start: "08:00",
    pickup_appt_end: null,
    // receiver: window 09:00–12:00 (+3h free = 15:00), released 16:20 → 80 min
    receiver_in: "08:45",
    receiver_out: "16:20",
    delivery_appt_start: "09:00",
    delivery_appt_end: "12:00",
    detention_paid: false,
    detention_billable: null,
  });

  it("sums detention minutes across both stops", () => {
    expect(detentionMinutes(load, 3)).toBe(80); // 0 (shipper) + 80 (receiver)
    expect(detentionLabel(load, 3)).toBe("1h 20m");
  });
});

describe("the three states — billable is a decision, not automatic", () => {
  // Past the free window at the receiver.
  const base = {
    load_status: "delivered",
    receiver_in: "08:00",
    receiver_out: "14:00",
    delivery_appt_start: "08:00",
    delivery_appt_end: null, // appt 08:00 + 3h = 11:00; released 14:00 → 180 min
  };

  it("undecided + past free → ELIGIBLE (a nudge), NOT owed", () => {
    const l = L({ ...base, detention_billable: null, detention_paid: false });
    expect(detentionMinutes(l, 3)).toBe(180);
    expect(detentionEligible(l, 3)).toBe(true);
    expect(detentionOwed(l)).toBe(false); // no amber highlight until confirmed
  });

  it("confirmed (billable true) + unpaid → OWED, no longer just eligible", () => {
    const l = L({ ...base, detention_billable: true, detention_paid: false });
    expect(detentionOwed(l)).toBe(true);
    expect(detentionEligible(l, 3)).toBe(false);
  });

  it("dismissed (billable false) → neither owed nor eligible", () => {
    const l = L({ ...base, detention_billable: false, detention_paid: false });
    expect(detentionOwed(l)).toBe(false);
    expect(detentionEligible(l, 3)).toBe(false);
  });

  it("confirmed + paid → collected, not owed", () => {
    const l = L({ ...base, detention_billable: true, detention_paid: true });
    expect(detentionOwed(l)).toBe(false);
    expect(detentionCollected(l)).toBe(true);
    expect(detentionCollectedMinutes(l, 3)).toBe(180);
  });

  it("collected minutes are 0 for eligible-but-unconfirmed loads", () => {
    const l = L({ ...base, detention_billable: null, detention_paid: false });
    expect(detentionCollectedMinutes(l, 3)).toBe(0);
  });

  it("a load that never crossed the free window is never eligible", () => {
    const quick = L({
      receiver_in: "08:00",
      receiver_out: "10:30",
      delivery_appt_start: "08:00",
      detention_billable: null,
      detention_paid: false,
    });
    expect(detentionEligible(quick, 3)).toBe(false);
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
  const pastFree = {
    receiver_in: "08:00",
    receiver_out: "14:00",
    delivery_appt_start: "08:00",
  };

  it("unpaid TONU wins over everything", () => {
    expect(
      loadFlag(
        L({ load_status: "tonu", tonu_paid: false, detention_billable: true, ...pastFree }),
        3,
      ),
    ).toBe("tonu");
  });

  it("confirmed detention → 'detention' (amber)", () => {
    expect(
      loadFlag(L({ load_status: "delivered", detention_billable: true, ...pastFree }), 3),
    ).toBe("detention");
  });

  it("undecided-but-past-free → 'detention-eligible' (the nudge)", () => {
    expect(
      loadFlag(L({ load_status: "delivered", detention_billable: null, ...pastFree }), 3),
    ).toBe("detention-eligible");
  });

  it("in-transit when no detention applies", () => {
    expect(loadFlag(L({ load_status: "in_transit" }), 3)).toBe("in-transit");
  });

  it("null once dismissed / paid / nothing applies", () => {
    expect(
      loadFlag(L({ load_status: "delivered", detention_billable: false, ...pastFree }), 3),
    ).toBeNull();
    expect(loadFlag(L({ load_status: "delivered" }), 3)).toBeNull();
  });
});
