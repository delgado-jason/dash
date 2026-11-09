// THE AGENTS LEADERBOARD — the book ranked by DESK over the trailing 12 months
// (Cockpit PR 1, brief B). Nothing here is a new rule:
//
//   • the rate is `allInOver` — all-in gross ÷ (loaded + deadhead) — at the
//     desk altitude through `agencyRollup`, the very rollup the Agencies page
//     draws; the person's own Tiers rate is the same arithmetic one level down;
//   • the gate is ESTABLISHED_AT (three delivered loads, lifetime, summed over
//     the desk's people) from tierSuggestion — one gate, never a second;
//   • the grade is the booking ladder's bands through `rpmGrade`.
//
// A blank is never a zero: no miles → rate null (the UI prints "no miles
// logged"), no loaded share, no $/day.
//
// agencyRollup only knows real agencies, keyed on the LOAD's agency. A person
// with no agency (a prospect on a posting code, a one-off) would vanish from
// it, so those desks are built HERE as stand-in agencies named by the posting
// code and fed through the same rollup — no second copy of the arithmetic.
import type { Agency } from "@/types/agency";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import type { MeaningfulContactLike } from "@/lib/relationships/meaningfulContact";
import {
  agencyRange,
  agencyRollup,
  deliveredInWindow,
  WINDOW_LABEL,
  type AgencyAgentRow,
  type AgencyRow,
  type AgencyWindow,
} from "@/lib/agencies/agencyMetrics";
import { codeOf } from "@/lib/agencies/codeOf";
import { otherCodes } from "@/lib/agencies/otherCodes";
import { allInOver } from "@/lib/relationships/agentRpm";
import { ESTABLISHED_AT } from "@/lib/relationships/tierSuggestion";
import { rpmGrade, type Grade } from "@/lib/metrics/playerCard";
import { isSpecializedLoadType } from "@/lib/dimensions";
import { detentionCollected, detentionOwed } from "@/lib/detention";
import { loadGross } from "@/lib/metrics/rateTargets";

export type FreightClass = "Standard" | "Specialized";
export const FREIGHT_CLASSES: readonly FreightClass[] = ["Specialized", "Standard"];

export const classOfLoad = (l: Load): FreightClass =>
  isSpecializedLoadType(l.load_type) ? "Specialized" : "Standard";

export const GRADE_WORD: Record<Grade, string> = {
  strong: "STRONG",
  target: "TARGET",
  minimum: "ABOVE FLOOR",
  below: "UNDER WALK-AWAY",
};

export type SortKey = "rate" | "gross" | "share" | "perDay" | "loads";

export interface DeskRow {
  key: string; // agency_id, or `code:XXX` for a desk built from a posting code
  name: string;
  codes: string[]; // the desk's posting codes, its own first
  people: string; // last names joined
  peopleRows: AgencyAgentRow[];
  desk: AgencyRow; // the rollup row this desk stands on
  windowed: Load[]; // the delivered loads in the window — class split reads these
  loads: number;
  gross: number;
  share: number; // desk gross ÷ gross of every attributed load in the window
  allInRpm: number | null; // null = no miles logged
  partialRpm: boolean;
  perDay: number | null;
  loadedShare: number | null; // loaded ÷ (loaded + deadhead); null = no miles
  detention: { owed: number; paid: number };
  lifetime: number; // Σ the people's lifetime delivered loads
  graded: boolean; // lifetime ≥ ESTABLISHED_AT
  grade: Grade | null;
  gradeWord: string;
  rating: string | null;
  lastLoad: string | null;
}

export interface BestOfClass {
  desk: DeskRow;
  rpm: number;
  loads: number;
}

export interface Leaderboard {
  rows: DeskRow[]; // default order: graded by rate, then ungraded by rate
  // The window these rows were read over. The dashboard's Agents tab drives it
  // and every panel beside the board reads the same one, so the tab can no
  // longer print three different answers to "how much did this desk pay".
  window: AgencyWindow;
  rangeLabel: string; // "12 months" / "90 days" / "All time"
  unattributed: { loads: number; gross: number };
  totals: {
    loads: number;
    gross: number;
    driven: number;
    allInRpm: number | null;
    desks: number;
    agents: number;
    top3Share: number | null;
  };
  best: Record<FreightClass, BestOfClass | null>;
}

export interface LeaderboardInput {
  agencies: readonly Agency[];
  agents: readonly Agent[];
  loads: Load[];
  contacts: MeaningfulContactLike[];
  ladder: RateLadder | null | undefined;
  now: Date;
  window?: AgencyWindow; // default "12m" — the board's long-standing window
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};

const stand = (code: string): string => `code:${code}`;

// ----------------------------------------------------------- ordering

const rateCmp = (a: DeskRow, b: DeskRow): number => {
  if (a.allInRpm == null && b.allInRpm != null) return 1;
  if (a.allInRpm != null && b.allInRpm == null) return -1;
  if (a.allInRpm != null && b.allInRpm != null && a.allInRpm !== b.allInRpm) {
    return b.allInRpm - a.allInRpm;
  }
  return b.gross - a.gross || a.name.localeCompare(b.name);
};

const KEY_OF: Record<Exclude<SortKey, "rate">, (r: DeskRow) => number | null> = {
  gross: (r) => r.gross,
  share: (r) => r.share,
  perDay: (r) => r.perDay,
  loads: (r) => r.loads,
};

// Sort a list of desks by one column, biggest first, a blank always last and a
// tie broken by gross. Pure — returns a new array.
export const sortBy = (rows: readonly DeskRow[], key: SortKey): DeskRow[] => {
  const out = [...rows];
  if (key === "rate") return out.sort(rateCmp);
  const read = KEY_OF[key];
  return out.sort((a, b) => {
    const x = read(a);
    const y = read(b);
    if (x == null && y != null) return 1;
    if (x != null && y == null) return -1;
    if (x != null && y != null && x !== y) return y - x;
    return b.gross - a.gross || a.name.localeCompare(b.name);
  });
};

// Graded desks first (by rate), then the ungraded (by rate).
export const order = (rows: readonly DeskRow[]): DeskRow[] => [
  ...sortBy(
    rows.filter((r) => r.graded),
    "rate",
  ),
  ...sortBy(
    rows.filter((r) => !r.graded),
    "rate",
  ),
];

// -------------------------------------------------- best desk by class

// For each freight class: the GRADED desk with the highest all-in rate over its
// loads OF THAT CLASS only, and only when it ran at least ESTABLISHED_AT of
// them in the window. null = nobody qualifies; the UI says so.
export const bestByClass = (
  rows: readonly DeskRow[],
): Record<FreightClass, BestOfClass | null> => {
  const out: Record<FreightClass, BestOfClass | null> = { Standard: null, Specialized: null };
  for (const cls of FREIGHT_CLASSES) {
    let best: BestOfClass | null = null;
    for (const desk of rows) {
      if (!desk.graded) continue;
      const mine = desk.windowed.filter((l) => classOfLoad(l) === cls);
      if (mine.length < ESTABLISHED_AT) continue;
      const { rpm, gross } = allInOver(mine);
      if (rpm == null) continue;
      if (
        best == null ||
        rpm > best.rpm ||
        (rpm === best.rpm && gross > allInOver(best.desk.windowed.filter((l) => classOfLoad(l) === cls)).gross)
      ) {
        best = { desk, rpm, loads: mine.length };
      }
    }
    out[cls] = best;
  }
  return out;
};

// ------------------------------------------------------------ the build

export const buildLeaderboard = (input: LeaderboardInput): Leaderboard => {
  const { agencies, agents, contacts, ladder, now } = input;
  const window = input.window ?? "12m";
  const range = agencyRange(window, now);

  const realIds = new Set(agencies.map((a) => a.agency_id));
  const agentById = new Map(agents.map((a) => [a.agent_id, a]));

  // Stand-in desks: one per posting code, for people and loads no real agency
  // holds. The load's own agency wins when it is a real one.
  const standIns = new Map<string, Agency>();
  const standIn = (code: string): string => {
    if (!standIns.has(code)) {
      standIns.set(code, {
        agency_id: stand(code),
        user_id: "",
        agency_code: code,
        name: null,
        posting_codes: [code],
        created_at: "",
        updated_at: "",
      });
    }
    return stand(code);
  };

  const agentsIn: Agent[] = agents.map((a) => {
    if (a.agency_id != null && realIds.has(a.agency_id)) return a;
    const code = codeOf(a)?.code;
    return code ? { ...a, agency_id: standIn(code) } : a;
  });

  let unattributed = { loads: 0, gross: 0 };
  const loadsIn: Load[] = input.loads.map((l) => {
    if (l.agency_id != null && realIds.has(l.agency_id)) return l;
    // No real agency on the load: its person's agency, when they have one.
    const owner = l.agent_id ? agentById.get(l.agent_id) : undefined;
    if (owner?.agency_id != null && realIds.has(owner.agency_id)) {
      return { ...l, agency_id: owner.agency_id };
    }
    const code =
      codeOf(l.agent_id ? agentById.get(l.agent_id) : null)?.code ?? clean(l.posting_code);
    return code ? { ...l, agency_id: standIn(code) } : l;
  });

  const rollup = agencyRollup(
    [...agencies, ...standIns.values()],
    agentsIn,
    loadsIn,
    contacts,
    ladder,
    "12m",
    now,
  );

  const byAgency = new Map<string, Load[]>();
  for (const l of loadsIn) {
    if (!l.agency_id) continue;
    (byAgency.get(l.agency_id) ?? byAgency.set(l.agency_id, []).get(l.agency_id)!).push(l);
  }

  // Loads that no desk holds: delivered in the window, but with no agency and
  // no code to build a desk from.
  const held = new Set([...agencies.map((a) => a.agency_id), ...[...standIns.keys()].map(stand)]);
  for (const l of deliveredInWindow(
    loadsIn.filter((x) => !x.agency_id || !held.has(x.agency_id)),
    range,
  )) {
    unattributed = { loads: unattributed.loads + 1, gross: unattributed.gross + loadGross(l) };
  }

  const live = rollup.filter((r) => r.delivered > 0);
  const totalGross = live.reduce((s, r) => s + r.gross, 0);
  const usable = ladder != null && ladder.walkAway != null ? ladder : null;

  const rows: DeskRow[] = live.map((r) => {
    const windowed = deliveredInWindow(byAgency.get(r.agency.agency_id) ?? [], range);
    let loaded = 0;
    let all = 0;
    let owed = 0;
    let paid = 0;
    for (const l of windowed) {
      loaded += Number(l.loaded_miles) || 0;
      all += (Number(l.loaded_miles) || 0) + (l.deadhead_miles == null ? 0 : Number(l.deadhead_miles) || 0);
      if (detentionOwed(l)) owed++;
      if (detentionCollected(l)) paid++;
    }
    const lifetime = r.agents.reduce((s, p) => s + p.delivered, 0);
    const graded = lifetime >= ESTABLISHED_AT;
    const grade = graded && usable ? rpmGrade(r.allInRpm, usable) : null;
    const ratings = r.agents
      .map((p) => p.agent.rating)
      .filter((x): x is number => x != null);
    const code = clean(r.agency.agency_code) ?? "";
    return {
      key: r.agency.agency_id,
      name: clean(r.agency.name) ?? (code || "—"),
      codes: [code, ...otherCodes(r.agency)].filter((c) => c !== ""),
      people: r.agents.map((p) => p.agent.last_name).join(", "),
      peopleRows: r.agents,
      desk: r,
      windowed,
      loads: r.delivered,
      gross: r.gross,
      share: totalGross > 0 ? r.gross / totalGross : 0,
      allInRpm: r.allInRpm,
      partialRpm: r.partialRpm,
      perDay: r.perDay,
      loadedShare: all > 0 ? loaded / all : null,
      detention: { owed, paid },
      lifetime,
      graded,
      grade,
      gradeWord: grade ? GRADE_WORD[grade] : "",
      rating:
        r.agency.rating != null
          ? String(r.agency.rating)
          : ratings.length > 0
            ? ratings.join(" · ")
            : null,
      lastLoad: r.lastLoad,
    };
  });

  const ordered = order(rows);
  const book = allInOver(rows.flatMap((r) => r.windowed));
  const driven = rows
    .flatMap((r) => r.windowed)
    .reduce(
      (s, l) =>
        s + (Number(l.loaded_miles) || 0) + (l.deadhead_miles == null ? 0 : Number(l.deadhead_miles) || 0),
      0,
    );
  const agentIds = new Set(
    rows.flatMap((r) => r.windowed.map((l) => l.agent_id)).filter((x) => !!x),
  );
  const top3 = [...rows]
    .sort((a, b) => b.gross - a.gross)
    .slice(0, 3)
    .reduce((s, r) => s + r.gross, 0);

  return {
    rows: ordered,
    window,
    rangeLabel: WINDOW_LABEL[window],
    unattributed,
    totals: {
      loads: rows.reduce((s, r) => s + r.loads, 0),
      gross: totalGross,
      driven,
      allInRpm: book.rpm,
      desks: rows.length,
      agents: agentIds.size,
      top3Share: totalGross > 0 ? top3 / totalGross : null,
    },
    best: bestByClass(ordered),
  };
};
