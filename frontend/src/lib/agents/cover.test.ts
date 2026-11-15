import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import type { AgentRatingHistory } from "@/types/agentRatingHistory";
import type { AgentContact } from "@/services/agentContactsService";
import { bookedBy, chronoLine, coverDates, daysSince, yourCall } from "./cover";

const load = (p: Partial<Load>): Load =>
  ({ load_id: "x", load_number: "x", load_status: "delivered", ...p }) as unknown as Load;

describe("coverDates", () => {
  it("first load is the earliest pickup, last worked the latest delivery, last spoken the latest touch", () => {
    const loads = [
      load({ pickup_date: "2026-05-05", delivery_date: "2026-05-06" }),
      load({ pickup_date: "2026-04-16", delivery_date: "2026-04-17" }),
      load({ pickup_date: "2026-09-14", delivery_date: "2026-09-17" }),
      load({ pickup_date: "2026-10-01", delivery_date: "2026-10-03", load_status: "booked" }),
      load({ pickup_date: "2026-01-01", delivery_date: "2026-01-02", load_status: "tonu" }),
    ];
    const touches = [
      { contacted_at: "2026-09-08T14:00:00Z" },
      { contacted_at: "2026-10-01T09:30:00Z" },
    ];
    expect(coverDates({ created_at: "2026-06-09T16:24:22.947Z" }, loads, touches)).toEqual({
      onFileSince: "2026-06-09",
      firstLoad: "2026-04-16",
      lastWorked: "2026-09-17",
      lastSpokenTo: "2026-10-01",
    });
  });

  it("an empty file has no dates but the one it was opened on", () => {
    expect(coverDates({ created_at: "2026-09-30T00:00:00Z" }, [], [])).toEqual({
      onFileSince: "2026-09-30",
      firstLoad: null,
      lastWorked: null,
      lastSpokenTo: null,
    });
  });
});

describe("daysSince", () => {
  it("counts whole days and never goes negative", () => {
    const now = new Date("2026-11-15T20:00:00Z");
    expect(daysSince("2026-10-01", now)).toBe(45);
    expect(daysSince("2026-11-15", now)).toBe(0);
    expect(daysSince("2026-11-20", now)).toBe(0);
    expect(daysSince(null, now)).toBeNull();
  });
});

describe("bookedBy", () => {
  it("counts by name, most first, and skips a TONU and a nameless load", () => {
    const loads = [
      { booked_by_name: "Jason", load_status: "delivered" },
      { booked_by_name: "Brandie", load_status: "delivered" },
      { booked_by_name: "Jason", load_status: "cancelled" },
      { booked_by_name: "Jason", load_status: "tonu" },
      { booked_by_name: null, load_status: "delivered" },
    ];
    expect(bookedBy(loads)).toEqual([
      { name: "Jason", n: 2 },
      { name: "Brandie", n: 1 },
    ]);
  });
});

describe("yourCall", () => {
  const h = (p: Partial<AgentRatingHistory>): AgentRatingHistory =>
    ({ id: "h", agent_id: "a", new_rating: 4, reason: "", changed_by: "JD", changed_at: "2026-09-02T10:00:00Z", ...p }) as AgentRatingHistory;

  it("reads the rating in the scale's own words with the newest reason", () => {
    const c = yourCall({ rating: 4, work_status: "active", park_reason: null }, [
      h({ id: "1", old_rating: 3, new_rating: 4, reason: "consistent, pays on time", changed_at: "2026-09-02T10:00:00Z" }),
      h({ id: "0", old_rating: null, new_rating: 3, reason: "default", changed_at: "2026-06-09T10:00:00Z" }),
    ]);
    expect(c).toMatchObject({ parked: false, word: "4 · Good", tone: "positive", rating: 4, reason: "consistent, pays on time", setOn: "2026-09-02", parkReason: null });
  });

  it("parked wins over the stars and carries the reason", () => {
    const c = yourCall({ rating: 2, work_status: "parked", park_reason: " Bad Number " }, []);
    expect(c).toMatchObject({ parked: true, word: "PARKED", tone: "negative", rating: 2, parkReason: "Bad Number", reason: null, setOn: null });
  });

  it("unrated is said, not invented", () => {
    expect(yourCall({ rating: null, work_status: "active", park_reason: null }, [])).toMatchObject({ word: "Unrated", tone: "faint", rating: null });
    expect(yourCall({ rating: 1, work_status: "active", park_reason: null }, []).tone).toBe("negative");
    expect(yourCall({ rating: 3, work_status: "active", park_reason: null }, []).word).toBe("3 · Default");
  });
});

describe("chronoLine", () => {
  const touch = (p: Partial<AgentContact>): AgentContact =>
    ({ contact_id: "c1", agent_id: "a", contacted_at: "2026-09-11T12:00:00Z", direction: "outbound", method: "email", type: "check_in", outcome: null, note: null, ...p }) as AgentContact;

  it("a note, a rating change, an outbound call with its outcome, an inbound email", () => {
    expect(chronoLine({ type: "note", timestamp: "2026-10-02T15:00:00Z", data: { id: "n1", agent_id: "a", note: "Mondays and Fridays", created_at: "2026-10-02T15:00:00Z", created_by: "BD" } }))
      .toEqual({ key: "note:n1", day: "2026-10-02", kind: "note · BD", text: "Mondays and Fridays", inbound: false, contactId: null });
    expect(chronoLine({ type: "rating", timestamp: "2026-09-02T10:00:00Z", data: { id: "r1", agent_id: "a", old_rating: 3, new_rating: 4, reason: "pays on time", changed_by: "JD", changed_at: "2026-09-02T10:00:00Z" } }))
      .toMatchObject({ key: "rating:r1", day: "2026-09-02", kind: "rating 3 → 4 · JD", text: "pays on time" });
    expect(chronoLine({ type: "touch", timestamp: "2026-10-01T09:00:00Z", data: touch({ contact_id: "c2", method: "call", outcome: "reached", contacted_at: "2026-10-01T09:00:00Z" }) }))
      .toMatchObject({ key: "touch:c2", day: "2026-10-01", kind: "call · reached", text: null, inbound: false, contactId: "c2" });
    expect(chronoLine({ type: "touch", timestamp: "2026-09-11T12:00:00Z", data: touch({ direction: "inbound", note: "offered a load" }) }))
      .toMatchObject({ kind: "they emailed", text: "offered a load", inbound: true });
  });

  it("names the touch type when it is not a plain check-in", () => {
    const line = chronoLine({ type: "touch", timestamp: "2026-09-11T12:00:00Z", data: touch({ type: "capacity" }) });
    expect(line.kind.startsWith("email · ")).toBe(true);
    expect(line.kind).not.toContain("check");
  });
});
