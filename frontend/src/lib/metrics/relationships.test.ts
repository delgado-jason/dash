import { describe, it, expect } from "vitest";
import type { Load } from "@/types/load";
import {
  lastTouchOf,
  prospectState,
  dueQueue,
  tuesdayPick,
  fridayList,
  closeOutPending,
  inboundShare,
  inboundByTier,
  inboundTrend,
  coldFunnel,
  activeByTier,
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

describe("dueQueue — cadence per tier, follow-ups for prospects", () => {
  it("T1 overdue at 8 days, T2 fine at 8, cold follow-up at 15, replied at 8", () => {
    const agents = [agent("t1", 1), agent("t2", 2), agent("c", null), agent("r", null)];
    const contacts = [
      touch({ agent_id: "t1", contacted_at: "2026-08-27T10:00:00Z" }), // 8d
      touch({ agent_id: "t2", contacted_at: "2026-08-27T10:00:00Z" }), // 8d — under 14
      touch({ agent_id: "c", type: "cold", contacted_at: "2026-08-20T10:00:00Z" }), // 15d
      touch({ agent_id: "r", type: "cold", contacted_at: "2026-08-20T10:00:00Z" }),
      touch({ agent_id: "r", direction: "inbound", type: "inbound_inquiry", contacted_at: "2026-08-27T10:00:00Z" }), // replied 8d > 7
    ];
    // t1/t2 must NOT read as prospects — give them history.
    const loads = [load({ agent_id: "t1", load_id: "x1" }), load({ agent_id: "t2", load_id: "x2" })];
    const q = dueQueue(agents, contacts, loads, NOW);
    const ids = q.map((e) => e.agent.agent_id);
    expect(ids).toContain("t1");
    expect(ids).not.toContain("t2");
    expect(ids).toContain("c");
    expect(ids).toContain("r");
  });

  it("an untouched PROSPECT never nags — cold outreach is pulled, not pushed", () => {
    expect(dueQueue([agent("p", null)], [], [], NOW)).toHaveLength(0);
  });

  it("a never-touched WORKING agent surfaces immediately", () => {
    const q = dueQueue([agent("w", 1)], [], [load({ agent_id: "w" })], NOW);
    expect(q).toHaveLength(1);
    expect(q[0].daysSince).toBeNull();
  });

  it("an untiered agent with history rides no clock — the sweep, not the rotation", () => {
    const loads = [load({ agent_id: "u" })];
    const stale = [touch({ agent_id: "u", contacted_at: "2026-01-01T10:00:00Z" })]; // 8 months quiet
    expect(dueQueue([agent("u", null)], stale, loads, NOW)).toEqual([]);
    expect(dueQueue([agent("u", null)], [], loads, NOW)).toEqual([]); // never touched, still no nag
  });

  it("a parked agent is never owed a touch, whatever its tier", () => {
    const parked = agent("pk", 1, { work_status: "parked" });
    const q = dueQueue([parked, agent("t1", 1)], [], [load({ agent_id: "pk", load_id: "p1" }), load({ agent_id: "t1", load_id: "x1" })], NOW);
    expect(q.map((e) => e.agent.agent_id)).toEqual(["t1"]);
  });
});

describe("the weekly ritual pickers", () => {
  it("tuesdayPick takes the longest-untouched T2 (never-touched first)", () => {
    const agents = [agent("a", 2), agent("b", 2), agent("c", 1)];
    const contacts = [
      touch({ agent_id: "a", contacted_at: "2026-08-20T10:00:00Z" }),
      touch({ agent_id: "b", contacted_at: "2026-09-01T10:00:00Z" }),
    ];
    expect(tuesdayPick(agents, contacts, NOW)!.agent.agent_id).toBe("a");
    expect(tuesdayPick([...agents, agent("fresh", 2)], contacts, NOW)!.agent.agent_id).toBe("fresh");
    expect(tuesdayPick([agent("only1", 1)], [], NOW)).toBeNull();
  });

  it("tuesdayPick ignores the untiered and the parked — no tier, no Tuesday", () => {
    expect(tuesdayPick([agent("u", null)], [], NOW)).toBeNull();
    expect(tuesdayPick([agent("pk", 2, { work_status: "parked" })], [], NOW)).toBeNull();
    // a parked T2 never outranks a live one, even never-touched
    const live = agent("live", 2);
    expect(tuesdayPick([agent("pk", 2, { work_status: "parked" }), live], [touch({ agent_id: "live" })], NOW)!.agent).toBe(live);
  });

  it("fridayList = T1 agents with delivered loads in the trailing week, most loads first", () => {
    const agents = [agent("s", 1), agent("m", 1), agent("t2", 2)];
    const loads = [
      load({ agent_id: "s", load_id: "1", delivery_date: "2026-09-01" }),
      load({ agent_id: "s", load_id: "2", delivery_date: "2026-09-03" }),
      load({ agent_id: "m", load_id: "3", delivery_date: "2026-09-02" }),
      load({ agent_id: "t2", load_id: "4", delivery_date: "2026-09-02" }), // not T1
      load({ agent_id: "s", load_id: "5", delivery_date: "2026-08-20" }), // outside week
    ];
    const list = fridayList(agents, loads, NOW);
    expect(list.map((e) => [e.agent.agent_id, e.loads])).toEqual([["s", 2], ["m", 1]]);
  });

  it("fridayList skips the untiered and the parked even with a delivery this week", () => {
    const loads = [
      load({ agent_id: "u", load_id: "1", delivery_date: "2026-09-02" }),
      load({ agent_id: "pk", load_id: "2", delivery_date: "2026-09-02" }),
    ];
    expect(fridayList([agent("u", null)], loads, NOW)).toEqual([]);
    expect(fridayList([agent("pk", 1, { work_status: "parked" })], loads, NOW)).toEqual([]);
  });

  it("closeOutPending = recent deliveries without a close-out contact linked", () => {
    const loads = [
      load({ load_id: "d1", delivery_date: "2026-09-03" }),
      load({ load_id: "d2", delivery_date: "2026-09-02" }),
      load({ load_id: "old", delivery_date: "2026-08-20" }),
    ];
    const contacts = [touch({ type: "close_out", load_id: "d2" })];
    expect(closeOutPending(loads, contacts, NOW).map((l) => l.load_id)).toEqual(["d1"]);
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

describe("clock-skew clamp", () => {
  it("a touch stamped AFTER `now` reads 0 days, never −1", () => {
    const agents = [agent("t2", 2)];
    const contacts = [touch({ agent_id: "t2", contacted_at: "2026-09-04T13:00:00Z" })]; // 1h after NOW
    expect(tuesdayPick(agents, contacts, NOW)!.daysSince).toBe(0);
  });
});

describe("activeByTier — the working book by explicit tier", () => {
  it("shelves 1/2/3, leaves the parked and the untiered out", () => {
    const t1 = agent("t1", 1);
    const t2 = agent("t2", 2);
    const t3 = agent("t3", 3);
    const parkedT1 = agent("pk", 1, { work_status: "parked" });
    const untiered = agent("u", null);
    const by = activeByTier([parkedT1, t1, untiered, t3, t2]);
    expect(by[1]).toEqual([t1]);
    expect(by[2]).toEqual([t2]);
    expect(by[3]).toEqual([t3]);
  });

  it("an empty book → three empty shelves, never undefined", () => {
    expect(activeByTier([])).toEqual({ 1: [], 2: [], 3: [] });
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
