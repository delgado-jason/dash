import { describe, it, expect } from "vitest";
import { isDormant, bucketOf, partitionBook, type BookAgentLike, type BookCtx } from "./buckets";
import type { MeaningfulContactLike, MeaningfulLoadLike } from "./meaningfulContact";

const NOW = new Date("2026-09-12T15:00:00Z");

const agent = (id: string, o: Partial<BookAgentLike> = {}): BookAgentLike => ({
  agent_id: id,
  first_name: id,
  last_name: "X",
  relationship_tier: null,
  work_status: "active",
  created_at: "2025-01-01T00:00:00Z", // old by default — dormancy must be earned by activity
  ...o,
});

const load = (agent_id: string, o: Partial<MeaningfulLoadLike> = {}): MeaningfulLoadLike => ({
  agent_id,
  load_status: "delivered",
  pickup_date: "2026-08-20",
  delivery_date: "2026-08-22",
  ...o,
});

const reached = (agent_id: string, contacted_at: string): MeaningfulContactLike => ({
  agent_id,
  contacted_at,
  direction: "outbound",
  method: "call",
  outcome: "reached",
});

const ctx = (loads: MeaningfulLoadLike[] = [], contacts: MeaningfulContactLike[] = []): BookCtx => ({ loads, contacts, now: NOW });

describe("isDormant — 180 days without a load, a two-way contact, or a fresh record", () => {
  it("a recent load, a recent reached call, or a recent record each keep an agent live", () => {
    expect(isDormant(agent("a"), [load("a")], [], NOW)).toBe(false);
    expect(isDormant(agent("a"), [], [reached("a", "2026-09-01T10:00:00Z")], NOW)).toBe(false);
    expect(isDormant(agent("a", { created_at: "2026-09-10T00:00:00Z" }), [], [], NOW)).toBe(false);
  });

  it("everything older than 180 days → dormant; the boundary day is still live", () => {
    // 2026-09-12 − 180d = 2026-03-16
    expect(isDormant(agent("a"), [load("a", { pickup_date: "2026-03-16", delivery_date: "2026-03-16" })], [], NOW)).toBe(false);
    expect(isDormant(agent("a"), [load("a", { pickup_date: "2026-03-15", delivery_date: "2026-03-15" })], [], NOW)).toBe(true);
    expect(isDormant(agent("a"), [], [], NOW)).toBe(true);
  });

  it("the same 180-day edge holds for the record's created_at — sliced from its timestamp", () => {
    expect(isDormant(agent("a", { created_at: "2026-03-16T23:59:00Z" }), [], [], NOW)).toBe(false);
    expect(isDormant(agent("a", { created_at: "2026-03-15T23:59:00Z" }), [], [], NOW)).toBe(true);
  });

  it("…and for a reached call — the day it happened, not the hour", () => {
    expect(isDormant(agent("a"), [], [reached("a", "2026-03-16T00:30:00Z")], NOW)).toBe(false);
    expect(isDormant(agent("a"), [], [reached("a", "2026-03-15T23:30:00Z")], NOW)).toBe(true);
  });

  it("a voicemail does not wake a dormant agent; a cancelled recent booking does", () => {
    const vm: MeaningfulContactLike = { agent_id: "a", contacted_at: "2026-09-01T10:00:00Z", direction: "outbound", method: "call", outcome: "voicemail" };
    expect(isDormant(agent("a"), [], [vm], NOW)).toBe(true);
    expect(isDormant(agent("a"), [load("a", { load_status: "cancelled", pickup_date: "2026-09-01" })], [], NOW)).toBe(false);
  });
});

describe("bucketOf — explicit first, then derived", () => {
  it("parked beats a tier; a tier beats everything derived", () => {
    expect(bucketOf(agent("a", { work_status: "parked", relationship_tier: 1 }), ctx())).toBe("parked");
    expect(bucketOf(agent("a", { relationship_tier: 1 }), ctx())).toBe("tier1");
    expect(bucketOf(agent("a", { relationship_tier: 3 }), ctx())).toBe("tier3");
  });

  it("no tier: live → Prospect, dormant → Parked (derived)", () => {
    expect(bucketOf(agent("a"), ctx([load("a")]))).toBe("prospect");
    expect(bucketOf(agent("a"), ctx())).toBe("parked");
  });

  it("an explicit Tier 1 under three loads is STILL Tier 1 — the book shows the owner's call", () => {
    expect(bucketOf(agent("a", { relationship_tier: 1 }), ctx([load("a")]))).toBe("tier1");
  });

  it("with the loads slice missing, dormancy is withheld: untiered → Prospect; the owner's calls still stand", () => {
    const noLoads = { ...ctx(), loadsReady: false };
    expect(bucketOf(agent("a"), noLoads)).toBe("prospect"); // would be dormant-Parked with loads in hand
    expect(bucketOf(agent("a", { work_status: "parked" }), noLoads)).toBe("parked");
    expect(bucketOf(agent("a", { relationship_tier: 2 }), noLoads)).toBe("tier2");
  });
});

describe("partitionBook — the five shelves plus NEEDS A TIER", () => {
  const three = (id: string) => [
    load(id, { pickup_date: "2026-06-01", delivery_date: "2026-06-02" }),
    load(id, { pickup_date: "2026-07-01", delivery_date: "2026-07-02" }),
    load(id, { pickup_date: "2026-08-01", delivery_date: "2026-08-02" }),
  ];

  it("shelves by explicit tier, established-without-tier, prospect, parked", () => {
    const agents = [
      agent("t1", { relationship_tier: 1 }),
      agent("t2", { relationship_tier: 2 }),
      agent("t3", { relationship_tier: 3 }),
      agent("est"), // 3 delivered, no tier, live → needsTier
      agent("pro"), // 1 delivered, live → prospects
      agent("dor"), // nothing in 180d → parked (derived)
      agent("prk", { work_status: "parked", relationship_tier: 2 }),
    ];
    const loads = [...three("est"), load("pro"), load("dor", { pickup_date: "2026-01-10", delivery_date: "2026-01-11" })];
    const p = partitionBook(agents, ctx(loads));
    expect(p.tier1.map((a) => a.agent_id)).toEqual(["t1"]);
    expect(p.tier2.map((a) => a.agent_id)).toEqual(["t2"]);
    expect(p.tier3.map((a) => a.agent_id)).toEqual(["t3"]);
    expect(p.needsTier.map((a) => a.agent_id)).toEqual(["est"]);
    expect(p.prospects.map((a) => a.agent_id)).toEqual(["pro"]);
    expect(p.parked.map((a) => a.agent_id).sort()).toEqual(["dor", "prk"]);
  });

  it("an established but dormant untiered agent is Parked, not NEEDS A TIER", () => {
    const old = (id: string) => three(id).map((l) => ({ ...l, pickup_date: "2025-06-01", delivery_date: "2025-06-02" }));
    const p = partitionBook([agent("est")], ctx(old("est")));
    expect(p.needsTier).toEqual([]);
    expect(p.parked.map((a) => a.agent_id)).toEqual(["est"]);
  });

  it("with the loads slice missing, no one is shelved by a verdict loads would decide", () => {
    const agents = [agent("t1", { relationship_tier: 1 }), agent("dor"), agent("prk", { work_status: "parked" })];
    const p = partitionBook(agents, { ...ctx(), loadsReady: false });
    expect(p.tier1.map((a) => a.agent_id)).toEqual(["t1"]);
    expect(p.needsTier).toEqual([]);
    expect(p.prospects.map((a) => a.agent_id)).toEqual(["dor"]); // not dormant-Parked
    expect(p.parked.map((a) => a.agent_id)).toEqual(["prk"]); // the owner's call stands
  });

  it("default order: most loads, then longest since a two-way contact (never = quietest), then name", () => {
    const agents = [agent("b", { first_name: "Bea" }), agent("a", { first_name: "Al" }), agent("c", { first_name: "Cy" }), agent("d", { first_name: "Di" })];
    const loads = [
      load("a"), load("a", { pickup_date: "2026-08-25", delivery_date: "2026-08-26" }), // 2 loads, contact Aug 26
      load("b"), load("b", { pickup_date: "2026-08-25", delivery_date: "2026-08-26" }), // 2 loads …
      load("c"), // 1 load
      load("d"), // 1 load, same dates as c
    ];
    // b reached more recently than a → a is quieter → a first among the 2-load pair
    const contacts = [reached("b", "2026-09-10T10:00:00Z")];
    const p = partitionBook(agents, ctx(loads, contacts));
    expect(p.prospects.map((x) => x.agent_id)).toEqual(["a", "b", "c", "d"]);
  });

  it("quiet sort puts never-contacted first; name sort is alphabetical by last, first", () => {
    const agents = [agent("z", { first_name: "Zed", last_name: "Able" }), agent("m", { first_name: "Mo", last_name: "Baker" })];
    const loads = [load("z", { pickup_date: "2026-09-01", delivery_date: "2026-09-02" })];
    // 'm' has no load and no contact → would be dormant; give it a fresh record so it is a live prospect
    agents[1].created_at = "2026-09-11T00:00:00Z";
    expect(partitionBook(agents, ctx(loads), "quiet").prospects.map((a) => a.agent_id)).toEqual(["m", "z"]);
    expect(partitionBook(agents, ctx(loads), "name").prospects.map((a) => a.agent_id)).toEqual(["z", "m"]);
  });

  it("parked sorts by name by default and follows an explicit sort otherwise", () => {
    const agents = [
      agent("p2", { first_name: "Ross", last_name: "Zane", work_status: "parked", relationship_tier: null }),
      agent("p1", { first_name: "Jon", last_name: "Munson", work_status: "parked", relationship_tier: null }),
    ];
    const loads = [load("p2", { pickup_date: "2026-08-01", delivery_date: "2026-08-02" })];
    expect(partitionBook(agents, ctx(loads)).parked.map((a) => a.agent_id)).toEqual(["p1", "p2"]);
    expect(partitionBook(agents, ctx(loads), "loads").parked.map((a) => a.agent_id)).toEqual(["p2", "p1"]);
  });

  it("empty book → six empty shelves", () => {
    expect(partitionBook([], ctx())).toEqual({ tier1: [], tier2: [], tier3: [], needsTier: [], prospects: [], parked: [] });
  });
});
