import { describe, it, expect } from "vitest";
import {
  isMeaningfulContact,
  lastMeaningfulContact,
  daysSinceMeaningful,
  type MeaningfulContactLike,
  type MeaningfulLoadLike,
} from "./meaningfulContact";

const NOW = new Date("2026-09-12T15:00:00Z");

const c = (o: Partial<MeaningfulContactLike>): MeaningfulContactLike => ({
  agent_id: "a1",
  contacted_at: "2026-09-01T10:00:00Z",
  direction: "outbound",
  method: "call",
  outcome: "reached",
  ...o,
});

const l = (o: Partial<MeaningfulLoadLike>): MeaningfulLoadLike => ({
  agent_id: "a1",
  load_status: "delivered",
  pickup_date: "2026-08-20",
  delivery_date: "2026-08-22",
  ...o,
});

describe("isMeaningfulContact — two-way only", () => {
  it("anything inbound counts, whatever the method", () => {
    expect(isMeaningfulContact({ direction: "inbound", method: "email" })).toBe(true);
    expect(isMeaningfulContact({ direction: "inbound", method: "text", outcome: null })).toBe(true);
  });

  it("an outbound call counts only when someone picked up", () => {
    expect(isMeaningfulContact({ direction: "outbound", method: "call", outcome: "reached" })).toBe(true);
    for (const outcome of ["voicemail", "no_answer", "bad_number", null, undefined]) {
      expect(isMeaningfulContact({ direction: "outbound", method: "call", outcome })).toBe(false);
    }
  });

  it("one-way emails and texts never count", () => {
    expect(isMeaningfulContact({ direction: "outbound", method: "email", outcome: "reached" })).toBe(false);
    expect(isMeaningfulContact({ direction: "outbound", method: "text" })).toBe(false);
  });
});

describe("lastMeaningfulContact — the latest two-way day", () => {
  it("takes the max across reached calls, inbounds, pickups and deliveries", () => {
    const contacts = [
      c({ contacted_at: "2026-09-01T10:00:00Z" }),
      c({ contacted_at: "2026-09-08T10:00:00Z", direction: "inbound", method: "email", outcome: null }),
    ];
    const loads = [l({})];
    expect(lastMeaningfulContact("a1", contacts, loads)).toBe("2026-09-08");
    expect(lastMeaningfulContact("a1", [], [l({ delivery_date: "2026-09-10" })])).toBe("2026-09-10");
  });

  it("ignores voicemails, one-way emails, cancelled loads and other agents", () => {
    const contacts = [
      c({ contacted_at: "2026-09-11T10:00:00Z", outcome: "voicemail" }),
      c({ contacted_at: "2026-09-11T10:00:00Z", method: "email" }),
      c({ contacted_at: "2026-09-11T10:00:00Z", agent_id: "a2" }),
    ];
    const loads = [l({ load_status: "cancelled", pickup_date: "2026-09-11" }), l({ agent_id: "a2", pickup_date: "2026-09-11" })];
    expect(lastMeaningfulContact("a1", contacts, loads)).toBeNull();
  });

  it("a booked load with a future pickup still counts (it IS contact)", () => {
    expect(lastMeaningfulContact("a1", [], [l({ load_status: "booked", pickup_date: "2026-09-14", delivery_date: null })])).toBe("2026-09-14");
  });

  it("a load DATE that arrives as a timestamp is sliced to its day", () => {
    expect(lastMeaningfulContact("a1", [], [l({ pickup_date: "2026-09-10T23:00:00.000Z", delivery_date: "2026-09-11T23:00:00.000Z" })])).toBe(
      "2026-09-11",
    );
    expect(daysSinceMeaningful("a1", [], [l({ pickup_date: "2026-09-08T23:00:00.000Z", delivery_date: null })], NOW)).toBe(4);
  });

  it("empty everything → null", () => {
    expect(lastMeaningfulContact("a1", [], [])).toBeNull();
  });
});

describe("daysSinceMeaningful — UTC days, clamped at zero", () => {
  it("counts calendar days from the sliced day key", () => {
    expect(daysSinceMeaningful("a1", [c({ contacted_at: "2026-09-08T23:59:00Z" })], [], NOW)).toBe(4);
  });

  it("a touch logged after `now` reads 0, never −1", () => {
    expect(daysSinceMeaningful("a1", [c({ contacted_at: "2026-09-13T01:00:00Z" })], [], NOW)).toBe(0);
    expect(daysSinceMeaningful("a1", [], [l({ load_status: "booked", pickup_date: "2026-09-20", delivery_date: null })], NOW)).toBe(0);
  });

  it("never contacted → null (the UI says 'never', not '—')", () => {
    expect(daysSinceMeaningful("a1", [], [], NOW)).toBeNull();
  });
});
