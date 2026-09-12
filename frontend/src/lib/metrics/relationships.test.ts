import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
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

const load = (o: Partial<Load>): Load =>
  ({
    load_id: "l1",
    agent_id: "a1",
    load_status: "delivered",
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

describe("inbound share — the one number, legacy nulls outside the math", () => {
  // "t3" is UNTIERED (v2's Prospect) — its attributed loads fold into the Tier 3 bar.
  const agents = [agent("t1", 1), agent("t3", null)];
  const loads = [
    load({ load_id: "1", agent_id: "t1", pickup_date: "2026-09-01", booked_via: "agent_reached_out" }),
    load({ load_id: "2", agent_id: "t1", pickup_date: "2026-09-02", booked_via: "i_reached_out" }),
    load({ load_id: "3", agent_id: "t3", pickup_date: "2026-09-02", booked_via: "i_reached_out" }),
    load({ load_id: "4", agent_id: "t3", pickup_date: "2026-09-03" }), // legacy null — excluded
    load({ load_id: "5", agent_id: "t1", pickup_date: "2026-07-01", booked_via: "agent_reached_out" }), // outside window
  ];

  it("windows by pickup date and ignores unattributed loads", () => {
    const s = inboundShare(loads, "2026-09-01", "2026-09-30");
    expect(s.attributed).toBe(3);
    expect(s.inbound).toBe(1);
    expect(s.share).toBeCloseTo(1 / 3, 5);
  });

  it("null share when nothing attributed — never a false 0%", () => {
    expect(inboundShare([load({ load_id: "4", pickup_date: "2026-09-03" })], "2026-09-01", "2026-09-30").share).toBeNull();
  });

  it("splits by tier — the thesis check; an untiered agent's attributed loads land in [3]", () => {
    const byTier = inboundByTier(agents, loads, "2026-09-01", "2026-09-30");
    expect(byTier[1].share).toBeCloseTo(0.5, 5);
    expect(byTier[3].attributed).toBe(1); // load 3 (load 4 is a legacy null)
    expect(byTier[3].share).toBeCloseTo(0, 5);
    expect(byTier[2].share).toBeNull();
  });

  it("trend groups by month over attributed loads only", () => {
    const t = inboundTrend(loads);
    expect(t.map((r) => r.month)).toEqual(["2026-07", "2026-09"]);
    expect(t[1].share).toBeCloseTo(1 / 3, 5);
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
