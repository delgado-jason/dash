import { describe, it, expect } from "vitest";
import {
  weekKey,
  inSameWeek,
  proactiveTouchesThisWeek,
  capStatus,
  foldTypes,
  alreadyCarries,
  mergeNote,
  foldPatch,
  type CapContactLike,
} from "./contactCap";

// Local-time dates on purpose — the SOP's week is Brandie's calendar.
const local = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);

const c = (o: Partial<CapContactLike> & { contacted_at: string }): CapContactLike => ({
  contact_id: o.contacted_at,
  agent_id: "a1",
  direction: "outbound",
  type: "capacity",
  ...o,
});

describe("weekKey — the local Monday", () => {
  it("every day Monday through Sunday keys to that Monday", () => {
    // 2026-09-14 is a Monday
    for (let d = 14; d <= 20; d++) expect(weekKey(local(2026, 9, d))).toBe("2026-09-14");
    expect(weekKey(local(2026, 9, 21))).toBe("2026-09-21");
    expect(weekKey(local(2026, 9, 13))).toBe("2026-09-07");
  });

  it("late Sunday night stays in its own week — no toISOString rollover", () => {
    expect(weekKey(local(2026, 9, 20, 23))).toBe("2026-09-14");
    expect(weekKey(local(2026, 9, 14, 0))).toBe("2026-09-14");
  });

  it("a week that straddles the year keys to last year's Monday", () => {
    // 2026-01-01 is a Thursday; its week began Monday 2025-12-29
    expect(weekKey(local(2026, 1, 1))).toBe("2025-12-29");
    expect(weekKey(local(2026, 1, 4, 23))).toBe("2025-12-29"); // that Sunday
    expect(weekKey(local(2026, 1, 5))).toBe("2026-01-05");
  });

  it("inSameWeek compares an ISO timestamp against now's week", () => {
    const now = local(2026, 9, 16);
    expect(inSameWeek(local(2026, 9, 14, 8).toISOString(), now)).toBe(true);
    expect(inSameWeek(local(2026, 9, 13, 23).toISOString(), now)).toBe(false);
  });
});

describe("proactiveTouchesThisWeek / capStatus", () => {
  const now = local(2026, 9, 16); // Wednesday

  it("nothing this week → not blocked", () => {
    expect(capStatus("a1", [], now)).toEqual({ count: 0, first: null, blocked: false });
    expect(capStatus("a1", [c({ contacted_at: local(2026, 9, 10).toISOString() })], now)).toEqual({ count: 0, first: null, blocked: false });
  });

  it("one proactive touch this week blocks, and is the message to fold into", () => {
    const mon = c({ contacted_at: local(2026, 9, 14, 9).toISOString(), type: "capacity" });
    const s = capStatus("a1", [mon], now);
    expect(s.blocked).toBe(true);
    expect(s.count).toBe(1);
    expect(s.first).toBe(mon);
  });

  it("the earliest of several is `first`; order comes back oldest first", () => {
    const tue = c({ contacted_at: local(2026, 9, 15, 9).toISOString(), type: "milestone" });
    const mon = c({ contacted_at: local(2026, 9, 14, 9).toISOString(), type: "capacity" });
    const week = proactiveTouchesThisWeek("a1", [tue, mon], now);
    expect(week).toEqual([mon, tue]);
    expect(capStatus("a1", [tue, mon], now).first).toBe(mon);
  });

  it("operational, inbound and owner-thread touches never count against the cap", () => {
    const contacts = [
      c({ contacted_at: local(2026, 9, 14).toISOString(), type: "close_out" }),
      c({ contacted_at: local(2026, 9, 14).toISOString(), type: "load_in_progress" }),
      c({ contacted_at: local(2026, 9, 15).toISOString(), type: "inbound_inquiry", direction: "inbound" }),
      c({ contacted_at: local(2026, 9, 15).toISOString(), type: "capacity", direction: "inbound" }),
      c({ contacted_at: local(2026, 9, 15).toISOString(), type: "owner_personal" }),
    ];
    expect(capStatus("a1", contacts, now).blocked).toBe(false);
  });

  it("another agent's touch is not this agent's cap", () => {
    expect(capStatus("a1", [c({ contacted_at: local(2026, 9, 14).toISOString(), agent_id: "a2" })], now).blocked).toBe(false);
  });

  it("a voicemail still counts — the agent heard from us this week", () => {
    const vm = { ...c({ contacted_at: local(2026, 9, 14).toISOString(), type: "reactivation" }), outcome: "voicemail" };
    expect(capStatus("a1", [vm], now).blocked).toBe(true);
  });
});

describe("the fold — foldTypes / alreadyCarries", () => {
  const monday = { type: "capacity", combined_types: ["milestone"] as string[] | null, note: null as string | null };

  it("adds the new reason to what the message already carried", () => {
    expect(foldTypes(monday, "holiday")).toEqual(["milestone", "holiday"]);
  });

  it("a reason already folded is not repeated", () => {
    expect(foldTypes(monday, "milestone")).toEqual(["milestone"]);
  });

  it("the message's own type never appears in its combined_types", () => {
    expect(foldTypes(monday, "capacity")).toEqual(["milestone"]);
    expect(foldTypes({ type: "capacity", combined_types: ["capacity", "holiday"] }, "milestone")).toEqual(["holiday", "milestone"]);
  });

  it("null combined_types → just the new reason", () => {
    expect(foldTypes({ type: "capacity", combined_types: null }, "holiday")).toEqual(["holiday"]);
    expect(foldTypes({ type: "capacity" }, "holiday")).toEqual(["holiday"]);
  });

  it("alreadyCarries reads the message's own type and its folds; null combined_types carries nothing extra", () => {
    expect(alreadyCarries(monday, "capacity")).toBe(true);
    expect(alreadyCarries(monday, "milestone")).toBe(true);
    expect(alreadyCarries(monday, "holiday")).toBe(false);
    expect(alreadyCarries({ type: "capacity", combined_types: null }, "milestone")).toBe(false);
  });
});

describe("the fold — mergeNote / foldPatch", () => {
  it("mergeNote appends with · and never clobbers a non-empty existing note", () => {
    expect(mergeNote("sent the capacity list", "asked for Thursday")).toBe("sent the capacity list · asked for Thursday");
    expect(mergeNote(null, "asked for Thursday")).toBe("asked for Thursday");
    expect(mergeNote("", " asked for Thursday ")).toBe("asked for Thursday");
    expect(mergeNote("sent the capacity list", "")).toBe("sent the capacity list");
    expect(mergeNote("sent the capacity list", null)).toBe("sent the capacity list");
    expect(mergeNote(null, null)).toBeNull();
    expect(mergeNote("  ", "  ")).toBeNull();
  });

  const into = { type: "capacity", combined_types: null, note: "sent the list" };
  const nothing = { note: null, next_step: "none", next_step_at: null, footprint_captured: false };

  it("the default follow-up folds the type and nothing else — no clobbering the first message", () => {
    expect(foldPatch(into, "milestone", nothing)).toEqual({ combined_types: ["milestone"] });
  });

  it("a note appends to the message's note", () => {
    expect(foldPatch(into, "milestone", { ...nothing, note: "they hit load 20" })).toEqual({
      combined_types: ["milestone"],
      note: "sent the list · they hit load 20",
    });
    expect(foldPatch({ ...into, note: null }, "milestone", { ...nothing, note: " they hit load 20 " }).note).toBe("they hit load 20");
  });

  it("a real next step rides along with its date; 'none' does not", () => {
    expect(foldPatch(into, "milestone", { ...nothing, next_step: "call_back", next_step_at: "2026-09-17" })).toEqual({
      combined_types: ["milestone"],
      next_step: "call_back",
      next_step_at: "2026-09-17",
    });
    expect(foldPatch(into, "milestone", { ...nothing, next_step: "on_their_list" })).toEqual({
      combined_types: ["milestone"],
      next_step: "on_their_list",
      next_step_at: null,
    });
    expect(foldPatch(into, "milestone", { ...nothing, next_step: null })).toEqual({ combined_types: ["milestone"] });
  });

  it("a captured footprint is carried; an uncaptured one is not written over the first message", () => {
    expect(foldPatch(into, "milestone", { ...nothing, footprint_captured: true })).toEqual({
      combined_types: ["milestone"],
      footprint_captured: true,
    });
    expect(foldPatch(into, "milestone", nothing)).not.toHaveProperty("footprint_captured");
  });
});
