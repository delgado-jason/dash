import { describe, it, expect } from "vitest";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { AgentContact } from "@/services/agentContactsService";
import type { AgentCoverage } from "@/services/agentCoverageService";
import { cityKey, type CoordMap } from "@/lib/metrics/foreman";
import { buildToday, methodFor, openCallbacks, promisedWord, settlesCallback, type TodayInput } from "./todayQueue";

// Local clocks on purpose: the day plan and the cap week are Brandie's calendar.
const local = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h, 0, 0);
const iso = (y: number, m: number, d: number, h = 10) => local(y, m, d, h).toISOString();
const MON = local(2026, 9, 14); // Monday Sep 14
const TUE = local(2026, 9, 15);
const WED = local(2026, 9, 16);
const THU = local(2026, 9, 17);
const FRI = local(2026, 9, 18);
const SAT = local(2026, 9, 19);

const COORDS: CoordMap = new Map([
  [cityKey("Walker", "MI"), { lat: 43.0014, lng: -85.7681 }],
  [cityKey("Archbold", "OH"), { lat: 41.5217, lng: -84.3072 }], // ~126 mi
  [cityKey("Bruce Twp", "MI"), { lat: 42.7967, lng: -83.0166 }], // ~141 mi
  [cityKey("Benson", "AZ"), { lat: 31.9679, lng: -110.2945 }], // far
]);

const agent = (id: string, o: Partial<Agent> = {}): Agent =>
  ({
    agent_id: id,
    broker_id: null,
    broker_name: id.toUpperCase().slice(0, 3),
    first_name: id,
    last_name: "X",
    preferred_contact: null,
    relationship_tier: null,
    work_status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...o,
  }) as Agent;

let seq = 0;
const load = (o: Partial<Load>): Load =>
  ({
    load_id: `l${++seq}`,
    load_number: `LN${seq}`,
    load_status: "delivered",
    pickup_date: "2026-08-20",
    delivery_date: "2026-08-22",
    origin_city: "Archbold",
    origin_state: "OH",
    destination_city: "Walker",
    destination_state: "MI",
    linehaul: "3000",
    fuel_surcharge: "500",
    total_accessorials: "0",
    loaded_miles: 500,
    deadhead_miles: 100,
    created_at: "2026-08-19T12:00:00Z",
    ...o,
  }) as unknown as Load;

const contact = (o: Partial<AgentContact> & { agent_id: string; contacted_at: string }): AgentContact => ({
  contact_id: `c${++seq}`,
  direction: "outbound",
  method: "call",
  type: "reactivation",
  note: null,
  load_id: null,
  outcome: "reached",
  next_step: null,
  next_step_at: null,
  footprint_captured: false,
  combined_types: null,
  cap_override: false,
  ...o,
});

const build = (now: Date, o: Partial<TodayInput> = {}) =>
  buildToday({ agents: [], loads: [], contacts: [], coverage: [] as AgentCoverage[], notes: [], coords: COORDS, ladder: null, now, ...o });

describe("buildToday — an empty book", () => {
  it("has nothing to do, on any day, and never throws", () => {
    for (const day of [MON, TUE, WED, THU, FRI, SAT]) {
      const t = build(day);
      expect(t.closeOuts).toEqual([]);
      expect(t.plateRows).toEqual([]);
      expect(t.callbacks).toEqual([]);
      expect(t.listRows).toEqual([]);
      expect(t.listMore).toBe(0);
      expect(t.done).toEqual([]);
      expect(t.cooling).toEqual({ flagged: [], watch: [] });
    }
    expect(build(MON).count).toBe(0);
    expect(build(FRI).count).toBe(1); // the five is Friday's one job
    expect(build(SAT).plate).toMatchObject({ kind: "none", anchor: null, within: 0 });
  });
});

describe("NOW — close-outs in the last 14 days, operational, never ghosted", () => {
  const ian = agent("ian");
  it("a delivered load with no close-out linked is a row prefilled against its load; a linked one is not", () => {
    const l1 = load({ agent_id: "ian", delivery_date: "2026-09-11" });
    const l2 = load({ agent_id: "ian", delivery_date: "2026-09-10" });
    const old = load({ agent_id: "ian", delivery_date: "2026-08-25" }); // 20 days — outside
    const contacts = [contact({ agent_id: "ian", contacted_at: iso(2026, 9, 10), type: "close_out", method: "email", load_id: l2.load_id, outcome: null })];
    const t = build(MON, { agents: [ian], loads: [l1, l2, old], contacts });
    expect(t.closeOuts).toHaveLength(1);
    expect(t.closeOuts[0]).toMatchObject({
      section: "NOW",
      operational: true,
      touched: null,
      right: { value: "3d", caption: "since drop" },
      prefill: { direction: "outbound", method: "email", type: "close_out", load_id: l1.load_id },
    });
    expect(t.closeOuts[0].context).toContain("delivered Sep 11");
  });

  it("stays un-ghosted even when the agent already had a proactive touch this week", () => {
    const l1 = load({ agent_id: "ian", delivery_date: "2026-09-11" });
    const contacts = [contact({ agent_id: "ian", contacted_at: iso(2026, 9, 14, 8), type: "capacity", method: "email", outcome: null })];
    const t = build(MON, { agents: [ian], loads: [l1], contacts });
    expect(t.closeOuts[0].touched).toBeNull();
    expect(t.count).toBe(1);
  });

  it("a load whose agent is not in the book is skipped", () => {
    expect(build(MON, { loads: [load({ agent_id: "ghost", delivery_date: "2026-09-11" })] }).closeOuts).toEqual([]);
  });

  it("the window is 14 LOCAL days: 13 days ago is in, 14 is out — and 9pm Monday is still Monday", () => {
    const in13 = load({ agent_id: "ian", delivery_date: "2026-09-01" }); // 13 days before Mon Sep 14
    const out14 = load({ agent_id: "ian", delivery_date: "2026-08-31" }); // 14 — out
    const t = build(MON, { agents: [ian], loads: [in13, out14] });
    expect(t.closeOuts.map((r) => r.load?.load_id)).toEqual([in13.load_id]);
    expect(t.closeOuts[0].right).toEqual({ value: "13d", caption: "since drop" });
    // 9pm local is 02:00Z Tuesday — a UTC clock would read 14 days and drop the row
    const late = build(local(2026, 9, 14, 21), { agents: [ian], loads: [in13, out14] });
    expect(late.closeOuts.map((r) => r.load?.load_id)).toEqual([in13.load_id]);
    expect(late.closeOuts[0].right.value).toBe("13d");
  });
});

describe("Monday — the capacity plate and its rows", () => {
  const guy = agent("guy", { preferred_contact: "email" });
  const liam = agent("liam");
  const booked = load({ agent_id: "guy", load_status: "booked", pickup_date: "2026-09-16", delivery_date: "2026-09-18", delivery_appt_start: "14:00:00", destination_city: "Walker", destination_state: "MI" });
  const loads = [
    booked,
    load({ agent_id: "guy", origin_city: "Bruce Twp", origin_state: "MI", pickup_date: "2026-05-02", delivery_date: "2026-05-04" }),
    load({ agent_id: "liam", origin_city: "Archbold", origin_state: "OH", pickup_date: "2026-08-01", delivery_date: "2026-08-03" }),
  ];

  it("the plate carries the anchor, the hero is the nearest agent, rows are CAPACITY rows with miles", () => {
    const t = build(MON, { agents: [guy, liam], loads });
    expect(t.plan.plate).toBe("capacity");
    if (t.plate.kind !== "capacity") throw new Error("expected the capacity plate");
    expect(t.plate.anchor).toMatchObject({ city: "Walker", state: "MI", dayKey: "2026-09-18", time: "14:00:00" });
    expect(t.plate.hero?.agent.agent_id).toBe("liam");
    expect(t.plate.combined).toBe(0);
    expect(t.plateRows.map((r) => r.agent.agent_id)).toEqual(["liam", "guy"]);
    expect(t.plateRows[1]).toMatchObject({ section: "CAPACITY", right: { caption: "miles" }, prefill: { type: "capacity", method: "email" } });
    expect(Number(t.plateRows[1].right.value)).toBeGreaterThan(130);
    expect(Number(t.plateRows[1].right.value)).toBeLessThan(150);
    expect(t.plateRows[1].context).toMatch(/^Bruce Twp, MI · 1\d\d mi · Prospect · 1 load$/);
    // liam is also 42 days quiet — a lapsed prospect — but the plate's row carries him today
    expect(t.listRows).toEqual([]);
    expect(t.count).toBe(2);
  });

  it("a touched agent leaves the rows and the hero moves on; the count follows", () => {
    const contacts = [contact({ agent_id: "liam", contacted_at: iso(2026, 9, 14, 8), type: "capacity", method: "email", outcome: null })];
    const t = build(MON, { agents: [guy, liam], loads, contacts });
    if (t.plate.kind !== "capacity") throw new Error("expected the capacity plate");
    expect(t.plate.hero?.agent.agent_id).toBe("guy");
    expect(t.plate.list.touched.map((r) => r.agent.agent_id)).toEqual(["liam"]);
    expect(t.plateRows.map((r) => r.agent.agent_id)).toEqual(["guy"]);
    expect(t.count).toBe(1);
  });

  it("a hero with a milestone due gets the flag folded in and the plate counts it", () => {
    const five = Array.from({ length: 5 }, (_, i) => load({ agent_id: "liam", origin_city: "Archbold", origin_state: "OH", pickup_date: `2026-07-0${i + 1}`, delivery_date: `2026-07-0${i + 2}` }));
    const t = build(MON, { agents: [guy, liam], loads: [booked, ...five] });
    if (t.plate.kind !== "capacity") throw new Error("expected the capacity plate");
    expect(t.plate.heroFlag?.type).toBe("milestone");
    expect(t.plate.heroFlag?.flag.marker).toBe("[milestone:loads-5]");
    expect(t.plate.combined).toBe(1);
    expect(t.flags).toHaveLength(1);
  });

  it("no trusted coordinate for the anchor → an unresolved list, no rows, the plate says so", () => {
    const rapid = load({ agent_id: "guy", load_status: "booked", pickup_date: "2026-09-16", delivery_date: "2026-09-19", destination_city: "Rapid City", destination_state: "SD" });
    const t = build(MON, { agents: [guy], loads: [rapid, loads[1]] });
    if (t.plate.kind !== "capacity") throw new Error("expected the capacity plate");
    expect(t.plate.list.anchorResolved).toBe(false);
    expect(t.plate.hero).toBeNull();
    expect(t.plateRows).toEqual([]);
  });

  it("the weekend previews Monday's pass from the same anchor", () => {
    const t = build(SAT, { agents: [guy, liam], loads });
    expect(t.plate).toMatchObject({ kind: "none", anchorResolved: true, within: 2 });
    expect(t.plateRows).toEqual([]);
    expect(t.count).toBe(0);
  });

  it("one reason per agent per day: an agent owed a call back gets the CALL BACK row, not a capacity row", () => {
    // liam is the nearest agent AND promised a call for Monday — the promise wins the day
    const promise = contact({ agent_id: "liam", contacted_at: iso(2026, 9, 10), outcome: "voicemail", next_step: "call_back", next_step_at: "2026-09-14", note: "asked for Monday" });
    const t = build(MON, { agents: [guy, liam], loads, contacts: [promise] });
    if (t.plate.kind !== "capacity") throw new Error("expected the capacity plate");
    expect(t.plate.hero?.agent.agent_id).toBe("guy");
    expect(t.plateRows.map((r) => r.agent.agent_id)).toEqual(["guy"]);
    expect(t.plate.list.rows.map((r) => r.agent.agent_id)).toEqual(["liam", "guy"]); // the geography still counts him
    expect(t.callbacks.map((r) => r.agent.agent_id)).toEqual(["liam"]);
    expect(t.listRows).toEqual([]); // and not as a lapsed prospect either
    expect(t.count).toBe(2);
  });
});

describe("Wednesday — nurture flags as rows, the cap as a fold", () => {
  const mike = agent("mike", { relationship_tier: 2, preferred_contact: "phone" });
  const five = Array.from({ length: 5 }, (_, i) => load({ agent_id: "mike", pickup_date: `2026-08-0${i + 1}`, delivery_date: `2026-08-0${i + 2}` }));

  it("the plate's hero is the first open flag; the row is prefilled with the marker", () => {
    const t = build(WED, { agents: [mike], loads: five });
    if (t.plate.kind !== "nurture") throw new Error("expected the nurture plate");
    expect(t.plate.open).toBe(1);
    expect(t.plate.hero?.flag.marker).toBe("[milestone:loads-5]");
    expect(t.plate.heroTouched).toBeNull();
    expect(t.plate.heroWeekTouches).toBe(0);
    expect(t.plateRows[0]).toMatchObject({
      section: "NURTURE",
      right: { value: "5", caption: "loads" },
      prefill: { direction: "outbound", method: "call", type: "milestone", note: "[milestone:loads-5] " },
    });
    expect(t.plateRows[0].context).toBe("5 loads · crossed Aug 6 · not yet sent");
    expect(t.count).toBe(1);
  });

  it("a flagged agent already touched this week is ghosted (TOUCHED) and not counted; the hero notes the fold", () => {
    const contacts = [contact({ agent_id: "mike", contacted_at: iso(2026, 9, 14, 9), type: "capacity", method: "email", outcome: null })];
    const t = build(WED, { agents: [mike], loads: five, contacts });
    if (t.plate.kind !== "nurture") throw new Error("expected the nurture plate");
    expect(t.plateRows[0].touched?.day).toBe("Mon");
    expect(t.plate.heroTouched?.day).toBe("Mon");
    expect(t.plate.heroWeekTouches).toBe(1);
    expect(t.count).toBe(0);
  });

  it("a sent marker or a skipped note closes the flag; parked agents get no nurture", () => {
    const sent = [contact({ agent_id: "mike", contacted_at: iso(2026, 9, 9), type: "milestone", method: "email", outcome: null, note: "[milestone:loads-5] sent" })];
    expect(build(WED, { agents: [mike], loads: five, contacts: sent }).plateRows).toEqual([]);
    expect(build(WED, { agents: [mike], loads: five, notes: [{ agent_id: "mike", note: "[milestone:loads-5:skipped]" }] }).plateRows).toEqual([]);
    expect(build(WED, { agents: [agent("mike", { work_status: "parked" })], loads: five }).plateRows).toEqual([]);
  });

  it("inside a holiday window every active agent is a NURTURE row", () => {
    // Wed Nov 18, inside the Thanksgiving window; guy is a fresh prospect (a Jan record with nothing on it would be dormant by now)
    const t = build(local(2026, 11, 18), { agents: [mike, agent("guy", { created_at: "2026-11-01T00:00:00Z" })], loads: five });
    expect(t.plan.plate).toBe("nurture");
    const holidays = t.plateRows.filter((r) => r.flag?.type === "holiday");
    expect(holidays.map((r) => r.agent.agent_id)).toEqual(["mike", "guy"]);
    expect(holidays[0].prefill).toMatchObject({ type: "holiday", note: "[holiday:thanksgiving-2026] " });
  });

  it("one reason per agent per day: a flagged agent owed a call back gets the CALL BACK row; the flag stays open and waits", () => {
    const promise = contact({ agent_id: "mike", contacted_at: iso(2026, 9, 10), outcome: "voicemail", next_step: "call_back", next_step_at: "2026-09-16" });
    const t = build(WED, { agents: [mike], loads: five, contacts: [promise] });
    if (t.plate.kind !== "nurture") throw new Error("expected the nurture plate");
    expect(t.plateRows).toEqual([]);
    expect(t.plate.open).toBe(0);
    expect(t.plate.hero).toBeNull();
    expect(t.flags).toHaveLength(1); // still open — not sent, not skipped
    expect(t.callbacks.map((r) => r.agent.agent_id)).toEqual(["mike"]);
    expect(t.count).toBe(1);
  });
});

describe("CALL BACK — a promise whose day has come, with nothing after it that settles it", () => {
  it("openCallbacks / promisedWord", () => {
    const due = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 8), next_step: "call_back", next_step_at: "2026-09-14" });
    const later = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 12), outcome: "voicemail" }); // a later proactive touch — promise settled
    const future = contact({ agent_id: "ann", contacted_at: iso(2026, 9, 8), next_step: "call_back", next_step_at: "2026-09-21" });
    expect(openCallbacks([due, future], "2026-09-14").map((c) => c.agent_id)).toEqual(["gary"]);
    expect(openCallbacks([due, later, future], "2026-09-14")).toEqual([]);
    expect(openCallbacks([], "2026-09-14")).toEqual([]);
    expect(promisedWord("2026-09-14", "2026-09-14")).toBe("Today");
    expect(promisedWord("2026-09-10", "2026-09-14")).toBe("Thu");
    expect(promisedWord("2026-09-01", "2026-09-14")).toBe("Sep 1");
  });

  it("operational bookkeeping after the promise — a close-out, a freight bill, a load in progress — does NOT settle it", () => {
    const due = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 8), outcome: "voicemail", next_step: "call_back", next_step_at: "2026-09-14" });
    const closeOut = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 10), type: "close_out", method: "email", outcome: null });
    const bill = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 11), type: "freight_bill", method: "email", outcome: null });
    const inProgress = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 11, 14), type: "load_in_progress", method: "call", outcome: "voicemail" });
    expect(openCallbacks([due, closeOut, bill, inProgress], "2026-09-14").map((c) => c.contact_id)).toEqual([due.contact_id]);
    expect(settlesCallback(closeOut)).toBe(false);
    expect(settlesCallback(bill)).toBe(false);
    expect(settlesCallback(inProgress)).toBe(false);
  });

  it("they call, you reach them, or any proactive touch settles it; a later promise supersedes it", () => {
    const due = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 8), outcome: "voicemail", next_step: "call_back", next_step_at: "2026-09-14" });
    const inbound = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 12), direction: "inbound", type: "inbound_inquiry", outcome: null });
    const reachedOps = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 12), type: "load_in_progress", method: "call", outcome: "reached" });
    const voicemail = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 12), type: "reactivation", outcome: "voicemail" });
    const email = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 12), type: "capacity", method: "email", outcome: null });
    for (const settler of [inbound, reachedOps, voicemail, email]) {
      expect(settlesCallback(settler)).toBe(true);
      expect(openCallbacks([due, settler], "2026-09-14")).toEqual([]);
    }
    // a new promise on a later contact — even an operational one — replaces the old one
    const again = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 12), type: "close_out", method: "email", outcome: null, next_step: "call_back", next_step_at: "2026-09-21" });
    expect(openCallbacks([due, again], "2026-09-14")).toEqual([]);
    expect(openCallbacks([due, again], "2026-09-21").map((c) => c.contact_id)).toEqual([again.contact_id]);
  });

  it("next_step_at as an ISO timestamp reads the same calendar day", () => {
    const due = contact({ agent_id: "gary", contacted_at: iso(2026, 9, 8), outcome: "voicemail", next_step: "call_back", next_step_at: "2026-09-14T00:00:00.000Z" });
    expect(openCallbacks([due], "2026-09-14").map((c) => c.agent_id)).toEqual(["gary"]);
    expect(openCallbacks([due], "2026-09-13")).toEqual([]);
    const t = build(MON, { agents: [agent("gary")], contacts: [due] });
    expect(t.callbacks[0].right).toEqual({ value: "Today", caption: "promised" });
    expect(t.callbacks[0].context).toBe("you said you'd call back today");
  });

  it("is a row with the note, prefilled as a PROMISED call the cap never refuses, and pulls the agent out of the reactivation list", () => {
    const gary = agent("gary");
    // Benson, AZ — nowhere near Monday's anchor, so the callback is his only row
    const loads = [load({ agent_id: "gary", origin_city: "Benson", origin_state: "AZ", pickup_date: "2026-06-01", delivery_date: "2026-06-03" })];
    const contacts = [contact({ agent_id: "gary", contacted_at: iso(2026, 9, 8), outcome: "voicemail", next_step: "call_back", next_step_at: "2026-09-14", note: "asked for Monday" })];
    const t = build(MON, { agents: [gary], loads, contacts });
    expect(t.callbacks).toHaveLength(1);
    expect(t.callbacks[0]).toMatchObject({
      section: "CALL BACK",
      touched: null,
      right: { value: "Today", caption: "promised" },
      prefill: { direction: "outbound", method: "call", type: "reactivation", promised: true, note: "callback promised today" },
    });
    expect(t.callbacks[0].context).toBe("you said you'd call back today — asked for Monday");
    expect(t.listRows).toEqual([]);
    expect(t.count).toBe(1);
    // an overdue promise names the day it was for
    const overdue = [contact({ agent_id: "gary", contacted_at: iso(2026, 9, 8), outcome: "voicemail", next_step: "call_back", next_step_at: "2026-09-10" })];
    const t2 = build(MON, { agents: [gary], loads, contacts: overdue });
    expect(t2.callbacks[0].prefill.note).toBe("callback promised Thu");
    expect(t2.callbacks[0].right.value).toBe("Thu");
  });

  it("a parked agent's promise is not a row — Parked leaves every working surface", () => {
    const contacts = [contact({ agent_id: "gary", contacted_at: iso(2026, 9, 8), outcome: "voicemail", next_step: "call_back", next_step_at: "2026-09-14" })];
    expect(openCallbacks(contacts, "2026-09-14")).toHaveLength(1); // the lib alone does not know the book…
    const t = build(MON, { agents: [agent("gary", { work_status: "parked" })], contacts });
    expect(t.callbacks).toEqual([]); // …the queue does
    expect(t.count).toBe(0);
  });
});

describe("the lists — reactivation then prospecting, three rows and a door", () => {
  const lapsed = (id: string, day: string) => ({
    agent: agent(id),
    load: load({ agent_id: id, origin_city: "Benson", origin_state: "AZ", pickup_date: day, delivery_date: day, linehaul: "6704", fuel_surcharge: "0" }),
  });
  const a = lapsed("harrison", "2026-07-10"); // 67 days quiet on Tuesday Sep 15
  const b = lapsed("chris", "2026-07-20"); // 57
  const c = lapsed("dana", "2026-07-25");
  const d = lapsed("eve", "2026-07-30");
  const e = lapsed("frank", "2026-08-01");
  const fresh = lapsed("fresh", "2026-09-01"); // 14 days — not lapsed

  it("Tuesday: the first lapsed prospect is the plate's hero, the next three are rows, the rest wait behind the door", () => {
    const t = build(TUE, { agents: [a, b, c, d, e, fresh].map((x) => x.agent), loads: [a, b, c, d, e, fresh].map((x) => x.load) });
    expect(t.plan.lists).toEqual(["reactivation"]);
    if (t.plate.kind !== "reactivation") throw new Error("expected the reactivation plate");
    // shelf order: most loads first (all one here), then the quietest
    expect(t.plate.hero?.agent.agent_id).toBe("harrison");
    expect(t.plate.hero?.quietDays).toBe(67);
    expect(t.plate.heroTouched).toBeNull();
    expect(t.plate.lapsed).toBe(5);
    // the hero is not listed again beneath the plate — one reason per agent per day
    expect(t.listRows.map((r) => r.agent.agent_id)).toEqual(["chris", "dana", "eve"]);
    expect(t.listMore).toBe(1);
    expect(t.listRows[0]).toMatchObject({ section: "REACTIVATION", right: { value: "57d", caption: "quiet" }, prefill: { type: "reactivation", method: "call" } });
    expect(t.listRows[0].context).toBe("Benson, AZ · 1 load · $6,704 · Prospect");
    // three rows plus the live hero
    expect(t.count).toBe(4);
  });

  it("a capped agent is skipped for the hero and ghosted in the rows; with everyone capped the first is the hero, ghosted, and nothing counts", () => {
    const harrisonMon = contact({ agent_id: "harrison", contacted_at: iso(2026, 9, 14, 9), type: "reactivation", outcome: "voicemail" });
    // a voicemail is not two-way, so harrison is still lapsed — but capped this week
    const t = build(TUE, { agents: [a.agent, b.agent], loads: [a.load, b.load], contacts: [harrisonMon] });
    if (t.plate.kind !== "reactivation") throw new Error("expected the reactivation plate");
    expect(t.plate.hero?.agent.agent_id).toBe("chris");
    expect(t.plate.heroTouched).toBeNull();
    expect(t.listRows.map((r) => r.agent.agent_id)).toEqual(["harrison"]);
    expect(t.listRows[0].touched?.day).toBe("Mon");
    expect(t.count).toBe(1);

    const chrisMon = contact({ agent_id: "chris", contacted_at: iso(2026, 9, 14, 11), type: "capacity", method: "email", outcome: null });
    const all = build(TUE, { agents: [a.agent, b.agent], loads: [a.load, b.load], contacts: [harrisonMon, chrisMon] });
    if (all.plate.kind !== "reactivation") throw new Error("expected the reactivation plate");
    expect(all.plate.hero?.agent.agent_id).toBe("harrison");
    expect(all.plate.heroTouched?.day).toBe("Mon");
    expect(all.plate.heroTouched?.contact.type).toBe("reactivation");
    expect(all.listRows.map((r) => [r.agent.agent_id, r.touched?.day])).toEqual([["chris", "Mon"]]);
    expect(all.count).toBe(0);
  });

  it("the lapsed line is 42 LOCAL days quiet — 42 listed, 41 not, even at 9pm when UTC is already Wednesday", () => {
    const on = lapsed("edge42", "2026-08-04"); // 42 days before Tue Sep 15
    const off = lapsed("edge41", "2026-08-05"); // 41 — not lapsed yet
    for (const now of [TUE, local(2026, 9, 15, 21)]) {
      const t = build(now, { agents: [on.agent, off.agent], loads: [on.load, off.load] });
      if (t.plate.kind !== "reactivation") throw new Error("expected the reactivation plate");
      expect(t.plate.hero?.agent.agent_id).toBe("edge42");
      expect(t.plate.hero?.quietDays).toBe(42);
      expect(t.plate.lapsed).toBe(1);
      expect(t.listRows).toEqual([]);
    }
  });

  it("Thursday adds never-ran prospects after the reactivation rows; Friday and the weekend list nothing", () => {
    const never = agent("never", { agent_city: "Tulsa", agent_state: "OK", source: "load_board", created_at: "2026-09-01T00:00:00Z" });
    const t = build(THU, { agents: [a.agent, b.agent, never], loads: [a.load, b.load] });
    if (t.plate.kind !== "reactivation") throw new Error("expected the reactivation plate");
    expect(t.plate.hero?.agent.agent_id).toBe("harrison");
    expect(t.listRows.map((r) => r.section)).toEqual(["REACTIVATION", "PROSPECTING"]);
    expect(t.listRows[0].agent.agent_id).toBe("chris");
    expect(t.listRows[1]).toMatchObject({ right: { value: "new", caption: "prospect" }, prefill: { type: "cold" } });
    expect(t.listRows[1].context).toBe("Tulsa, OK · never ran · via load board");
    expect(t.count).toBe(3);
    expect(build(FRI, { agents: [a.agent, never], loads: [a.load] }).listRows).toEqual([]);
    expect(build(SAT, { agents: [a.agent, never], loads: [a.load] }).listRows).toEqual([]);
  });

  it("dormant prospects (nothing in 180 days) are Parked and never listed", () => {
    const dormant = lapsed("old", "2026-01-10");
    const t = build(TUE, { agents: [dormant.agent], loads: [dormant.load] });
    expect(t.listRows).toEqual([]);
  });
});

describe("DONE TODAY and the cooling section", () => {
  it("lists what was logged today, newest first, with a label and time", () => {
    const g = agent("gary");
    const contacts = [
      contact({ agent_id: "gary", contacted_at: iso(2026, 9, 14, 9), type: "capacity", method: "email", outcome: null }),
      contact({ agent_id: "gary", contacted_at: iso(2026, 9, 14, 11), type: "inbound_inquiry", direction: "inbound", outcome: null }),
      contact({ agent_id: "gary", contacted_at: iso(2026, 9, 13, 11) }), // yesterday
    ];
    const t = build(MON, { agents: [g], contacts });
    expect(t.done.map((d) => d.label)).toEqual(["Load offer", "Capacity heads-up"]);
    expect(t.done[0].agent?.agent_id).toBe("gary");
    expect(t.done[0].time).toMatch(/11:00/);
  });

  it("cooling reads the current tier and threshold; prospects never appear", () => {
    const drew = agent("drew", { relationship_tier: 2 });
    const contacts = [contact({ agent_id: "drew", contacted_at: iso(2026, 8, 10) })]; // 35 days → flags Sep 21 (7 days)
    const t = build(MON, { agents: [drew, agent("p")], contacts });
    expect(t.cooling.flagged).toEqual([]);
    expect(t.cooling.watch.map((r) => r.agent.agent_id)).toEqual(["drew"]);
    expect(t.cooling.watch[0].flagsOn).toBe("2026-09-21");
  });

  it("methodFor maps the preferred channel, email by default", () => {
    expect(methodFor("phone")).toBe("call");
    expect(methodFor("text")).toBe("text");
    expect(methodFor("email")).toBe("email");
    expect(methodFor(null)).toBe("email");
  });
});
