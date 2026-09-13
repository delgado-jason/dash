import { describe, it, expect } from "vitest";
import { COOLING_THRESHOLD_DAYS, coolingRows, coolingSection, type CoolingAgentLike } from "./cooling";
import type { MeaningfulContactLike, MeaningfulLoadLike } from "./meaningfulContact";

const NOW = new Date("2026-09-12T15:00:00Z");

// created_at is a live record by default: the book shelves an agent nobody has
// heard from in 180 days as Parked (dormant), and Parked never cools.
const agent = (id: string, tier: number | null, o: Partial<CoolingAgentLike> = {}): CoolingAgentLike => ({
  agent_id: id,
  first_name: id,
  last_name: "X",
  relationship_tier: tier,
  work_status: "active",
  created_at: "2026-08-01T00:00:00Z",
  ...o,
});

const reached = (agent_id: string, day: string): MeaningfulContactLike => ({
  agent_id,
  contacted_at: `${day}T14:00:00Z`,
  direction: "outbound",
  method: "call",
  outcome: "reached",
});

const voicemail = (agent_id: string, day: string): MeaningfulContactLike => ({ ...reached(agent_id, day), outcome: "voicemail" });

const load = (agent_id: string, delivery: string): MeaningfulLoadLike => ({
  agent_id,
  load_status: "delivered",
  pickup_date: delivery,
  delivery_date: delivery,
});

describe("coolingRows — thresholds by CURRENT tier, from the last two-way contact", () => {
  it("Tier 1 21 · Tier 2 42 · Tier 3 90", () => {
    expect(COOLING_THRESHOLD_DAYS).toEqual({ 1: 21, 2: 42, 3: 90 });
  });

  it("prospects (no tier) and parked agents never cool", () => {
    const rows = coolingRows([agent("p", null), agent("k", 1, { work_status: "parked" })], [], [], NOW);
    expect(rows).toEqual([]);
  });

  it("a dormant agent never cools — a Tier 1 nothing two-way has touched in 200 days is gone, not cooling", () => {
    const dormant = agent("z", 1, { created_at: "2025-06-01T00:00:00Z" });
    const quiet = [reached("z", "2026-02-24")]; // 200 days before NOW
    expect(coolingRows([dormant], quiet, [], NOW)).toEqual([]);
    expect(coolingSection([dormant], quiet, [], NOW)).toEqual({ flagged: [], watch: [] });
    // …and a Tier 1 quiet for 100 days is still on the book, and still cools.
    const live = agent("y", 1, { created_at: "2025-06-01T00:00:00Z" });
    const [r] = coolingRows([live], [reached("y", "2026-06-04")], [], NOW);
    expect(r.flagged).toBe(true);
    expect(r.days).toBe(100);
  });

  it("a Tier 2 reached 4 days ago is under threshold and flags 42 days after that contact", () => {
    const [r] = coolingRows([agent("d", 2)], [reached("d", "2026-09-08")], [], NOW);
    expect(r.days).toBe(4);
    expect(r.threshold).toBe(42);
    expect(r.flagged).toBe(false);
    expect(r.flagsOn).toBe("2026-10-20");
  });

  it("a load counts as two-way contact; a voicemail does not", () => {
    const [byLoad] = coolingRows([agent("m", 2)], [voicemail("m", "2026-09-10")], [load("m", "2026-08-31")], NOW);
    expect(byLoad.last).toBe("2026-08-31");
    expect(byLoad.days).toBe(12);
    expect(byLoad.flagsOn).toBe("2026-10-12");
  });

  it("at the threshold the row is flagged; flagsOn goes null", () => {
    const [r] = coolingRows([agent("t", 1)], [reached("t", "2026-08-22")], [], NOW); // 21 days
    expect(r.days).toBe(21);
    expect(r.flagged).toBe(true);
    expect(r.flagsOn).toBeNull();
    const [under] = coolingRows([agent("t", 1)], [reached("t", "2026-08-23")], [], NOW); // 20 days
    expect(under.flagged).toBe(false);
  });

  it("a tiered agent with no two-way contact ever is flagged with null days", () => {
    const [r] = coolingRows([agent("n", 3)], [], [], NOW);
    expect(r).toMatchObject({ days: null, last: null, lastLoad: null, flagged: true, flagsOn: null, threshold: 90 });
  });

  it("lastLoad is carried beside the two-way day — the Review prints both", () => {
    const contacts = [reached("r", "2026-09-08")];
    const loads = [load("r", "2026-08-31"), { agent_id: "r", load_status: "cancelled", pickup_date: "2026-09-11", delivery_date: "2026-09-11" }];
    const [r] = coolingRows([agent("r", 2)], contacts, loads, NOW);
    expect(r.last).toBe("2026-09-08"); // the call came after the freight
    expect(r.lastLoad).toBe("2026-08-31"); // a cancelled booking is not a load
    const [never] = coolingRows([agent("x", 2)], contacts.map((c) => ({ ...c, agent_id: "x" })), [], NOW);
    expect(never.lastLoad).toBeNull();
  });

  it("a load that hasn't delivered yet counts by its PICKUP day", () => {
    // In transit: no delivery_date, so the pickup is the last load day — and a
    // booked load is still a two-way contact.
    const booked: MeaningfulLoadLike = { agent_id: "t", load_status: "in_transit", pickup_date: "2026-09-09", delivery_date: null };
    const [r] = coolingRows([agent("t", 1)], [], [booked], NOW);
    expect(r.lastLoad).toBe("2026-09-09");
    expect(r.days).toBe(3);
    // A delivery beats the pickup of the same load; a cancelled booking counts
    // for neither.
    const delivered = load("t", "2026-09-10");
    const [both] = coolingRows([agent("t", 1)], [], [booked, delivered], NOW);
    expect(both.lastLoad).toBe("2026-09-10");
    const [none] = coolingRows([agent("t", 1)], [], [{ ...booked, load_status: "cancelled" }], NOW);
    expect(none.lastLoad).toBeNull();
  });

  it("an empty book → no rows", () => {
    expect(coolingRows([], [], [], NOW)).toEqual([]);
  });
});

describe("coolingSection — flagged rows plus the ones flagging inside 14 days", () => {
  it("splits and sorts: flagged quietest first, watch soonest first; far-off rows stay out", () => {
    const agents = [agent("a", 2), agent("b", 1), agent("c", 2), agent("d", 3)];
    const contacts = [
      reached("a", "2026-08-05"), // 38d, T2 → flags Sep 16 (in 4 days) → watch
      reached("b", "2026-08-01"), // 42d, T1 → flagged
      reached("c", "2026-09-08"), // 4d, T2 → flags Oct 20 → too far
      reached("d", "2026-06-01"), // 103d, T3 → flagged, quietest
    ];
    const s = coolingSection(agents, contacts, [], NOW);
    expect(s.flagged.map((r) => r.agent.agent_id)).toEqual(["d", "b"]);
    expect(s.watch.map((r) => r.agent.agent_id)).toEqual(["a"]);
    expect(s.watch[0].flagsOn).toBe("2026-09-16");
  });

  it("the watch horizon is inclusive at 14 days", () => {
    const [edge] = coolingSection([agent("e", 2)], [reached("e", "2026-08-15")], [], NOW).watch; // 28d → flags Sep 26 = 14 days out
    expect(edge?.agent.agent_id).toBe("e");
    expect(coolingSection([agent("f", 2)], [reached("f", "2026-08-16")], [], NOW).watch).toEqual([]); // 27d → flags Sep 27 = 15 days out
  });
});
