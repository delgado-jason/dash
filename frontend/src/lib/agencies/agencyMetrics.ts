// The book, rolled up by AGENCY (Agencies Nod Sheet, decisions 7A and 8A as
// Jason amended it). Pure and clock-injected throughout.
//
// The doctrine this file encodes, because every number here depends on it:
//
//   • A load counts for the agency on the LOAD (`load.agency_id`), never for
//     whatever agency its agent belongs to TODAY. Move Drew Hannon from CPL to
//     Momentum tomorrow and CPL keeps the seven loads he booked there — the
//     history stays where the money was earned.
//   • The PEOPLE keep their own numbers and their own tiers. An agent's
//     delivered count and all-in RPM on this page are the same figures their
//     own row shows on Tiers — lifetime loads, trailing-12-month RPM — so the
//     agency window never re-grades a person. That is why an agency's
//     delivered count and the sum of its agents' counts can disagree: they
//     answer two different questions.
//   • Codes are evidence. The agency code is the shared desk (lit); every
//     other code the agency has posted under is dashed. The code TRAIL checks
//     what the settlements actually posted against that set.
//   • The settlement-only rows are history and a door. They carry no miles, no
//     agent and no footprint, so they never enter the ladder, the tiers or the
//     Foreman — nothing here lets them.
import type { Agency } from "@/types/agency";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import type { RecapRange } from "@/lib/metrics/recap";
import {
  SYSTEM_START,
  inboundShare,
  type InboundShare,
} from "@/lib/metrics/relationships";
import { agentAllInRpm, allInOver, deliveredCount } from "@/lib/relationships/agentRpm";
import {
  lastMeaningfulContact,
  type MeaningfulContactLike,
} from "@/lib/relationships/meaningfulContact";
import { DAY_MS, daysBetweenKeys, keyOf, utcDayKey } from "@/lib/relationships/dayKeys";
import { money, rpm } from "@/lib/format";
import { codeOf, type AgentCode } from "./codeOf";
import type { CodedAgencyLike } from "./otherCodes";

// ---------------------------------------------------------------- the window

export const AGENCY_WINDOWS = ["12m", "90d", "all"] as const;
export type AgencyWindow = (typeof AGENCY_WINDOWS)[number];

export const WINDOW_LABEL: Record<AgencyWindow, string> = {
  "12m": "12 months",
  "90d": "90 days",
  all: "All time",
};

const WINDOW_DAYS: Record<AgencyWindow, number | null> = {
  "12m": 365,
  "90d": 90,
  all: null,
};

// Before any freight existed — the "all time" floor, so nothing needs a null
// branch downstream.
const EPOCH_KEY = "1970-01-01";

// A RecapRange (start / end / label — the shape every period on the Recap page
// already wears) PLUS the two day keys the comparison actually uses. The keys
// are the working form: a load's pickup_date is a DATE column, so comparing
// 'YYYY-MM-DD' strings is exact and a DST hour cannot leak in (CLAUDE.md §5).
export interface AgencyRange extends RecapRange {
  fromKey: string; // inclusive
  toKey: string; // inclusive — today
}

export const agencyRange = (window: AgencyWindow, now: Date): AgencyRange => {
  const toKey = utcDayKey(now);
  const days = WINDOW_DAYS[window];
  const fromKey = days == null ? EPOCH_KEY : utcDayKey(new Date(now.getTime() - days * DAY_MS));
  return {
    start: new Date(`${fromKey}T00:00:00Z`),
    // RecapRange's end is exclusive; the keys above are both inclusive, so the
    // Date form ends at tomorrow's midnight.
    end: new Date(Date.parse(`${toKey}T00:00:00Z`) + DAY_MS),
    label: WINDOW_LABEL[window],
    fromKey,
    toKey,
  };
};

const inWindow = (raw: string | null | undefined, range: AgencyRange): boolean => {
  if (!raw) return false;
  const k = keyOf(raw);
  return k >= range.fromKey && k <= range.toKey;
};

// The agency's delivered freight inside the window, picked up (not delivered)
// in it — the same end of the load agentAllInRpm windows on, so the desk's
// number and the person's number are measured over the same days.
export const deliveredInWindow = (loads: readonly Load[], range: AgencyRange): Load[] =>
  loads.filter((l) => l.load_status === "delivered" && inWindow(l.pickup_date, range));

// ------------------------------------------------------------------ the band

// Where an agency's all-in RPM sits on the live ladder, in the nod sheet's
// words. Deliberately NOT lib/relationships/tierSuggestion's `bandLabel`: that
// one says "above Walk-away" / "under Walk-away" for the bottom two steps,
// while the agency row says "under Minimum" and "losing money" (the mock's CPL
// row reads "$4.66 under Minimum"). Same thresholds, the sheet's vocabulary.
//
// No ladder — or a half-built one — means no verdict: null, never a grade.
export const agencyBand = (
  rpm: number | null,
  ladder: RateLadder | null | undefined,
): string | null => {
  if (rpm == null || ladder == null) return null;
  const { walkAway, minimum, target, strong } = ladder;
  if (walkAway == null || minimum == null || target == null) return null;
  if (strong != null && rpm >= strong) return "above Strong";
  if (rpm >= target) return "above Target";
  if (rpm >= minimum) return "above Minimum";
  if (rpm >= walkAway) return "under Minimum";
  return "losing money";
};

// ----------------------------------------------------------------- the rollup

export interface AgencyAgentRow {
  agent: Agent;
  // The OWNER's tier (1 | 2 | 3), or null — a prospect, or nobody's graded
  // them yet. Never inferred here; the agency page only draws it.
  tier: number | null;
  // Which chip this person wears: their own posting code (dashed) or the
  // agency's desk code (lit). null when neither is on file.
  postingCode: AgentCode | null;
  // Their own numbers, unchanged: lifetime delivered loads and the
  // trailing-12-month all-in RPM — the same two figures Tiers shows.
  delivered: number;
  allInRpm: number | null;
  partialRpm: boolean; // at least one load had no deadhead logged
  // Last two-way contact ('YYYY-MM-DD'), null when there has never been one.
  lastContact: string | null;
  daysSinceContact: number | null;
}

export interface AgencyRow {
  agency: Agency;
  agents: AgencyAgentRow[];
  delivered: number; // delivered loads in the window
  gross: number; // their gross — 0 when nothing delivered; the UI draws "—"
  allInRpm: number | null; // null when no miles were logged, never $0.00
  partialRpm: boolean;
  band: string | null; // null without a ladder — no fake grade
  // Inbound since SYSTEM_START, not since the window: the page prints
  // "attributed since Sep 3", so the number has to be measured there or the
  // caption lies. Same definition the Relationships shell's chip uses —
  // inboundShare keys on the BOOKING day, so a desk that booked today for next
  // week's pickup already counts here, not once the truck has loaded.
  inbound: InboundShare;
  lastLoad: string | null; // max pickup_date over non-cancelled loads, any window
  // Days since that pickup, clamped at 0 — a load booked for next week is
  // freight happening NOW, not negative days (the house rule
  // daysSinceMeaningful already follows). null = they never ran.
  daysSinceLoad: number | null;
  // ...and when that pickup is still AHEAD of today, the days until it. A
  // future pickup is not a past load: the row says "picks up Sep 20 · 7d until
  // pickup" rather than reporting freight that has not moved as "0d since
  // load". null whenever the last load has already been picked up (or there
  // has never been one), which is also the flag for "is it ahead?".
  daysUntilLoad: number | null;
  tieredCount: number;
}

const byId = <T>(rows: readonly T[], key: (row: T) => string | null): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const bucket = out.get(k);
    if (bucket) bucket.push(row);
    else out.set(k, [row]);
  }
  return out;
};

// The most recent day this agency actually had freight moving: the largest
// pickup_date over its non-cancelled loads, whatever window is showing. A 90-day
// view must still be able to say "last load Aug 6" — hiding it would read as
// "never ran".
const lastPickupKey = (loads: readonly Load[]): string | null => {
  let max: string | null = null;
  for (const l of loads) {
    if (l.load_status === "cancelled" || !l.pickup_date) continue;
    const k = keyOf(l.pickup_date);
    if (max == null || k > max) max = k;
  }
  return max;
};

const nameKey = (a: Agency): string => (a.name ?? a.agency_code ?? "").toLowerCase();

export const agencyRollup = (
  agencies: readonly Agency[],
  agents: readonly Agent[],
  loads: Load[],
  contacts: MeaningfulContactLike[],
  ladder: RateLadder | null | undefined,
  window: AgencyWindow,
  now: Date,
): AgencyRow[] => {
  const range = agencyRange(window, now);
  const todayKey = utcDayKey(now);
  // The LOAD's agency, not the agent's — the whole point of decision 7A.
  const loadsOf = byId(loads, (l) => l.agency_id);
  const agentsOf = byId(agents, (a) => a.agency_id);

  const rows = agencies.map((agency): AgencyRow => {
    const mine = loadsOf.get(agency.agency_id) ?? [];
    const members = agentsOf.get(agency.agency_id) ?? [];
    const windowed = deliveredInWindow(mine, range);
    const desk = allInOver(windowed);
    const last = lastPickupKey(mine);

    const agentRows = members.map((agent): AgencyAgentRow => {
      // The person's own numbers, over EVERY load they ever booked — not just
      // this agency's. Someone who moved desks keeps one career.
      const own = agentAllInRpm(loads, agent.agent_id, now);
      const lastContact = lastMeaningfulContact(agent.agent_id, contacts, loads);
      return {
        agent,
        tier: agent.relationship_tier,
        postingCode: codeOf(agent),
        delivered: deliveredCount(loads, agent.agent_id),
        allInRpm: own.rpm,
        partialRpm: own.partial,
        lastContact,
        daysSinceContact:
          lastContact == null ? null : Math.max(0, daysBetweenKeys(lastContact, todayKey)),
      };
    });

    return {
      agency,
      agents: agentRows,
      delivered: windowed.length,
      gross: desk.gross,
      allInRpm: desk.rpm,
      partialRpm: desk.partial,
      band: agencyBand(desk.rpm, ladder),
      inbound: inboundShare(mine, SYSTEM_START, todayKey),
      lastLoad: last,
      daysSinceLoad: last == null ? null : Math.max(0, daysBetweenKeys(last, todayKey)),
      daysUntilLoad: last == null || last <= todayKey ? null : daysBetweenKeys(todayKey, last),
      tieredCount: agentRows.filter((a) => a.tier != null).length,
    };
  });

  // Gross desc — the book reads biggest first. Name (then code) breaks a tie
  // so the order never shuffles between renders of the same data.
  rows.sort((a, b) => b.gross - a.gross || nameKey(a.agency).localeCompare(nameKey(b.agency)));
  return rows;
};

// -------------------------------------------------------------- the code trail

export interface CodeTrailMiss {
  load: Load;
  postingCode: string;
}

export interface CodeTrail {
  matched: number; // posted under a code this agency owns
  unmatched: CodeTrailMiss[]; // posted under a code it does not — the reconciliation list
  uncoded: number; // no settlement has said yet — evidence missing, not a mismatch
}

// Settlements vs dash. `agency.posting_codes` is the set migration 075 built
// and the settlement feed maintains: the agency's own code, its agents' codes,
// and desks nobody works any more (Momentum's SUU). A load posted under
// anything else is the reconciliation list — either the load is filed under
// the wrong agency, or the agency has a desk nobody has recorded.
//
// A load with NO posting code is neither: the settlement simply has not spoken
// for it yet, and counting it as a mismatch would invent a problem.
export const codeTrail = (
  agency: CodedAgencyLike | Agency | null | undefined,
  loads: readonly Load[],
): CodeTrail => {
  const owned = new Set<string>();
  const own = (agency?.agency_code ?? "").trim();
  if (own) owned.add(own);
  for (const raw of agency?.posting_codes ?? []) {
    const code = (raw ?? "").trim();
    if (code) owned.add(code);
  }

  let matched = 0;
  let uncoded = 0;
  const unmatched: CodeTrailMiss[] = [];
  for (const load of loads) {
    const postingCode = (load.posting_code ?? "").trim();
    if (!postingCode) {
      uncoded++;
      continue;
    }
    if (owned.has(postingCode)) matched++;
    else unmatched.push({ load, postingCode });
  }

  // Newest first — a mismatch from last week matters more than one from March.
  unmatched.sort((a, b) => keyOf(b.load.pickup_date ?? "").localeCompare(keyOf(a.load.pickup_date ?? "")));
  return { matched, unmatched, uncoded };
};

// ------------------------------------------------- the settlement-only shelf

// One paid load off a settlement that never became a load in dash. The shape
// GET /agencies/settlement-only hands back — `revenue` is a Postgres numeric,
// so it arrives as a STRING and is coerced here, never multiplied raw.
export interface SettlementOnlyRow {
  agent_code: string;
  load_number: string;
  first_period: string; // 'YYYY-MM-DD'
  revenue: string | number;
  agency_id: string | null;
}

export interface ShelfRow {
  code: string;
  agency: Agency | null; // null = a code dash has never seen; its row gets the +
  loads: number;
  revenue: number;
  firstPeriod: string | null;
}

// Group the rows by code. The YEAR RULE is not here on purpose: the backend
// query already refuses anything older than the account's current year, so the
// shelf shows what it is handed and never has to re-decide what counts.
// Every code that leads to an agency, not just the agency codes. An agency
// owns a SET (migration 075 §5d): its own desk code, its agents' codes, and
// desks nobody works any more. A settlement posted under MAM belongs to
// Central Pennsylvania — MAM is Eric's desk inside it — and looking the code
// up by `agency_code` alone would call it UNKNOWN and offer a `+` that creates
// a second agency for a desk that already exists.
//
// Built in two passes so the owner wins: an agency that merely POSTED under a
// code yields to the one whose own code it is, whatever order the list arrives
// in.
const codeIndex = (agencies: readonly Agency[]): Map<string, Agency> => {
  const byCode = new Map<string, Agency>();
  for (const a of agencies) {
    for (const raw of a.posting_codes ?? []) {
      const code = (raw ?? "").trim();
      if (code && !byCode.has(code)) byCode.set(code, a);
    }
  }
  for (const a of agencies) {
    const own = (a.agency_code ?? "").trim();
    if (own) byCode.set(own, a);
  }
  return byCode;
};

export const settlementOnlyShelf = (
  rows: readonly SettlementOnlyRow[],
  agencies: readonly Agency[],
): ShelfRow[] => {
  const byAgencyId = new Map(agencies.map((a) => [a.agency_id, a]));
  const byCode = codeIndex(agencies);
  const groups = new Map<string, { loads: Set<string>; revenue: number; firstPeriod: string | null; agency: Agency | null }>();

  for (const row of rows) {
    const code = (row.agent_code ?? "").trim();
    if (!code) continue;
    let g = groups.get(code);
    if (!g) {
      // The backend matched the code to an agency; fall back to the code set
      // itself, so a row still finds its agency if the join ever comes back
      // empty (a client-side agency created since the last fetch).
      const agency =
        (row.agency_id ? byAgencyId.get(row.agency_id) : undefined) ?? byCode.get(code) ?? null;
      g = { loads: new Set(), revenue: 0, firstPeriod: null, agency };
      groups.set(code, g);
    }
    if (row.load_number) g.loads.add(row.load_number);
    // A NET sum: the settlement's trip lines for this load, adjustments
    // included, so a chargeback or a correction posted later lowers the row
    // rather than being counted as more freight. A null or non-numeric amount
    // contributes nothing and never voids the row — the LOAD still happened.
    const revenue = Number(row.revenue);
    if (Number.isFinite(revenue)) g.revenue += revenue;
    const period = row.first_period ? keyOf(row.first_period) : null;
    if (period && (g.firstPeriod == null || period < g.firstPeriod)) g.firstPeriod = period;
  }

  return [...groups.entries()]
    .map(([code, g]) => ({
      code,
      agency: g.agency,
      loads: g.loads.size,
      revenue: g.revenue,
      firstPeriod: g.firstPeriod,
    }))
    // Most loads first — the biggest hole in the books leads. Code breaks ties.
    .sort((a, b) => b.loads - a.loads || b.revenue - a.revenue || a.code.localeCompare(b.code));
};

// ----------------------------------------------------------------- the report

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

// COPY REPORT — the list as plain text, the same facts in the same order the
// page draws them. Agencies with nothing delivered in the window are left out:
// a report is what happened, and forty "0 · —" lines bury the five that matter.
export const agencyReport = (
  rows: readonly AgencyRow[],
  shelf: readonly ShelfRow[],
  windowLabel: string,
  since: string | null,
  now: Date,
): string => {
  const out: string[] = [`AGENCIES · ${windowLabel} · as of ${utcDayKey(now)}`, ""];

  const ran = rows.filter((r) => r.delivered > 0);
  if (ran.length === 0) {
    out.push("No delivered freight in this window.");
  } else {
    for (const r of ran) {
      const facts = [
        // An agency nobody has named IS its code — printing it as both the
        // name and the code says "CPL · CPL".
        ...(r.agency.name ? [r.agency.name, r.agency.agency_code] : [r.agency.agency_code]),
        plural(r.delivered, "load"),
        money(r.gross),
        `${rpm(r.allInRpm)}${r.partialRpm ? "*" : ""} all-in`,
        r.band,
        `${plural(r.agents.length, "agent")}${r.tieredCount > 0 ? ` (${r.tieredCount} tiered)` : ""}`,
      ].filter((f): f is string => f != null && f !== "");
      out.push(facts.join(" · "));
    }
  }

  if (shelf.length > 0) {
    const loads = shelf.reduce((n, s) => n + s.loads, 0);
    const year = since ? since.slice(0, 4) : "";
    out.push("", `SETTLEMENT-ONLY${year ? ` · ${year}` : ""} · ${plural(shelf.length, "code")} · ${plural(loads, "load")}`);
    for (const s of shelf) {
      out.push(
        [
          // Same rule on the shelf: a named agency reads "name · code", an
          // unnamed one and an unknown code read as the code alone.
          ...(s.agency?.name ? [s.agency.name, s.code] : [s.code]),
          ...(s.agency ? [] : ["no agency on file"]),
          plural(s.loads, "load"),
          money(s.revenue),
          s.firstPeriod ? `first paid ${s.firstPeriod}` : null,
        ]
          .filter((f): f is string => f != null)
          .join(" · "),
      );
    }
    out.push("These never enter the ladder, the tiers or the Foreman.");
  }

  if (rows.some((r) => r.partialRpm)) {
    out.push("", "* a load with no deadhead logged counted loaded miles only.");
  }
  return out.join("\n");
};
