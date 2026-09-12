// The derived queue — Today's rows, in a FIXED order, never stored:
//   1. NOW        close-outs: loads delivered in the last 14 days with no
//                 close-out contact linked by load_id. Operational, uncapped.
//   2. the plate  the day's job (dayPlan): the capacity rows on Monday, the
//                 open nurture flags on Wednesday; Tue/Thu the first
//                 reactivation row is the hero; Friday the five; weekends none.
//   3. CALL BACK  contacts whose next_step_at has come with nothing after
//                 them that settles the promise — "you said you'd call back".
//                 A promise is kept, never capped: the row's prefill logs it
//                 with cap_override. One reason per agent per day — an agent
//                 owed a call back gets that row and no plate or list row.
//   4. the list   the next three rows of today's lists (reactivation, then
//                 prospecting per the day) → a door to the Call list.
// Nothing else is "due": the fixed cadence list is retired. Rows for agents
// who already had a proactive touch this week are ghosted with a TOUCHED
// {DAY} chip and are not offered a second proactive touch (operational rows
// are never ghosted). DONE TODAY lists what was logged today so a mis-log
// can be undone. Cooling is the owner's monitoring section at the bottom.
// Every "days since" here counts LOCAL calendar days — DATE columns are
// calendar days, and Brandie's today is the local one, not UTC's.
//
// This module composes the pure pieces; every number here recomputes from
// the book, the loads and the contact log — nothing is written back.
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { AgentContact, ContactMethod } from "@/services/agentContactsService";
import type { AgentCoverage } from "@/services/agentCoverageService";
import type { CoordMap } from "@/lib/metrics/foreman";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { loadGross } from "@/lib/metrics/rateTargets";
import { closeOutPending } from "@/lib/metrics/relationships";
import { originMarketsByAgent } from "@/lib/metrics/agentTouches";
import { dayPlan, type DayPlan, type ListKind } from "./dayPlan";
import { bucketLabel, bucketOf, partitionBook, type BookCtx } from "./buckets";
import { capStatus } from "./contactCap";
import { capacityList, emptyNextWhen, placeLabel, type CapacityList, type CapacityRow, type EmptyNext } from "./capacityList";
import { milestoneFlags, streakOf, type MilestoneFlag } from "./milestones";
import { holidayFlags, HOLIDAY_LABEL, type HolidayFlag } from "./holidays";
import type { MarkerNoteLike } from "./markers";
import { coolingSection, type CoolingSection } from "./cooling";
import { fridayFive, hygiene, type FridayFive, type HygieneItem } from "./fridayFive";
import { deliveredCount, lastLoadKey } from "./agentRpm";
import { daysSinceMeaningful, lastMeaningfulContact } from "./meaningfulContact";
import { daysBetweenKeys, keyOf, localDayKey, shortDate } from "./dayKeys";
import { contactKind, contactTypeLabel, defaultTouchType, type ContactDirection, type ContactType } from "./contactTypes";

export const CLOSE_OUT_DAYS = 14;
export const LIST_ROWS = 3;
// The Reactivation Gameplan's "lapsed": a prospect who hauled before and has
// had nothing — no two-way contact, no load — in six weeks.
export const REACTIVATION_QUIET_DAYS = 42;

export type QueueSection = "NOW" | "CAPACITY" | "NURTURE" | "CALL BACK" | "REACTIVATION" | "PROSPECTING";

// What the agent sheet opens with from a row. Structurally the sheet's
// TouchPrefill — kept here so the lib never imports a component.
export interface QueuePrefill {
  direction: ContactDirection;
  method: ContactMethod;
  type: ContactType;
  load_id?: string | null;
  note?: string;
  // A CALL BACK row: the call was promised, so the form never refuses it on
  // the cap — it logs with cap_override and the note says why.
  promised?: true;
}

export interface TouchedThisWeek {
  day: string; // "Mon"
  contact: AgentContact; // the message a second reason would fold into
}

export type NurtureFlag = { type: "milestone"; flag: MilestoneFlag<Agent> } | { type: "holiday"; flag: HolidayFlag<Agent> };

export interface QueueRow {
  key: string;
  section: QueueSection;
  agent: Agent;
  context: string; // line 2
  right: { value: string; caption: string };
  operational: boolean;
  touched: TouchedThisWeek | null; // ghosted when set (never for operational rows)
  prefill: QueuePrefill;
  load?: Load; // NOW
  miles?: number; // CAPACITY
  flag?: NurtureFlag; // NURTURE
  callback?: AgentContact; // CALL BACK
}

export interface ReactivationRow {
  agent: Agent;
  delivered: number;
  gross: number;
  quietDays: number | null;
  place: string | null;
  lastLoad: string | null;
}

export type Plate =
  | {
      kind: "capacity";
      anchor: EmptyNext | null;
      list: CapacityList<Agent>;
      hero: CapacityRow<Agent> | null;
      heroFlag: NurtureFlag | null; // a milestone / holiday due for the hero → one combined message
      combined: number; // rows whose agent also has a flag open
    }
  | {
      kind: "reactivation";
      hero: ReactivationRow | null; // the first lapsed prospect NOT capped this week (else the first, ghosted)
      heroTouched: TouchedThisWeek | null;
      lapsed: number;
    }
  | {
      kind: "nurture";
      hero: NurtureFlag | null;
      heroTouched: TouchedThisWeek | null;
      heroStreak: number;
      heroWeekTouches: number;
      open: number;
    }
  | { kind: "five"; five: FridayFive; hygiene: HygieneItem<Agent>[] }
  | { kind: "none"; anchor: EmptyNext | null; anchorResolved: boolean; within: number };

export interface DoneRow {
  contact: AgentContact;
  agent: Agent | null;
  label: string;
  time: string;
}

export interface TodayModel {
  plan: DayPlan;
  todayKey: string; // local
  plate: Plate;
  closeOuts: QueueRow[];
  plateRows: QueueRow[]; // CAPACITY / NURTURE rows under the plate
  callbacks: QueueRow[];
  listRows: QueueRow[]; // the next LIST_ROWS of today's lists
  listMore: number; // behind the door
  done: DoneRow[];
  count: number; // rows left to act on
  flags: NurtureFlag[]; // every open nurture flag today
  cooling: CoolingSection<Agent>;
}

export interface TodayInput {
  agents: Agent[];
  loads: Load[];
  contacts: AgentContact[];
  coverage: AgentCoverage[];
  notes: MarkerNoteLike[];
  coords: CoordMap;
  ladder: RateLadder | null;
  now: Date;
}

// The channel a heads-up goes out on: the agent's preferred, else email.
export const methodFor = (preferred: string | null | undefined): ContactMethod =>
  preferred === "phone" ? "call" : preferred === "text" ? "text" : "email";

const weekdayShort = (iso: string): string => new Date(iso).toLocaleDateString("en-US", { weekday: "short" });
const weekdayOfKey = (k: string): string => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

const touchedThisWeek = (agentId: string, contacts: AgentContact[], now: Date): TouchedThisWeek | null => {
  const cap = capStatus(agentId, contacts, now);
  return cap.blocked && cap.first ? { day: weekdayShort(cap.first.contacted_at), contact: cap.first } : null;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const nurtureAgent = (f: NurtureFlag): Agent => f.flag.agent;
export const nurtureMarker = (f: NurtureFlag): string => f.flag.marker;
export const nurtureType = (f: NurtureFlag): ContactType => f.type;
export const nurtureLabel = (f: NurtureFlag): string => (f.type === "milestone" ? f.flag.label : HOLIDAY_LABEL[f.flag.kind]);
export const nurtureKey = (f: NurtureFlag): string => `${f.flag.agent.agent_id}:${f.flag.marker}`;

// What settles a promise: a LATER contact on the agent that is anything but
// operational bookkeeping — inbound (they called), any proactive touch (you
// reached out, even to voicemail), the owner's thread — or a call that was
// reached whatever it was filed under. A close-out, a load in progress or a
// freight bill leaves the promise standing: you still owe them the call.
export const settlesCallback = (c: Pick<AgentContact, "type" | "direction" | "method" | "outcome">): boolean =>
  contactKind(c.type, c.direction) !== "operational" || (c.method === "call" && c.outcome === "reached");

// Open callbacks: per agent, the LATEST promise (a later promise supersedes
// an earlier one) whose day has come, with nothing after it that settles it.
export const openCallbacks = (contacts: AgentContact[], todayKey: string): AgentContact[] => {
  const byAgent = new Map<string, AgentContact[]>();
  for (const c of contacts) {
    const mine = byAgent.get(c.agent_id) ?? [];
    mine.push(c);
    byAgent.set(c.agent_id, mine);
  }
  const open: AgentContact[] = [];
  for (const mine of byAgent.values()) {
    mine.sort((a, b) => a.contacted_at.localeCompare(b.contacted_at));
    let at = mine.length - 1;
    while (at >= 0 && mine[at].next_step_at == null) at--;
    if (at < 0) continue;
    const promise = mine[at];
    if (keyOf(promise.next_step_at!) > todayKey) continue;
    if (mine.slice(at + 1).some(settlesCallback)) continue;
    open.push(promise);
  }
  return open.sort((a, b) => keyOf(a.next_step_at!).localeCompare(keyOf(b.next_step_at!)));
};

// "Today" · "Mon" (inside the last week) · "Sep 8"
export const promisedWord = (dayKey: string, todayKey: string): string => {
  const back = daysBetweenKeys(dayKey, todayKey);
  if (back <= 0) return "Today";
  if (back < 7) return weekdayOfKey(dayKey);
  return shortDate(dayKey) ?? dayKey;
};

export const buildToday = (input: TodayInput): TodayModel => {
  const { agents, loads, contacts, coverage, notes, coords, ladder, now } = input;
  const plan = dayPlan(now);
  const todayKey = localDayKey(now);
  const byId = new Map(agents.map((a) => [a.agent_id, a]));
  const ctx: BookCtx = { loads, contacts, now, loadsReady: true };
  const markets = originMarketsByAgent(loads);
  const book = partitionBook(agents, ctx);
  // The active book, in shelf order — tiers, the unplaced, then prospects.
  const active = [...book.tier1, ...book.tier2, ...book.tier3, ...book.needsTier, ...book.prospects];
  const touched = (a: Agent) => touchedThisWeek(a.agent_id, contacts, now);
  const placeOf = (a: Agent): string | null => {
    const top = markets.get(a.agent_id)?.[0];
    if (top) return `${top.city}, ${top.state}`;
    return a.agent_city ? `${a.agent_city}${a.agent_state ? `, ${a.agent_state}` : ""}` : null;
  };

  // ---- nurture flags (every day — the plate offers them on Wednesday, the
  // capacity pass folds them in on Monday) ----
  const flags: NurtureFlag[] = [
    ...milestoneFlags(active, loads, contacts, notes, now).map((flag) => ({ type: "milestone" as const, flag })),
    ...holidayFlags(active, contacts, notes, now).map((flag) => ({ type: "holiday" as const, flag })),
  ];
  const flagFor = (agentId: string): NurtureFlag | null => flags.find((f) => f.flag.agent.agent_id === agentId) ?? null;

  // ---- 1. NOW — close-outs ----
  const closeOuts: QueueRow[] = closeOutPending(loads, contacts, now, CLOSE_OUT_DAYS)
    .sort((a, b) => (b.delivery_date ?? "").localeCompare(a.delivery_date ?? ""))
    .flatMap((l) => {
      const agent = l.agent_id ? byId.get(l.agent_id) : undefined;
      if (!agent) return [];
      const dropKey = keyOf(l.delivery_date as string);
      const since = Math.max(0, daysBetweenKeys(dropKey, todayKey));
      return [
        {
          key: `now:${l.load_id}`,
          section: "NOW" as const,
          agent,
          context: `${l.load_number} delivered ${shortDate(dropKey)} · operational — never capped`,
          right: { value: `${since}d`, caption: "since drop" },
          operational: true,
          touched: null,
          prefill: { direction: "outbound", method: "email", type: "close_out", load_id: l.load_id },
          load: l,
        },
      ];
    });

  // ---- the capacity pass (Monday's plate; the weekend's preview) ----
  const anchor = emptyNextWhen(loads);
  const capacity = capacityList(agents, loads, coverage, coords, anchor, { contacts, now, loadsReady: true });
  const capacityRow = (r: CapacityRow<Agent>): QueueRow => {
    const n = deliveredCount(loads, r.agent.agent_id);
    return {
      key: `cap:${r.agent.agent_id}`,
      section: "CAPACITY",
      agent: r.agent,
      context: `${placeLabel(r.nearestPlace)} · ${Math.round(r.miles)} mi · ${bucketLabel(r.bucket)}${n > 0 ? ` · ${plural(n, "load")}` : ""}`,
      right: { value: `${Math.round(r.miles)}`, caption: "miles" },
      operational: false,
      touched: null, // touched agents were folded out of the list
      prefill: { direction: "outbound", method: methodFor(r.agent.preferred_contact), type: "capacity" },
      miles: r.miles,
    };
  };

  // ---- the nurture rows (Wednesday's plate) ----
  const nurtureRow = (f: NurtureFlag): QueueRow => {
    const agent = nurtureAgent(f);
    const crossed = f.type === "milestone" ? f.flag.crossedOn : f.flag.day;
    const t = touched(agent);
    return {
      key: `nurture:${nurtureKey(f)}`,
      section: "NURTURE",
      agent,
      context:
        f.type === "milestone"
          ? `${nurtureLabel(f)}${crossed ? ` · crossed ${shortDate(crossed)}` : ""} · not yet sent`
          : `${nurtureLabel(f)} · ${shortDate(crossed)}${agent.relationship_tier === 1 ? " · Tier 1 — the owner personalizes it" : ""} · not yet sent`,
      right:
        f.type === "milestone"
          ? { value: f.flag.kind === "anniversary" ? `${f.flag.years ?? 1}y` : `${f.flag.n}`, caption: f.flag.kind === "loads" ? "loads" : f.flag.kind === "streak" ? "straight" : "together" }
          : { value: shortDate(crossed) ?? "—", caption: "the day" },
      operational: false,
      touched: t,
      prefill: { direction: "outbound", method: methodFor(agent.preferred_contact), type: nurtureType(f), note: `${nurtureMarker(f)} ` },
      flag: f,
    };
  };

  // ---- one reason per agent per day ----
  // An agent owed a call back today gets the CALL BACK row and nothing else:
  // no capacity row, no nurture row, no list row. The promise is the day's
  // reason; the heads-up or the flag waits for the call.
  const callbackContacts = openCallbacks(contacts, todayKey).filter((c) => byId.get(c.agent_id)?.work_status !== "parked");
  const callbackAgents = new Set(callbackContacts.map((c) => c.agent_id));
  const owedACall = (a: { agent_id: string }): boolean => callbackAgents.has(a.agent_id);

  // ---- today's lists: reactivation, then prospecting ----
  // Shelf order (partitionBook): most loads first, then the quietest.
  const reactivation: ReactivationRow[] = [...book.needsTier, ...book.prospects]
    .filter((a) => bucketOf(a, ctx) === "prospect" && !owedACall(a))
    .flatMap((a) => {
      const delivered = deliveredCount(loads, a.agent_id);
      if (delivered === 0) return [];
      const last = lastMeaningfulContact(a.agent_id, contacts, loads);
      const quietDays = last == null ? null : Math.max(0, daysBetweenKeys(last, todayKey));
      if (quietDays != null && quietDays < REACTIVATION_QUIET_DAYS) return [];
      const gross = loads.filter((l) => l.agent_id === a.agent_id && l.load_status === "delivered").reduce((s, l) => s + loadGross(l), 0);
      return [{ agent: a, delivered, gross, quietDays, place: placeOf(a), lastLoad: lastLoadKey(loads, a.agent_id) }];
    });
  const prospecting: Agent[] = book.prospects.filter((a) => deliveredCount(loads, a.agent_id) === 0 && !owedACall(a));

  const reactivationRow = (r: ReactivationRow): QueueRow => ({
    key: `react:${r.agent.agent_id}`,
    section: "REACTIVATION",
    agent: r.agent,
    context: [r.place, plural(r.delivered, "load"), money0(r.gross), "Prospect", r.quietDays == null ? "never a two-way contact" : null].filter((x): x is string => x != null).join(" · "),
    right: r.quietDays == null ? { value: "never", caption: "contact" } : { value: `${r.quietDays}d`, caption: "quiet" },
    operational: false,
    touched: touched(r.agent),
    prefill: { direction: "outbound", method: "call", type: "reactivation" },
  });
  const prospectingRow = (a: Agent): QueueRow => {
    const days = daysSinceMeaningful(a.agent_id, contacts, loads, now);
    return {
      key: `cold:${a.agent_id}`,
      section: "PROSPECTING",
      agent: a,
      context: [placeOf(a), "never ran", a.source ? `via ${a.source.replace(/_/g, " ")}` : null].filter((x): x is string => x != null).join(" · "),
      right: days == null ? { value: "new", caption: "prospect" } : { value: `${days}d`, caption: "since contact" },
      operational: false,
      touched: touched(a),
      prefill: { direction: "outbound", method: "call", type: "cold" },
    };
  };
  // ---- 3. CALL BACK ----
  const callbacks: QueueRow[] = callbackContacts.flatMap((c) => {
    const agent = byId.get(c.agent_id);
    if (!agent) return [];
    const promised = keyOf(c.next_step_at!);
    const when = promisedWord(promised, todayKey);
    return [
      {
        key: `cb:${c.contact_id}`,
        section: "CALL BACK" as const,
        agent,
        context: `you said you'd call back ${when === "Today" ? "today" : when}${c.note ? ` — ${c.note}` : ""}`,
        right: { value: when, caption: "promised" },
        operational: false,
        touched: null, // a promise is kept — the form logs it with cap_override, never refuses it
        prefill: {
          direction: "outbound",
          method: "call",
          type: defaultTouchType(agent, deliveredCount(loads, agent.agent_id)),
          note: `callback promised ${when === "Today" ? "today" : when}`,
          promised: true,
        },
        callback: c,
      },
    ];
  });

  // ---- 2. the plate ----
  let plate: Plate;
  let plateRows: QueueRow[] = [];
  switch (plan.plate) {
    case "capacity": {
      // `list` keeps the geography (who is within 150 mi — the grid's count);
      // the OFFER — hero, rows, combined — leaves out anyone owed a call back.
      const offered = capacity.rows.filter((r) => !owedACall(r.agent));
      plateRows = offered.map(capacityRow);
      const hero = offered[0] ?? null;
      plate = {
        kind: "capacity",
        anchor,
        list: capacity,
        hero,
        heroFlag: hero ? flagFor(hero.agent.agent_id) : null,
        combined: offered.filter((r) => flagFor(r.agent.agent_id) != null).length,
      };
      break;
    }
    case "nurture": {
      // `open` is what the plate offers today; `flags` (below) stays every
      // open flag, so the view can say how many wait on a call back instead.
      plateRows = flags.filter((f) => !owedACall(nurtureAgent(f))).map(nurtureRow);
      const heroRow = plateRows.find((r) => !r.touched) ?? plateRows[0];
      const hero = heroRow?.flag ?? null;
      plate = {
        kind: "nurture",
        hero,
        heroTouched: heroRow?.touched ?? null,
        heroStreak: hero ? streakOf(loads, nurtureAgent(hero).agent_id).n : 0,
        heroWeekTouches: hero ? capStatus(nurtureAgent(hero).agent_id, contacts, now).count : 0,
        open: plateRows.length,
      };
      break;
    }
    case "reactivation": {
      // The hero is the first lapsed prospect still clear this week — the
      // nurture plate's rule; when everyone is capped, the first one, ghosted.
      const hero = reactivation.find((r) => !touched(r.agent)) ?? reactivation[0] ?? null;
      plate = { kind: "reactivation", hero, heroTouched: hero ? touched(hero.agent) : null, lapsed: reactivation.length };
      break;
    }
    case "five":
      plate = { kind: "five", five: fridayFive(contacts, loads, ladder?.walkAway ?? null, now), hygiene: hygiene(active, loads, coverage) };
      break;
    default:
      plate = { kind: "none", anchor, anchorResolved: capacity.anchorResolved, within: capacity.rows.length + capacity.touched.length };
  }

  // ---- 4. the next rows of today's lists ----
  // One reason per agent per day: an agent already on the plate (a capacity
  // row, a nurture flag, the reactivation hero) is not listed again beneath
  // it — the plate carries the day.
  const inPlate = new Set(plateRows.map((r) => r.agent.agent_id));
  if (plate.kind === "reactivation" && plate.hero) inPlate.add(plate.hero.agent.agent_id);
  const listFor = (kind: ListKind): QueueRow[] => (kind === "reactivation" ? reactivation.map(reactivationRow) : prospecting.map(prospectingRow));
  const allListRows = plan.lists.flatMap(listFor).filter((r) => !inPlate.has(r.agent.agent_id));
  const listRows = allListRows.slice(0, LIST_ROWS);
  const listMore = allListRows.length - listRows.length;

  // ---- DONE TODAY ----
  const done: DoneRow[] = contacts
    .filter((c) => localDayKey(new Date(c.contacted_at)) === todayKey)
    .sort((a, b) => b.contacted_at.localeCompare(a.contacted_at))
    .map((c) => ({
      contact: c,
      agent: byId.get(c.agent_id) ?? null,
      label: contactTypeLabel(c.type),
      time: new Date(c.contacted_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    }));

  // Rows left to act on, plus the plate's own job when it is not a row: the
  // five on Friday, the reactivation hero (Tue/Thu) when they are clear.
  const actionable = [...closeOuts, ...plateRows, ...callbacks, ...listRows].filter((r) => !r.touched).length;
  const plateJob = plan.plate === "five" ? 1 : plate.kind === "reactivation" && plate.hero && !plate.heroTouched ? 1 : 0;
  return {
    plan,
    todayKey,
    plate,
    closeOuts,
    plateRows,
    callbacks,
    listRows,
    listMore,
    done,
    count: actionable + plateJob,
    flags,
    cooling: coolingSection(agents, contacts, loads, now),
  };
};
