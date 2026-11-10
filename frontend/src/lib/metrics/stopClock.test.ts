import { describe, it, expect } from "vitest";
import { stopClock, hm, atClock, stopProgress } from "./stopClock";

// Every moment here is built with the LOCAL Date constructor, because that is
// what an appointment is: a wall-clock time at a dock. Building fixtures in UTC
// would make these tests pass only in UTC — and `wallMoment` exists precisely
// so an 08:00 appointment is 08:00 in Texas rather than 02:00.
const DAY = "2026-11-10";
const at = (h: number, m = 0, day = 10): string =>
  new Date(2026, 10, day, h, m).toISOString();
const moment = (h: number, m = 0, day = 10): string =>
  new Date(2026, 10, day, h, m).toISOString();
const NOW = new Date(2026, 10, 10, 17, 30); // 17:30 local
const FREE = 3;

describe("stopClock — the anchor is the later of arrival and appointment", () => {
  // Jason's rule, 2026-11-10: "I can't claim detention for arriving early. I
  // can't penalize facilities for arriving early with high dwell times. The
  // dwell time starts just like how my detention time would start."
  it("a HARD appointment anchors both clocks, however early the truck rolls in", () => {
    // Due 14:00, in at 12:00, now 17:30. The two early hours are his own.
    const c = stopClock(at(12), null, "14:00:00", null, DAY, FREE, NOW);
    expect(c.anchorAt?.getTime()).toBe(new Date(2026, 10, 10, 14, 0).getTime());
    expect(c.dwellMinutes).toBe(210); // 14:00 → 17:30, NOT 330 from arrival
    expect(c.freeUntil?.getTime()).toBe(new Date(2026, 10, 10, 17, 0).getTime());
    expect(c.detentionMinutes).toBe(30);
    expect(c.noClaim).toBe(null);
  });

  it("inside a WINDOW the clock starts on ARRIVAL — that is what a window means", () => {
    // Window 08:00–12:00, backed in at 09:30. Free until 12:30.
    const c = stopClock(at(9, 30), null, "08:00:00", "12:00:00", DAY, FREE, NOW);
    expect(c.anchorAt?.getTime()).toBe(new Date(2026, 10, 10, 9, 30).getTime());
    expect(c.dwellMinutes).toBe(480); // 09:30 → 17:30
    expect(c.freeUntil?.getTime()).toBe(new Date(2026, 10, 10, 12, 30).getTime());
    expect(c.detentionMinutes).toBe(300);
  });

  it("BEFORE a window opens, the window's start anchors it", () => {
    // Window 08:00–12:00, in at 07:00. Early again, so the clock waits for 08:00.
    const c = stopClock(at(7), null, "08:00:00", "12:00:00", DAY, FREE, NOW);
    expect(c.anchorAt?.getTime()).toBe(new Date(2026, 10, 10, 8, 0).getTime());
    expect(c.dwellMinutes).toBe(570); // 08:00 → 17:30, not 630
  });

  it("the window's END never anchors the clock — only lateness", () => {
    // Load 1045087's shipper, the case that proved it: a 07:00–23:45 "window",
    // held 11:10 → 20:15. Anchored on the window's end, free time ran to 02:45
    // the next morning and the stop scored ZERO. It is 6h05m.
    const c = stopClock(moment(11, 10), moment(20, 15), "07:00:00", "23:45:00", DAY, FREE, NOW);
    expect(c.noClaim).toBe(null);
    expect(c.dwellMinutes).toBe(545); // 11:10 → 20:15
    expect(c.detentionMinutes).toBe(365); // 6h05m past 14:10
  });
});

describe("stopClock — when nothing can be claimed", () => {
  it("a LATE arrival at a hard appointment claims nothing, however long it sits", () => {
    // Load 2194005's receiver: 08:00 appointment, in at 09:44.
    const c = stopClock(at(9, 44), null, "08:00:00", null, DAY, FREE, NOW);
    expect(c.noClaim).toBe("late");
    expect(c.detentionMinutes).toBe(0);
    // Dwell still runs: the facility did hold the truck from when it got there.
    expect(c.dwellMinutes).toBe(466); // 09:44 → 17:30
  });

  it("MISSING a window is being late, the same as blowing a hard appointment", () => {
    const c = stopClock(at(12, 30), null, "08:00:00", "12:00:00", DAY, FREE, NOW);
    expect(c.noClaim).toBe("late");
    expect(c.detentionMinutes).toBe(0);
  });

  it("arriving on the window's last minute is NOT late", () => {
    const c = stopClock(at(12), null, "08:00:00", "12:00:00", DAY, FREE, NOW);
    expect(c.noClaim).toBe(null);
    expect(c.freeUntil?.getTime()).toBe(new Date(2026, 10, 10, 15, 0).getTime());
    expect(c.detentionMinutes).toBe(150);
  });

  it("NO appointment claims nothing, but dwell still counts from arrival", () => {
    const c = stopClock(at(12), null, null, null, DAY, FREE, NOW);
    expect(c.noClaim).toBe("no-appointment");
    expect(c.freeUntil).toBe(null);
    expect(c.detentionMinutes).toBe(0);
    expect(c.dwellMinutes).toBe(330); // the dock still had it for 5h30m
  });

  it("an appointment with no DATE to hang it on refuses rather than guessing", () => {
    const c = stopClock(at(12), null, "14:00:00", null, null, FREE, NOW);
    expect(c.noClaim).toBe("no-appointment");
    expect(c.detentionMinutes).toBe(0);
  });
});

describe("stopClock — running, released, and not yet reached", () => {
  it("counts live while the truck is still there", () => {
    const c = stopClock(at(16), null, "16:00:00", null, DAY, FREE, NOW);
    expect(c).toMatchObject({ started: true, running: true, exact: true });
    expect(c.dwellMinutes).toBe(90);
  });

  it("freezes at the release, and does not keep counting", () => {
    const c = stopClock(at(14), moment(16), "14:00:00", null, DAY, FREE, NOW);
    expect(c.running).toBe(false);
    expect(c.dwellMinutes).toBe(120); // not 210 — `now` is 17:30
    expect(c.detentionMinutes).toBe(0); // released before 17:00
  });

  it("a released stop PAST the window keeps the detention it earned", () => {
    const c = stopClock(at(14), moment(18, 11), "14:00:00", null, DAY, FREE, NOW);
    expect(c.dwellMinutes).toBe(251);
    expect(c.detentionMinutes).toBe(71); // 18:11 − 17:00
  });

  it("dwell clamps at zero when the dock let the truck go EARLY", () => {
    // Load 6913105's receiver: 12:00 appointment, in 09:47, out 10:12. The
    // anchor is after the release, so the held time is zero — not −108.
    const c = stopClock(moment(9, 47), moment(10, 12), "12:00:00", null, DAY, FREE, NOW);
    expect(c.dwellMinutes).toBe(0);
    expect(c.detentionMinutes).toBe(0);
  });

  it("no arrival stamp means NO CLOCK — it never counts from a guessed day", () => {
    // Every load written before migration 106 is this: a time of day, no date.
    const c = stopClock(null, null, "14:00:00", null, DAY, FREE, NOW);
    expect(c).toMatchObject({
      started: false, exact: false, running: false,
      dwellMinutes: null, anchorAt: null, detentionMinutes: 0, noClaim: null,
    });
  });

  it("an unreadable stamp is treated as no stamp, not as the epoch", () => {
    expect(stopClock("not a date", null, "14:00:00", null, DAY, FREE, NOW).started).toBe(false);
  });
});

describe("stopClock — the overnight case the time-only columns could never do", () => {
  it("counts straight through midnight, because the stamps carry their dates", () => {
    // In 22:00 Monday against a 22:00 appointment, still sitting at 17:30
    // Tuesday. A bare time would read "22:00" against "17:30" and need a fudge.
    const c = stopClock(moment(22, 0, 9), null, "22:00:00", null, "2026-11-09", FREE, NOW);
    expect(c.dwellMinutes).toBe(19 * 60 + 30);
    expect(c.freeUntil?.getTime()).toBe(new Date(2026, 10, 10, 1, 0).getTime());
    expect(c.detentionMinutes).toBe(16 * 60 + 30);
  });

  it("an EARLY arrival the night before an appointment is early, not 17 hours late", () => {
    // Backed in 23:00 on the 9th for an 06:00 appointment on the 10th. This is
    // the case the `time` columns get wrong: minutes-of-day says 23:00 > 06:00,
    // so "late", and a real claim is forfeited. Dating the appointment by its
    // own scheduled day gets it right.
    const c = stopClock(moment(23, 0, 9), null, "06:00:00", null, DAY, FREE, NOW);
    expect(c.noClaim).toBe(null);
    expect(c.anchorAt?.getTime()).toBe(new Date(2026, 10, 10, 6, 0).getTime());
    expect(c.dwellMinutes).toBe(11 * 60 + 30); // 06:00 → 17:30
    expect(c.detentionMinutes).toBe(8 * 60 + 30); // past 09:00
  });
});

describe("hm / atClock — how a clock reads", () => {
  it("formats the way a dispatcher says it", () => {
    expect(hm(0)).toBe("0m");
    expect(hm(47)).toBe("47m");
    expect(hm(60)).toBe("1h 0m");
    expect(hm(108)).toBe("1h 48m");
    expect(hm(251)).toBe("4h 11m");
  });
  it("never shows a negative", () => {
    expect(hm(-5)).toBe("0m");
  });
  it("reads a stamp back as its local wall-clock time", () => {
    expect(atClock(at(14, 2))).toBe("14:02");
    expect(atClock(null)).toBe(null);
    expect(atClock("not a date")).toBe(null);
  });
});

describe("stopProgress — a stop counts whether it was tapped or typed", () => {
  // The bug Jason hit on day one of v1.272.0. He logged the shipper's in and
  // out times the old way, on the load detail page, so they are bare times
  // with no stamps. The card asked `clock.started` — true only for a stamp —
  // decided the shipper had never been reached, hid both its buttons, and
  // locked the receiver's Arrived behind it. The load could not be worked.
  const NO_STAMP = stopClock(null, null, "08:00:00", null, DAY, FREE, NOW);
  const STAMPED_RUNNING = stopClock(at(9), null, "08:00:00", null, DAY, FREE, NOW);
  const STAMPED_DONE = stopClock(at(9), moment(11), "08:00:00", null, DAY, FREE, NOW);

  it("a TYPED in-time means reached, even with no stamp", () => {
    expect(stopProgress(NO_STAMP, "09:00", null)).toEqual({ reached: true, released: false });
  });

  it("a TYPED out-time means released — this is what unlocked the receiver", () => {
    expect(stopProgress(NO_STAMP, "09:00", "11:00")).toEqual({ reached: true, released: true });
  });

  it("a STAMP still means reached and released, as before", () => {
    expect(stopProgress(STAMPED_RUNNING, null, null)).toEqual({ reached: true, released: false });
    expect(stopProgress(STAMPED_DONE, null, null)).toEqual({ reached: true, released: true });
  });

  it("neither source means the truck is not there yet", () => {
    expect(stopProgress(NO_STAMP, null, null)).toEqual({ reached: false, released: false });
  });

  it("the two sources can be mixed on one stop", () => {
    // Typed the arrival on the load page, then tapped Departed on the console.
    // Reached by the typed time, released by the stamp.
    const stampedOutOnly = stopClock(null, moment(11), "08:00:00", null, DAY, FREE, NOW);
    expect(stopProgress(stampedOutOnly, "09:00", null).reached).toBe(true);
    // And the reverse: tapped in, time typed out later.
    expect(stopProgress(STAMPED_RUNNING, null, "11:00")).toEqual({ reached: true, released: true });
  });
});
