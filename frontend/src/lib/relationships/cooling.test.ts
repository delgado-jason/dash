import { describe, it, expect } from "vitest";
import { COOLING_THRESHOLD_DAYS, coolingRows, coolingSection, type CoolingAgentLike } from "./cooling";
import type { MeaningfulContactLike, MeaningfulLoadLike } from "./meaningfulContact";

const NOW = new Date("2026-09-12T15:00:00Z");

const agent = (id: string, tier: number | null, o: Partial<CoolingAgentLike> = {}): CoolingAgentLike => ({
  agent_id: id,
  relationship_tier: tier,
  work_status: "active",
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
    expect(r).toMatchObject({ days: null, last: null, flagged: true, flagsOn: null, threshold: 90 });
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
