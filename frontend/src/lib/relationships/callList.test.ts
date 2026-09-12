import { describe, it, expect } from "vitest";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { AgentContact } from "@/services/agentContactsService";
import { buildAgentScorecards } from "@/lib/metrics/agentScorecard";
import {
  callHistory,
  callListSummary,
  classLabel,
  convertedCount,
  footprintParts,
  footprintScore,
  gradeOf,
  holidayList,
  marketGrades,
  prospectsList,
  reactivationList,
} from "./callList";
import { localDayKey } from "./dayKeys";

const NOW = new Date("2026-09-12T15:00:00Z");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();
const dayKeyAgo = (n: number) => daysAgo(n).slice(0, 10);
// next_step_at is a LOCAL calendar day (picked from the chips) and is judged
// against Brandie's today — so the callback fixtures are built with the same
// clock callHistory reads, and the tests hold in any zone.
const localKeyAgo = (n: number) => localDayKey(new Date(NOW.getTime() - n * DAY));

let seq = 0;
const mkLoad = (o: Partial<Load>): Load => ({
  load_id: `L${seq++}`,
  load_number: "N",
  load_type: "standard flatbed",
  load_status: "delivered",
  broker_id: "b1",
  broker: "B",
  agent_id: "a1",
  agent: "Agent",
  agent_email: null,
  pickup_date: dayKeyAgo(60),
  delivery_date: dayKeyAgo(58),
  origin_market_id: "m1",
  origin_city: "Savannah",
  origin_state: "GA",
  origin_market: "Savannah",
  destination_market_id: "m2",
  destination_city: "Dallas",
  destination_state: "TX",
  delivery_market: "Dallas",
  deadhead_miles: 0,
  loaded_miles: 1000,
  linehaul: "5800",
  fuel_surcharge: "200",
  total_accessorials: "0", // gross 6000
  commodity: null,
  payment_status: "paid",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  ...o,
});

const mkAgent = (id: string, o: Partial<Agent> = {}): Agent => ({
  agent_id: id,
  broker_id: "b1",
  broker_name: "EWT",
  first_name: id,
  last_name: "Agent",
  preferred_contact: null,
  relationship_tier: null,
  work_status: "active",
  created_at: "2025-01-01T00:00:00Z", // old — liveness must come from activity
  updated_at: "2025-01-01T00:00:00Z",
  ...o,
});

const mkContact = (agent_id: string, o: Partial<AgentContact> = {}): AgentContact => ({
  contact_id: `c${seq++}`,
  agent_id,
  contacted_at: daysAgo(5),
  direction: "outbound",
  method: "call",
  type: "reactivation",
  note: null,
  load_id: null,
  outcome: "voicemail",
  next_step: "none",
  next_step_at: null,
  footprint_captured: false,
  combined_types: null,
  cap_override: false,
  ...o,
});

// A state with `n` delivered loads at `gross` each, picked up 30 days ago.
const stateLoads = (state: string, n: number, gross: number, agent = "x"): Load[] =>
  Array.from({ length: n }, () =>
    mkLoad({ agent_id: agent, origin_state: state, origin_city: state, linehaul: String(gross), fuel_surcharge: "0", pickup_date: dayKeyAgo(30) }),
  );

describe("marketGrades — avg gross per delivered load by origin state, thirds", () => {
  it("ranks states with two or more loads into thirds and generates the caption", () => {
    const loads = [
      ...stateLoads("GA", 2, 9000),
      ...stateLoads("SC", 2, 8000),
      ...stateLoads("TX", 2, 6000),
      ...stateLoads("OH", 2, 5000),
      ...stateLoads("AZ", 2, 4000),
      ...stateLoads("MI", 2, 3000),
      ...stateLoads("NV", 1, 20000), // one load — unranked, reads C however rich
    ];
    const g = marketGrades(loads, NOW);
    expect(g.ranked).toBe(6);
    expect(g.a).toEqual(["GA", "SC"]);
    expect(g.b).toEqual(["TX", "OH"]);
    expect(gradeOf(g, "AZ")).toBe("C");
    expect(gradeOf(g, "MI")).toBe("C");
    expect(gradeOf(g, "NV")).toBe("C");
    expect(gradeOf(g, "zz")).toBe("C");
    expect(g.caption).toBe("A = GA, SC · B = TX, OH · C = everyone else · by avg revenue per delivered load, 12 months, min 2 loads");
  });

  it("a single ranked state is A and the caption drops the empty B piece", () => {
    const g = marketGrades(stateLoads("ga", 2, 7000), NOW); // lowercase state normalizes
    expect(gradeOf(g, "GA")).toBe("A");
    expect(g.caption).toBe("A = GA · C = everyone else · by avg revenue per delivered load, 12 months, min 2 loads");
  });

  it("no ranked state → everyone is C and the caption says why", () => {
    const g = marketGrades([], NOW);
    expect(g.ranked).toBe(0);
    expect(gradeOf(g, "GA")).toBe("C");
    expect(g.caption).toMatch(/^no market grades yet/);
  });

  it("two ranked states read A and B — the thirds never leave the second of two unranked", () => {
    const g = marketGrades([...stateLoads("GA", 2, 9000), ...stateLoads("TX", 2, 6000)], NOW);
    expect(g.ranked).toBe(2);
    expect(g.a).toEqual(["GA"]);
    expect(g.b).toEqual(["TX"]);
    expect(gradeOf(g, "TX")).toBe("B");
    expect(g.caption).toBe("A = GA · B = TX · C = everyone else · by avg revenue per delivered load, 12 months, min 2 loads");
  });

  it("only DELIVERED loads picked up inside the trailing 12 months count", () => {
    const loads = [
      ...stateLoads("GA", 2, 7000),
      // a booked load and a cancelled one never grade a market
      mkLoad({ load_status: "booked", origin_state: "TX", pickup_date: dayKeyAgo(3) }),
      mkLoad({ load_status: "cancelled", origin_state: "TX", pickup_date: dayKeyAgo(3) }),
      mkLoad({ load_status: "booked", origin_state: "TX", pickup_date: dayKeyAgo(4) }),
      // 365 days back is inside the window; 366 is out
      mkLoad({ origin_state: "OH", pickup_date: dayKeyAgo(365) }),
      mkLoad({ origin_state: "OH", pickup_date: dayKeyAgo(366) }),
    ];
    const g = marketGrades(loads, NOW);
    expect(g.ranked).toBe(1);
    expect(gradeOf(g, "TX")).toBe("C");
    expect(gradeOf(g, "OH")).toBe("C"); // only one OH load made the window
  });
});

describe("footprintParts / footprintScore", () => {
  it("counts markets (stated or proven), freight, best time and the three note markers — 0 to 6", () => {
    const bare = footprintParts(mkAgent("a"), 0, 0, []);
    expect(footprintScore(bare)).toBe(0);
    const full = footprintParts(
      mkAgent("a", { freight_types: ["oversize"], best_time_to_call: "mornings" }),
      0,
      1,
      [mkContact("a", { note: "[lane] Savannah → Atlanta · [Regular] weekly coils · [season] spring" }), mkContact("b", { note: "[lane] not theirs" })],
    );
    expect(full).toEqual({ markets: true, freight: true, bestTime: true, lane: true, regular: true, season: true });
    expect(footprintScore(full)).toBe(6);
    expect(footprintParts(mkAgent("a", { best_time_to_call: "  " }), 1, 0, []).bestTime).toBe(false);
  });
});

describe("callHistory — what the dialing record says", () => {
  it("counts unreached calls inside 14 days, marks a sunk row, a bad number and an open callback", () => {
    const contacts = [
      mkContact("a", { contacted_at: daysAgo(20), outcome: "voicemail" }), // outside the window
      mkContact("a", { contacted_at: daysAgo(10), outcome: "no_answer" }),
      mkContact("a", { contacted_at: daysAgo(14), outcome: "voicemail" }), // the edge day counts
      mkContact("a", { contacted_at: daysAgo(2), outcome: "voicemail" }),
    ];
    const h = callHistory("a", contacts, NOW);
    expect(h.unreachedAttempts).toBe(3);
    expect(h.sank).toBe(true);
    expect(h.badNumber).toBe(false);
    expect(h.everCalled).toBe(true);
    expect(h.openCallback).toBe(false);

    const bad = callHistory("a", [mkContact("a", { contacted_at: daysAgo(30), outcome: "bad_number" })], NOW);
    expect(bad.badNumber).toBe(true);
    expect(bad.sank).toBe(false); // too old to sink, but the number still reads bad
    expect(bad.unreachedAttempts).toBe(0);
  });

  it("an email is not a call; a reached call is remembered; a callback promised for today or later is open", () => {
    const h = callHistory(
      "a",
      [
        mkContact("a", { contacted_at: daysAgo(9), method: "email", outcome: null }),
        mkContact("a", { contacted_at: daysAgo(8), outcome: "reached", next_step: "call_back", next_step_at: localKeyAgo(0) }), // today, Brandie's calendar
      ],
      NOW,
    );
    expect(h.everCalled).toBe(true);
    expect(h.lastReached).toBe(dayKeyAgo(8));
    expect(h.openCallback).toBe(true);
    // a later contact without a promise closes it
    const closed = callHistory(
      "a",
      [
        mkContact("a", { contacted_at: daysAgo(8), outcome: "reached", next_step: "call_back", next_step_at: localKeyAgo(-8) }),
        mkContact("a", { contacted_at: daysAgo(1), method: "email", outcome: null }),
      ],
      NOW,
    );
    expect(closed.openCallback).toBe(false);
    expect(callHistory("a", [mkContact("a", { next_step_at: localKeyAgo(1) })], NOW).openCallback).toBe(false); // yesterday — no longer open
    expect(callHistory("a", [], NOW)).toEqual({ unreachedAttempts: 0, sank: false, badNumber: false, everCalled: false, lastReached: null, openCallback: false });
  });
});

describe("reactivationList — lapsed prospects who hauled", () => {
  const grades = marketGrades([...stateLoads("GA", 2, 9000), ...stateLoads("TX", 2, 6000), ...stateLoads("OH", 2, 3000)], NOW);

  it("lists a prospect with a delivered load, quiet 60 days, never called — graded by their top market", () => {
    seq = 0;
    const agent = mkAgent("hy", { first_name: "Harrison", last_name: "Yonn" });
    const list = reactivationList([agent], [mkLoad({ agent_id: "hy" })], [], [], NOW, grades);
    expect(list.all).toHaveLength(1);
    const r = list.all[0];
    expect(r.grade).toBe("A");
    expect(r.topMarket).toEqual({ city: "Savannah", state: "GA" });
    expect(r.delivered).toBe(1);
    expect(r.avgGross).toBe(6000);
    expect(r.daysQuiet).toBe(58); // since the delivery, the later of the two dates
    expect(r.unreachedAttempts).toBe(0);
    expect(r.footprintScore).toBe(1); // the load proved a market
    expect(r.sank).toBe(false);
    expect(r.recycle).toBe(false);
    expect(r.why).toBe("1 load worth $6,000, 58 days since, never called — a warm re-open in a priority market");
    expect(list.groups.A).toEqual([r]);
  });

  it("leaves out tiered, parked, dormant, never-ran, recently active and callback-owed agents", () => {
    const agents = [
      mkAgent("tier", { relationship_tier: 2 }),
      mkAgent("park", { work_status: "parked" }),
      mkAgent("dorm"), // one load 200 days ago → dormant → Parked (derived)
      mkAgent("never", { created_at: daysAgo(10) }), // a live prospect with no loads — the Prospects list's
      mkAgent("fresh"), // load 20 days ago — in play
      mkAgent("reached"), // quiet load, but reached 5 days ago
      mkAgent("owed"), // quiet, but a callback promised for tomorrow
      mkAgent("ok"),
    ];
    const loads = [
      mkLoad({ agent_id: "tier" }),
      mkLoad({ agent_id: "park" }),
      mkLoad({ agent_id: "dorm", pickup_date: dayKeyAgo(200), delivery_date: dayKeyAgo(198) }),
      mkLoad({ agent_id: "fresh", pickup_date: dayKeyAgo(20), delivery_date: dayKeyAgo(18) }),
      mkLoad({ agent_id: "reached" }),
      mkLoad({ agent_id: "owed" }),
      mkLoad({ agent_id: "ok" }),
    ];
    const contacts = [
      mkContact("reached", { contacted_at: daysAgo(5), outcome: "reached" }),
      mkContact("owed", { contacted_at: daysAgo(30), outcome: "voicemail", next_step: "call_back", next_step_at: localKeyAgo(-1) }),
    ];
    const list = reactivationList(agents, loads, contacts, [], NOW, grades);
    expect(list.all.map((r) => r.agent.agent_id)).toEqual(["ok"]);
  });

  it("42 quiet days is still in play; 43 is lapsed — a booked load counts as contact now", () => {
    const at = (n: number) => [mkLoad({ agent_id: "a", pickup_date: dayKeyAgo(n + 2), delivery_date: dayKeyAgo(n) })];
    expect(reactivationList([mkAgent("a")], at(42), [], [], NOW, grades).all).toHaveLength(0);
    expect(reactivationList([mkAgent("a")], at(43), [], [], NOW, grades).all).toHaveLength(1);
    // quiet by loads, but a fresh booking (future pickup) means they're in play
    const booked = [...at(60), mkLoad({ agent_id: "a", load_status: "booked", pickup_date: dayKeyAgo(-3), delivery_date: null })];
    expect(reactivationList([mkAgent("a")], booked, [], [], NOW, grades).all).toHaveLength(0);
  });

  it("a voicemail does not reset the quiet clock; it sinks the row to the end of its grade and counts as unreached", () => {
    const agents = [mkAgent("vm", { first_name: "Aaron" }), mkAgent("quiet", { first_name: "Zed" })];
    const loads = [mkLoad({ agent_id: "vm" }), mkLoad({ agent_id: "quiet" })];
    const contacts = [mkContact("vm", { contacted_at: daysAgo(3), outcome: "voicemail" })];
    const list = reactivationList(agents, loads, contacts, [], NOW, grades);
    expect(list.groups.A.map((r) => r.agent.agent_id)).toEqual(["quiet", "vm"]);
    const vm = list.groups.A[1];
    expect(vm.sank).toBe(true);
    expect(vm.unreachedAttempts).toBe(1);
    expect(vm.daysQuiet).toBe(58);
    expect(vm.why).toContain("1 unreached call in two weeks");
  });

  it("three unreached calls in two weeks move the row to the recycle fold; a bad number is named", () => {
    const agents = [mkAgent("rec"), mkAgent("bad"), mkAgent("old")];
    const loads = agents.map((a) => mkLoad({ agent_id: a.agent_id }));
    const contacts = [
      mkContact("rec", { contacted_at: daysAgo(1), outcome: "voicemail" }),
      mkContact("rec", { contacted_at: daysAgo(4), outcome: "no_answer" }),
      mkContact("rec", { contacted_at: daysAgo(9), outcome: "voicemail" }),
      mkContact("bad", { contacted_at: daysAgo(20), outcome: "bad_number" }),
      // three unreached, but two of them outside the window → stays listed
      mkContact("old", { contacted_at: daysAgo(1), outcome: "voicemail" }),
      mkContact("old", { contacted_at: daysAgo(15), outcome: "voicemail" }),
      mkContact("old", { contacted_at: daysAgo(16), outcome: "voicemail" }),
    ];
    const list = reactivationList(agents, loads, contacts, [], NOW, grades);
    expect(list.recycle.map((r) => r.agent.agent_id)).toEqual(["rec"]);
    expect(list.recycle[0].recycle).toBe(true);
    expect(list.groups.A.map((r) => r.agent.agent_id).sort()).toEqual(["bad", "old"]);
    const bad = list.groups.A.find((r) => r.agent.agent_id === "bad")!;
    expect(bad.badNumber).toBe(true);
    expect(bad.why).toContain("the number on file bounced");
    // display order: the grade groups, then the fold
    expect(list.all[list.all.length - 1].agent.agent_id).toBe("rec");
    // THIS ROTATION is the graded groups only — the fold is listed in `all`, never counted
    expect(list.rotation.map((r) => r.agent.agent_id).sort()).toEqual(["bad", "old"]);
    expect(list.rotation.some((r) => r.recycle)).toBe(false);
    expect(list.all).toEqual([...list.rotation, ...list.recycle]);
  });

  it("a rank-blend tie — equal loads and the same last load day — falls to name order", () => {
    const agents = [mkAgent("z", { first_name: "Zed" }), mkAgent("a", { first_name: "Aaron" }), mkAgent("m", { first_name: "Mia" })];
    const loads = agents.map((x) => mkLoad({ agent_id: x.agent_id })); // one load each, the same dates
    const list = reactivationList(agents, loads, [], [], NOW, grades);
    expect(list.groups.A.map((r) => r.agent.agent_id)).toEqual(["a", "m", "z"]);
  });

  it("orders A → B → C, and within a grade by 0.6·volume + 0.4·recency (position ranks)", () => {
    const agents = [mkAgent("c1"), mkAgent("b1"), mkAgent("a-recent"), mkAgent("a-volume")];
    const loads = [
      mkLoad({ agent_id: "c1", origin_state: "OH" }),
      mkLoad({ agent_id: "b1", origin_state: "TX" }),
      // one recent load vs three older ones — volume carries 0.6
      mkLoad({ agent_id: "a-recent", pickup_date: dayKeyAgo(50), delivery_date: dayKeyAgo(48) }),
      mkLoad({ agent_id: "a-volume", pickup_date: dayKeyAgo(120), delivery_date: dayKeyAgo(118) }),
      mkLoad({ agent_id: "a-volume", pickup_date: dayKeyAgo(150), delivery_date: dayKeyAgo(148) }),
      mkLoad({ agent_id: "a-volume", pickup_date: dayKeyAgo(170), delivery_date: dayKeyAgo(168) }),
    ];
    const list = reactivationList(agents, loads, [], [], NOW, grades);
    expect(list.all.map((r) => r.agent.agent_id)).toEqual(["a-volume", "a-recent", "b1", "c1"]);
    expect(list.groups.A[0].delivered).toBe(3);
    expect(list.groups.B[0].grade).toBe("B");
    expect(list.groups.C[0].grade).toBe("C");
  });

  it("the top market is the most frequent delivered origin; a blank origin falls back to where they sit", () => {
    const loads = [
      mkLoad({ agent_id: "a", origin_city: "Atlanta", origin_state: "GA" }),
      mkLoad({ agent_id: "a", origin_city: "Tulsa", origin_state: "OK" }),
      mkLoad({ agent_id: "a", origin_city: "Tulsa", origin_state: "OK" }),
    ];
    const r = reactivationList([mkAgent("a")], loads, [], [], NOW, grades).all[0];
    expect(r.topMarket).toEqual({ city: "Tulsa", state: "OK" });
    expect(r.grade).toBe("C"); // OK is unranked
    const blank = reactivationList(
      [mkAgent("b", { agent_city: "Lima", agent_state: "OH" })],
      [mkLoad({ agent_id: "b", origin_city: "", origin_state: "" })],
      [],
      [],
      NOW,
      grades,
    ).all[0];
    expect(blank.topMarket).toEqual({ city: "Lima", state: "OH" });
    expect(blank.grade).toBe("C");
  });

  it("stated coverage and note markers feed the footprint score", () => {
    const agent = mkAgent("a", { freight_types: ["oversize", "hazmat"], best_time_to_call: "after 2" });
    const contacts = [mkContact("a", { contacted_at: daysAgo(80), outcome: "reached", note: "[lane] Savannah → Atlanta" })];
    const r = reactivationList([agent], [mkLoad({ agent_id: "a" })], contacts, [{ agent_id: "a" }], NOW, grades).all[0];
    expect(r.footprint).toEqual({ markets: true, freight: true, bestTime: true, lane: true, regular: false, season: false });
    expect(r.footprintScore).toBe(4);
    expect(r.why).toContain(`last reached ${new Date(daysAgo(80)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`);
  });

  it("an empty book → empty groups", () => {
    expect(reactivationList([], [], [], [], NOW, grades)).toEqual({ groups: { A: [], B: [], C: [] }, recycle: [], rotation: [], all: [] });
  });
});

describe("prospectsList — prospects who never ran", () => {
  it("derives the stage, sorts replied → touched (longest wait first) → new (freshest first), and counts the head", () => {
    const agents = [
      mkAgent("new-old", { created_at: daysAgo(30) }),
      mkAgent("new-fresh", { created_at: daysAgo(2), agent_city: "Boise", agent_state: "ID", source: "load_board" }),
      // one-way touches don't keep a prospect live (decision 7) — these are live by their fresh records
      mkAgent("touched-recent", { created_at: daysAgo(40) }),
      mkAgent("touched-waiting", { created_at: daysAgo(40) }),
      mkAgent("replied"), // live by the inbound reply itself
      mkAgent("hauled"), // one delivered load 10 days ago — converted, not a prospect
      mkAgent("dormant"), // nothing, old record → Parked (derived)
      mkAgent("parked", { work_status: "parked", created_at: daysAgo(1) }),
    ];
    const contacts = [
      mkContact("touched-recent", { contacted_at: daysAgo(2), method: "email", type: "cold", outcome: null }),
      mkContact("touched-waiting", { contacted_at: daysAgo(20), type: "cold", outcome: "voicemail" }),
      mkContact("touched-waiting", { contacted_at: daysAgo(12), type: "cold", outcome: "voicemail" }),
      mkContact("replied", { contacted_at: daysAgo(15), type: "cold", outcome: "voicemail" }),
      mkContact("replied", { contacted_at: daysAgo(6), direction: "inbound", method: "email", type: "inbound_inquiry", outcome: null }),
    ];
    const loads = [mkLoad({ agent_id: "hauled", pickup_date: dayKeyAgo(12), delivery_date: dayKeyAgo(10) })];
    const list = prospectsList(agents, loads, contacts, NOW);
    expect(list.rows.map((r) => r.agent.agent_id)).toEqual(["replied", "touched-waiting", "touched-recent", "new-fresh", "new-old"]);
    const by = Object.fromEntries(list.rows.map((r) => [r.agent.agent_id, r]));
    expect(by.replied.stageLabel).toBe("Replied");
    expect(by["touched-waiting"].stageLabel).toBe("Touched ×2");
    expect(by["touched-waiting"].daysQuiet).toBe(12);
    expect(by["new-fresh"].stageLabel).toBe("New");
    expect(by["new-fresh"].daysQuiet).toBeNull();
    expect(by["new-fresh"].place).toBe("Boise, ID");
    expect(by["new-fresh"].sourceLabel).toBe("load board");
    expect(by["new-fresh"].why).toMatch(/^New · via load board · added .+ — a first call/);
    expect(list.counts).toEqual({ prospects: 5, touched: 3, replied: 1, converted: 1 });
    expect(list.head).toBe("5 prospects · 3 touched · 1 replied · 1 converted");
  });

  it("converted counts FIRST delivered loads inside 90 days, whatever the agent's bucket now", () => {
    const loads = [
      // first load 200 days ago, another last month → not a conversion
      mkLoad({ agent_id: "old", pickup_date: dayKeyAgo(202), delivery_date: dayKeyAgo(200) }),
      mkLoad({ agent_id: "old", pickup_date: dayKeyAgo(32), delivery_date: dayKeyAgo(30) }),
      mkLoad({ agent_id: "new", pickup_date: dayKeyAgo(92), delivery_date: dayKeyAgo(90) }), // the edge day
      mkLoad({ agent_id: "booked", load_status: "booked", pickup_date: dayKeyAgo(-2), delivery_date: null }),
    ];
    expect(convertedCount(loads, NOW)).toBe(1);
    expect(convertedCount([], NOW)).toBe(0);
  });

  it("an empty book → no rows, a zero head", () => {
    const list = prospectsList([], [], [], NOW);
    expect(list.rows).toEqual([]);
    expect(list.head).toBe("0 prospects · 0 touched · 0 replied · 0 converted");
  });

  it("the head's 'touched' count INCLUDES replied rows — a reply is a touch that landed, not a separate pile", () => {
    const agents = [
      mkAgent("replied-only"), // live by the inbound itself; no outbound ever
      mkAgent("touched", { created_at: daysAgo(40) }),
      mkAgent("new", { created_at: daysAgo(3) }),
    ];
    const contacts = [
      mkContact("replied-only", { contacted_at: daysAgo(4), direction: "inbound", method: "email", type: "inbound_inquiry", outcome: null }),
      mkContact("touched", { contacted_at: daysAgo(6), type: "cold", outcome: "voicemail" }),
    ];
    const list = prospectsList(agents, [], contacts, NOW);
    expect(list.rows.map((r) => r.stage)).toEqual(["replied", "touched", "new"]);
    expect(list.counts).toEqual({ prospects: 3, touched: 2, replied: 1, converted: 0 });
    expect(list.head).toBe("3 prospects · 2 touched · 1 replied · 0 converted");
  });

  it("with the loads slice not ready no dormancy verdict is made — an old record is listed, never shelved Parked on missing evidence", () => {
    const stale = mkAgent("stale"); // an old record, no loads, no contacts → dormant when the loads are trusted
    expect(prospectsList([stale], [], [], NOW).rows).toHaveLength(0);
    expect(prospectsList([stale], [], [], NOW, [], marketGrades([], NOW), false).rows.map((r) => r.agent.agent_id)).toEqual(["stale"]);
    // nothing hauled → not lapsed either way
    expect(reactivationList([stale], [], [], [], NOW, marketGrades([], NOW), false).all).toEqual([]);
  });
});

describe("holidayList — the active book inside a holiday window", () => {
  // Local dates on purpose: the holiday window is Brandie's calendar, and the
  // cap's week is too. vite.config pins TZ so these hold anywhere.
  const local = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);
  const NOV20 = local(2026, 11, 20); // a Friday inside the Thanksgiving window (Nov 16 → 26)
  const ctxAt = (now: Date, contacts: AgentContact[] = [], loads: Load[] = []) => ({ loads, contacts, now, loadsReady: true });

  // Tier 1 → 2 → 3 → prospects, then name — the first names say the order.
  const t1 = mkAgent("t1", { relationship_tier: 1, first_name: "Zoe" });
  const t2a = mkAgent("t2a", { relationship_tier: 2, first_name: "Bob" });
  const t2b = mkAgent("t2b", { relationship_tier: 2, first_name: "Ann" });
  const t3 = mkAgent("t3", { relationship_tier: 3, first_name: "Cal" });
  const pro = mkAgent("pro", { first_name: "Ada", created_at: "2026-10-01T00:00:00Z" }); // a live prospect
  const parked = mkAgent("parked", { relationship_tier: 1, work_status: "parked", first_name: "Pat" });
  const dormant = mkAgent("dormant", { first_name: "Dot" }); // 2025 record, no loads, no contacts → dormant-Parked
  const book = [t2a, t1, pro, t3, t2b, parked, dormant];

  const ids = (agents: Agent[], contacts: AgentContact[] = [], notes: { agent_id: string; note: string }[] = [], now = NOV20) =>
    holidayList(agents, contacts, notes, now, ctxAt(now, contacts)).rows.map((r) => r.agent.agent_id);

  it("the window is the tab: nothing outside it, the holiday's own day inside it", () => {
    const at = (now: Date) => holidayList([], [], [], now, ctxAt(now));
    expect(at(local(2026, 11, 15)).window).toBeNull();
    expect(at(local(2026, 11, 16)).window).toMatchObject({ kind: "thanksgiving", year: 2026, day: "2026-11-26" });
    expect(at(local(2026, 11, 26, 23)).window?.kind).toBe("thanksgiving");
    expect(at(local(2026, 11, 27)).window).toBeNull();
    expect(at(local(2026, 12, 21)).window).toBeNull();
    expect(at(local(2026, 12, 22)).window).toMatchObject({ kind: "newyear", year: 2027, day: "2027-01-01" });
    expect(at(local(2027, 1, 2)).window?.year).toBe(2027);
    expect(at(local(2027, 1, 3)).window).toBeNull();
    expect(at(NOV20).label).toBe("Thanksgiving");
    expect(at(local(2026, 12, 22)).label).toBe("New Year");
  });

  it("outside the window the whole book is quiet — no window, no rows, no label", () => {
    const now = local(2026, 11, 15);
    expect(holidayList(book, [], [], now, ctxAt(now))).toEqual({ window: null, label: null, rows: [] });
  });

  it("an empty book inside the window → the window, no rows", () => {
    const list = holidayList([], [], [], NOV20, ctxAt(NOV20));
    expect(list.window?.kind).toBe("thanksgiving");
    expect(list.rows).toEqual([]);
  });

  it("tiers first, then prospects, each by name — and every row carries this year's marker", () => {
    const list = holidayList(book, [], [], NOV20, ctxAt(NOV20));
    expect(list.rows.map((r) => r.agent.agent_id)).toEqual(["t1", "t2b", "t2a", "t3", "pro"]);
    expect(list.rows.map((r) => r.bucket)).toEqual(["tier1", "tier2", "tier2", "tier3", "prospect"]);
    expect(new Set(list.rows.map((r) => r.marker))).toEqual(new Set(["[holiday:thanksgiving-2026]"]));
  });

  it("parked and dormant are on no list — explicit park or 180 quiet days, both out", () => {
    expect(ids(book)).not.toContain("parked");
    expect(ids(book)).not.toContain("dormant");
    expect(ids([parked, dormant])).toEqual([]);
  });

  it("a sent marker closes the flag for THAT holiday-year only", () => {
    const sent = mkContact("t1", { contacted_at: local(2026, 11, 18, 9).toISOString(), type: "holiday", note: "[holiday:thanksgiving-2026] emailed" });
    expect(ids([t1, t3], [sent])).toEqual(["t3"]);
    // last year's note says nothing about this year
    const lastYear = mkContact("t1", { contacted_at: "2025-11-20T15:00:00Z", type: "holiday", note: "[holiday:thanksgiving-2025] emailed" });
    expect(ids([t1, t3], [lastYear])).toEqual(["t1", "t3"]);
    // and this season's Thanksgiving marker leaves the New Year flag open
    expect(ids([t1], [sent], [], local(2026, 12, 28))).toEqual(["t1"]);
  });

  it("a skipped marker — an agent note, never a contact — closes it too", () => {
    expect(ids([t1, t3], [], [{ agent_id: "t3", note: "[holiday:thanksgiving-2026:skipped] not this year" }])).toEqual(["t1"]);
  });

  it("each row carries the week's cap, so the list can show Touched {Day} before the note is opened", () => {
    const touched = mkContact("t1", { contacted_at: local(2026, 11, 17, 9).toISOString(), type: "capacity", outcome: null });
    const stale = mkContact("t3", { contacted_at: local(2026, 11, 10, 9).toISOString(), type: "capacity", outcome: null }); // last week
    const rows = holidayList([t1, t3], [touched, stale], [], NOV20, ctxAt(NOV20, [touched, stale])).rows;
    expect(rows.map((r) => r.cap.blocked)).toEqual([true, false]);
    expect(rows[0].cap.first?.contact_id).toBe(touched.contact_id);
    expect(rows[1].cap.first).toBeNull();
  });
});

describe("classLabel — the one chip, never a default", () => {
  it("the pin wins; unclear is its own answer", () => {
    expect(classLabel(mkAgent("a", { agent_class: "direct" }), undefined)).toEqual({ label: "Direct", pinned: true, derived: false });
    expect(classLabel(mkAgent("a", { agent_class: "spot" }), undefined)).toEqual({ label: "Spot", pinned: true, derived: false });
    expect(classLabel(mkAgent("a", { agent_class: "unclear" }), undefined)).toEqual({ label: "Unclear", pinned: true, derived: false });
  });

  it("unpinned: repeat facilities read Direct (derived); no evidence reads Not yet asked — never spot by default", () => {
    const direct = mkAgent("d");
    const stranger = mkAgent("s");
    const loads = [
      mkLoad({ agent_id: "d", shipper_name: "Fujifilm" }),
      mkLoad({ agent_id: "d", shipper_name: "Fujifilm" }),
      mkLoad({ agent_id: "s", shipper_name: "OneOff" }),
    ];
    const cards = buildAgentScorecards([direct, stranger], loads, NOW);
    expect(classLabel(direct, cards.get("d"))).toEqual({ label: "Direct", pinned: false, derived: true });
    expect(classLabel(stranger, cards.get("s"))).toEqual({ label: "Not yet asked", pinned: false, derived: false });
    expect(classLabel(stranger, undefined).label).toBe("Not yet asked");
  });
});

describe("callListSummary — the statusbar's numbers", () => {
  it("counts lapsed and prospects and carries the grade caption", () => {
    const agents = [mkAgent("lapsed"), mkAgent("pro", { created_at: daysAgo(3) })];
    const loads = [mkLoad({ agent_id: "lapsed" }), ...stateLoads("GA", 2, 7000)];
    const s = callListSummary(agents, loads, [], [], NOW);
    expect(s.lapsed).toBe(1);
    expect(s.prospects).toBe(1);
    expect(s.caption).toMatch(/^A = GA/);
  });

  it("counts THIS rotation only — a recycled agent sits in the fold, not in the number", () => {
    const agents = [mkAgent("lapsed"), mkAgent("rec")];
    const loads = [mkLoad({ agent_id: "lapsed" }), mkLoad({ agent_id: "rec" }), ...stateLoads("GA", 2, 7000)];
    const contacts = [1, 4, 9].map((d) => mkContact("rec", { contacted_at: daysAgo(d), outcome: "voicemail" })); // three unreached in two weeks
    const s = callListSummary(agents, loads, contacts, [], NOW);
    expect(s.lapsed).toBe(1);
    // the fold still lists them — they are only out of the count
    expect(reactivationList(agents, loads, contacts, [], NOW, marketGrades(loads, NOW)).recycle.map((r) => r.agent.agent_id)).toEqual(["rec"]);
  });
});
