import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  SYSTEM_START,
  bookedInWindow,
  lastTouchOf,
  prospectState,
  closeOutPending,
  inboundShare,
  inboundByTier,
  inboundTrend,
  coldFunnel,
  type ContactLike,
  type AgentLike,
} from "./relationships";

const NOW = new Date("2026-09-04T12:00:00Z"); // a Friday

// tier null = no owner-set tier (v2's Prospect / dormant-Parked).
const agent = (id: string, tier: number | null, o: Partial<AgentLike> = {}): AgentLike =>
  ({ agent_id: id, first_name: id, last_name: "X", relationship_tier: tier, ...o });

const touch = (o: Partial<ContactLike>): ContactLike =>
  ({
    agent_id: "a1",
    contacted_at: "2026-09-01T10:00:00Z",
    direction: "outbound",
    method: "email",
    type: "capacity", // a live v2 type — nothing here reads it except cold / close_out
    ...o,
  });

// created_at is the BOOKING day every inbound number is windowed on, so the
// factory carries one — the default books the load the morning it picks up.
const load = (o: Partial<Load>): Load =>
  ({
    load_id: "l1",
    agent_id: "a1",
    load_status: "delivered",
    created_at: "2026-08-20T12:00:00Z",
    pickup_date: "2026-08-20",
    delivery_date: "2026-08-22",
    ...o,
  }) as unknown as Load;

describe("prospectState — every stage derived, none stored", () => {
  it("no loads, no contacts → prospect; a cold touch → touched; an inbound → replied", () => {
    expect(prospectState("p1", [], []).stage).toBe("prospect");
    const cold = [touch({ agent_id: "p1", type: "cold" })];
    expect(prospectState("p1", cold, []).stage).toBe("touched");
    expect(prospectState("p1", cold, []).coldTouches).toBe(1);
    const replied = [...cold, touch({ agent_id: "p1", direction: "inbound", type: "inbound_inquiry" })];
    expect(prospectState("p1", replied, []).stage).toBe("replied");
  });

  it("a booked load converts — and days-to-convert runs first cold touch → first load", () => {
    const contacts = [
      touch({ agent_id: "p1", type: "cold", contacted_at: "2026-08-01T09:00:00Z" }),
      touch({ agent_id: "p1", type: "cold", contacted_at: "2026-08-15T09:00:00Z" }),
    ];
    const loads = [load({ agent_id: "p1", pickup_date: "2026-08-31" })];
    const st = prospectState("p1", contacts, loads);
    expect(st.stage).toBe("converted");
    expect(st.daysToConvert).toBe(30);
  });

  it("an agent with loads is NEVER a prospect, whatever the contact log says", () => {
    expect(prospectState("a1", [], [load({})]).stage).toBe("converted");
  });
});

describe("closeOutPending — the NOW rows", () => {
  it("closeOutPending = recent deliveries without a close-out contact linked", () => {
    const loads = [
      load({ load_id: "d1", delivery_date: "2026-09-03" }),
      load({ load_id: "d2", delivery_date: "2026-09-02" }),
      load({ load_id: "old", delivery_date: "2026-08-20" }),
    ];
    const contacts = [touch({ type: "close_out", load_id: "d2" })];
    expect(closeOutPending(loads, contacts, NOW).map((l) => l.load_id)).toEqual(["d1"]);
  });

  it("Today's 14-day window: 13 days ago is in, 14 is out, today is in", () => {
    const monday = new Date(2026, 8, 14, 10); // Mon Sep 14, local
    const loads = [
      load({ load_id: "in13", delivery_date: "2026-09-01" }),
      load({ load_id: "out14", delivery_date: "2026-08-31" }),
      load({ load_id: "today", delivery_date: "2026-09-14" }),
    ];
    expect(closeOutPending(loads, [], monday, 14).map((l) => l.load_id)).toEqual(["in13", "today"]);
  });

  it("the bounds are LOCAL calendar days — at 9pm Central UTC is already tomorrow, Brandie's day is not", () => {
    const late = new Date(2026, 8, 14, 21); // Mon Sep 14, 9pm local = Tue 02:00Z
    const loads = [
      load({ load_id: "in13", delivery_date: "2026-09-01" }), // UTC bounds would drop it (14 days)
      load({ load_id: "tomorrow", delivery_date: "2026-09-15" }), // UTC bounds would admit a delivery that hasn't happened
    ];
    expect(closeOutPending(loads, [], late, 14).map((l) => l.load_id)).toEqual(["in13"]);
  });

  it("empty inputs → nothing pending", () => {
    expect(closeOutPending([], [], NOW, 14)).toEqual([]);
  });
});

describe("inbound share — the one number, attributed on the BOOKING day", () => {
  // "t3" is UNTIERED (v2's Prospect) — its attributed loads fold into the Tier 3 bar.
  const agents = [agent("t1", 1), agent("t3", null)];
  const loads = [
    load({ load_id: "1", agent_id: "t1", created_at: "2026-09-01T15:00:00Z", pickup_date: "2026-09-05", booked_via: "agent_reached_out" }),
    load({ load_id: "2", agent_id: "t1", created_at: "2026-09-02T15:00:00Z", pickup_date: "2026-09-06", booked_via: "i_reached_out" }),
    load({ load_id: "3", agent_id: "t3", created_at: "2026-09-02T15:00:00Z", pickup_date: "2026-09-06", booked_via: "i_reached_out" }),
    load({ load_id: "4", agent_id: "t3", created_at: "2026-09-03T15:00:00Z", pickup_date: "2026-09-07" }), // legacy null — excluded
    load({ load_id: "5", agent_id: "t1", created_at: "2026-07-01T15:00:00Z", pickup_date: "2026-07-05", booked_via: "agent_reached_out" }), // booked before the window
  ];

  it("windows by BOOKING day and ignores unattributed loads", () => {
    const s = inboundShare(loads, "2026-09-01", "2026-09-30");
    expect(s.attributed).toBe(3);
    expect(s.inbound).toBe(1);
    expect(s.share).toBeCloseTo(1 / 3, 5);
  });

  // The bug this rule fixes: load 8336008, booked Sep 11 for a Sep 14 pickup,
  // was invisible to every inbound number until the truck picked up.
  it("booked yesterday for a pickup NEXT WEEK is attributed — and inbound when the agent reached out", () => {
    const booked = [
      load({ load_id: "ahead", created_at: "2026-09-12T14:00:00Z", pickup_date: "2026-09-19", booked_via: "agent_reached_out" }),
    ];
    expect(bookedInWindow(booked, SYSTEM_START, "2026-09-13").map((l) => l.load_id)).toEqual(["ahead"]);
    const s = inboundShare(booked, SYSTEM_START, "2026-09-13");
    expect(s).toEqual({ attributed: 1, inbound: 1, share: 1 });
  });

  it("a load created before SYSTEM_START carries no booked_via — out of the window AND out of the math", () => {
    const legacy = [load({ load_id: "legacy", created_at: "2026-08-20T12:00:00Z", pickup_date: "2026-09-06" })];
    expect(bookedInWindow(legacy, SYSTEM_START, "2026-09-13")).toEqual([]);
    expect(inboundShare(legacy, SYSTEM_START, "2026-09-13")).toEqual({ attributed: 0, inbound: 0, share: null });
  });

  it("created inside the window but CANCELLED — never counted, however it was booked", () => {
    const killed = [
      load({ load_id: "x", load_status: "cancelled", created_at: "2026-09-10T14:00:00Z", pickup_date: "2026-09-15", booked_via: "agent_reached_out" }),
    ];
    expect(bookedInWindow(killed, SYSTEM_START, "2026-09-13")).toEqual([]);
    expect(inboundShare(killed, SYSTEM_START, "2026-09-13").share).toBeNull();
  });

  // 23:30 Central on Sep 13 is 04:30Z on Sep 14: the key is the UTC day, the
  // same convention SYSTEM_START is written in, so it belongs to Sep 14.
  it("created 23:30 local on the window's last day keys to the NEXT UTC day (Sep 14) — out of a window ending Sep 13, in one ending Sep 14", () => {
    const late = [
      load({ load_id: "late", created_at: "2026-09-14T04:30:00Z", pickup_date: "2026-09-20", booked_via: "agent_reached_out" }),
    ];
    expect(bookedInWindow(late, SYSTEM_START, "2026-09-13")).toEqual([]);
    expect(bookedInWindow(late, SYSTEM_START, "2026-09-14").map((l) => l.load_id)).toEqual(["late"]);
  });

  it("null share when nothing attributed — never a false 0%", () => {
    expect(inboundShare([load({ load_id: "4", created_at: "2026-09-03T15:00:00Z" })], "2026-09-01", "2026-09-30").share).toBeNull();
  });

  it("no loads at all → zeros and a null share, never a 0% claim", () => {
    expect(inboundShare([], SYSTEM_START, "2026-09-13")).toEqual({ attributed: 0, inbound: 0, share: null });
    expect(bookedInWindow([], SYSTEM_START, "2026-09-13")).toEqual([]);
    expect(inboundTrend([])).toEqual([]);
    const byTier = inboundByTier([], [], SYSTEM_START, "2026-09-13");
    expect(byTier[1].share).toBeNull();
    expect(byTier[3]).toEqual({ attributed: 0, inbound: 0, share: null });
  });

  it("splits by tier — the thesis check; an untiered agent's attributed loads land in [3]", () => {
    const byTier = inboundByTier(agents, loads, "2026-09-01", "2026-09-30");
    expect(byTier[1].share).toBeCloseTo(0.5, 5);
    expect(byTier[3].attributed).toBe(1); // load 3 (load 4 is a legacy null)
    expect(byTier[3].share).toBeCloseTo(0, 5);
    expect(byTier[2].share).toBeNull();
  });

  it("trend groups by BOOKING month over attributed loads only", () => {
    const t = inboundTrend(loads);
    expect(t.map((r) => r.month)).toEqual(["2026-07", "2026-09"]);
    expect(t[1].share).toBeCloseTo(1 / 3, 5);
  });

  it("the trend's month is the month it was BOOKED, not the month it picks up", () => {
    const t = inboundTrend([
      load({ load_id: "sep", created_at: "2026-09-30T14:00:00Z", pickup_date: "2026-10-02", booked_via: "agent_reached_out" }),
      load({ load_id: "oct", created_at: "2026-10-01T14:00:00Z", pickup_date: "2026-10-03", booked_via: "i_reached_out" }),
    ]);
    expect(t.map((r) => r.month)).toEqual(["2026-09", "2026-10"]);
    expect(t[0]).toMatchObject({ month: "2026-09", attributed: 1, share: 1 });
    expect(t[1]).toMatchObject({ month: "2026-10", attributed: 1, share: 0 });
  });
});

describe("coldFunnel", () => {
  it("pool/touched/replied/converted with median days", () => {
    const agents = [agent("p1", null), agent("p2", null), agent("p3", null), agent("w", 1)];
    const contacts = [
      touch({ agent_id: "p1", type: "cold", contacted_at: "2026-08-01T09:00:00Z" }),
      touch({ agent_id: "p2", type: "cold", contacted_at: "2026-08-01T09:00:00Z" }),
      touch({ agent_id: "p2", direction: "inbound", type: "inbound_inquiry" }),
      touch({ agent_id: "p3", type: "cold", contacted_at: "2026-08-01T09:00:00Z" }),
    ];
    const loads = [
      load({ agent_id: "w", load_id: "wl" }), // working agent — not pool
      load({ agent_id: "p3", load_id: "pl", pickup_date: "2026-08-21" }), // converted in 20d
    ];
    const f = coldFunnel(agents, contacts, loads);
    expect(f.pool).toBe(2); // p1, p2 (p3 converted, w working)
    expect(f.touched).toBe(2);
    expect(f.replied).toBe(1);
    expect(f.converted).toBe(1);
    expect(f.medianDaysToConvert).toBe(20);
  });

  it("empty world → zeros and null median", () => {
    const f = coldFunnel([], [], []);
    expect(f).toEqual({ pool: 0, touched: 0, replied: 0, converted: 0, medianDaysToConvert: null });
  });
});

describe("lastTouchOf", () => {
  it("max over the log; null when never", () => {
    const c = [
      touch({ contacted_at: "2026-09-01T10:00:00Z" }),
      touch({ contacted_at: "2026-09-02T10:00:00Z" }),
    ];
    expect(lastTouchOf("a1", c)).toBe("2026-09-02T10:00:00Z");
    expect(lastTouchOf("nobody", c)).toBeNull();
  });
});
