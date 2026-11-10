import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  onTimeStatus,
  stopDetentionMinutes,
  detentionMinutes,
  detentionLabel,
  detentionEligible,
  detentionBar,
  detentionOwed,
  detentionCollected,
  detentionCollectedMinutes,
  tonuOwed,
  loadFlag,
  DEFAULT_DETENTION_FREE_HOURS,
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

describe("stopDetentionMinutes — the clock starts at the later of arrival and appointment", () => {
  it("set appointment: free time runs from the appt, so early arrival earns nothing", () => {
    // appt 08:00, arrive 07:30 (early), released 12:00, free 3h → clock out 11:00 → 60 min
    expect(stopDetentionMinutes("07:30", "12:00", "08:00", null, 3)).toBe(60);
  });

  it("window: free time runs from the window's START, never its end", () => {
    // Jason's rule (2026-11-10): inside a window the clock starts when you
    // arrive; before it opens, when it opens. The window's END only decides
    // lateness. Window 08:00–11:00, in 07:45 (early) → clock from 08:00, free
    // to 11:00, released 15:20 → 260 min.
    //
    // This used to anchor on the window's END (free to 14:00 → 80 min), which
    // on a wide window made detention unclaimable no matter how long the truck
    // sat — load 1045087's 07:00–23:45 "window" scored zero on a 9-hour hold.
    expect(stopDetentionMinutes("07:45", "15:20", "08:00", "11:00", 3)).toBe(260);
  });

  it("inside a window, the clock starts on ARRIVAL — that is what a window is", () => {
    // Window 08:00–12:00, backed in 09:30 → free to 12:30, released 14:00 → 90.
    expect(stopDetentionMinutes("09:30", "14:00", "08:00", "12:00", 3)).toBe(90);
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

  it("claims NOTHING when no appointment is recorded, however long the dwell", () => {
    // Jason's rule (2026-11-10): "a late arrival or missing an appointment time
    // means I will not be able to claim detention." This stop sat 5h20m — and
    // the old rule billed 140 minutes of it by counting free time from arrival.
    // Nobody pays that, so dash no longer offers it as a claim.
    expect(stopDetentionMinutes("08:50", "14:10", null, null, 3)).toBe(0);
    expect(detentionBar(null, null, "08:50")).toBe("no-appointment");
  });

  it("claims NOTHING on a late arrival, because lateness forfeits the claim", () => {
    // 08:00 appointment, in at 09:44 (load 2194005's live receiver stop), out
    // at 12:30. The old rule counted from 11:00 and offered 1h30m — detention
    // for two hours the truck was not even at the dock.
    expect(stopDetentionMinutes("09:44", "12:30", "08:00", null, 3)).toBe(0);
    expect(detentionBar("08:00", null, "09:44")).toBe("late");
  });

  it("early still claims — you were there and waiting from when you were due", () => {
    // Window 08:00–11:00, in at 06:00 ("waited"), out at 15:00. The two early
    // hours are his own, so the clock starts at 08:00: free to 11:00 → 240 min.
    expect(detentionBar("08:00", "11:00", "06:00")).toBe(null);
    expect(stopDetentionMinutes("06:00", "15:00", "08:00", "11:00", 3)).toBe(240);
  });

  it("claims nothing with no in-time — there is no way to know if it was late", () => {
    expect(detentionBar("08:00", null, null)).toBe("no-arrival");
    expect(stopDetentionMinutes(null, "14:10", "08:00", null, 3)).toBe(0);
  });

  it("handles release after midnight", () => {
    // appt 22:00 + 3h = 01:00; released 01:30 → 30 min
    expect(stopDetentionMinutes("21:30", "01:30", "22:00", null, 3)).toBe(30);
  });

  it("does NOT wrap a same-day release that beats the window end (load 1469377 bug)", () => {
    // window 08:00–11:00, arrive 07:00, released 08:23 — inside the window, so
    // ZERO. The old rule wrapped 08:23 past midnight (out < window-end) and
    // charged ~18h. Anchoring the wrap on arrival keeps it at 0.
    expect(stopDetentionMinutes("07:00", "08:23", "08:00", "11:00", 3)).toBe(0);
    // Its receiver stop: window 07:00–08:00, in 06:00 (early), released 12:54.
    // The clock starts when the window opens at 07:00 → free to 10:00 → 174.
    // Was 114 when the window's END anchored it.
    expect(stopDetentionMinutes("06:00", "12:54", "07:00", "08:00", 3)).toBe(174);
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
    // receiver: window 09:00–12:00, in 08:45 (early) → clock from 09:00, free
    // to 12:00, released 16:20 → 260 min
    receiver_in: "08:45",
    receiver_out: "16:20",
    delivery_appt_start: "09:00",
    delivery_appt_end: "12:00",
    detention_paid: false,
    detention_billable: null,
  });

  it("sums detention minutes across both stops", () => {
    expect(detentionMinutes(load, 3)).toBe(260); // 0 (shipper) + 260 (receiver)
    expect(detentionLabel(load, 3)).toBe("4h 20m");
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

describe("GL-150 — the free hours come from the settlement schedule", () => {
  it("a 2-hour schedule bills from the third hour; a 3-hour one from the fourth", () => {
    // appointment 08:00, released 11:30 → 3h30 past the clock
    expect(stopDetentionMinutes("07:30", "11:30", "08:00", null, 2)).toBe(90);
    expect(stopDetentionMinutes("07:30", "11:30", "08:00", null, 3)).toBe(30);
    // released at exactly 10:00: nothing billed at 2 free hours, nothing at 3
    expect(stopDetentionMinutes("07:30", "10:00", "08:00", null, 2)).toBe(0);
    expect(stopDetentionMinutes("07:30", "10:01", "08:00", null, 2)).toBe(1);
  });
  it("the load-level totals follow the schedule's value", () => {
    const l = L({
      load_status: "delivered",
      shipper_in: "07:30", shipper_out: "11:00", pickup_appt_start: "08:00", pickup_appt_end: null,
      receiver_in: null, receiver_out: null, delivery_appt_start: null, delivery_appt_end: null,
      detention_paid: false, detention_billable: null,
    });
    expect(detentionMinutes(l, 2)).toBe(60);
    expect(detentionMinutes(l, 3)).toBe(0);
    expect(detentionEligible(l, 2)).toBe(true);
    expect(detentionEligible(l, 3)).toBe(false);
  });
  it("the fallback, used only when no schedule exists, is 3", () => {
    expect(DEFAULT_DETENTION_FREE_HOURS).toBe(3);
  });
});
