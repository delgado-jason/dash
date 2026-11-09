// THE SHAPE OF THE AGENT BOOK — what the dashboard's Agents tab reads.
//
// One window for the whole tab (the Redesign, phase C, call 1): these rows are
// scoped with the LEADERBOARD'S own range and the leaderboard's own date basis
// (delivered, dated on PICKUP — when the desk actually gave you the freight),
// so every figure on the tab and every row of the board beneath it describe the
// same loads. Before this the tab ran three clocks at once: the board on 12
// months of pickups, the concentration card on 90 days of deliveries, and the
// scorecard behind the scatter on no window at all.
//
// Two questions this book answers that nothing else did:
//   • how much of the money came from desks you used ONCE — the real shape of a
//     spot book, where "concentration" was never the risk;
//   • which of the desks that DID come back have gone quiet.
//
// GROSS throughout: agents are a market-value lens (the house rule).
import type { Load } from "@/types/load";
import { deliveredInWindow, type AgencyRange } from "@/lib/agencies/agencyMetrics";
import { daysBetweenKeys, keyOf, localDayKey } from "@/lib/relationships/dayKeys";
import { loadRevenue } from "./loads";
import { median } from "./stats";

// A repeat desk with no freight in this long is worth a call. Not a grading
// rule — a display band for the "gone quiet" list, deliberately out of the
// constants contract.
export const QUIET_DAYS = 60;

// The minimum loads that make a desk a RELATIONSHIP rather than a one-off. A
// desk you used once and never again has not "gone cold" — it never warmed.
export const REPEAT_AT = 2;

export interface AgentBookRow {
  agentId: string;
  loads: number;
  gross: number;
  medianRpm: number | null; // gross ÷ loaded mile, the typical load; null = no miles logged
  lastWorked: string | null; // 'YYYY-MM-DD', the latest PICKUP in the window
  daysSince: number | null;
}

export interface BookBucket {
  desks: number;
  gross: number;
  share: number; // 0..1 of the window's attributed gross
}

export interface BookShape {
  desks: number; // desks that gave you freight in the window
  gross: number; // attributed gross in the window
  once: BookBucket; // ran exactly one load
  twice: BookBucket; // ran exactly two
  repeat: BookBucket; // ran three or more
  repeatDesks: number; // REPEAT_AT or more — the relationships
}

// One row per agent with a delivered load in the window, richest first.
export const agentBook = (
  loads: Load[],
  range: AgencyRange,
  now: Date,
): AgentBookRow[] => {
  const today = localDayKey(now);
  const byAgent = new Map<string, Load[]>();
  for (const l of deliveredInWindow(loads, range)) {
    if (!l.agent_id) continue; // an unattributed load belongs to no desk
    const bucket = byAgent.get(l.agent_id);
    if (bucket) bucket.push(l);
    else byAgent.set(l.agent_id, [l]);
  }

  const rows: AgentBookRow[] = [];
  for (const [agentId, mine] of byAgent) {
    const days = mine
      .map((l) => (l.pickup_date ? keyOf(l.pickup_date) : null))
      .filter((d): d is string => !!d)
      .sort();
    const lastWorked = days.length ? days[days.length - 1] : null;
    const since = lastWorked ? daysBetweenKeys(lastWorked, today) : null;
    rows.push({
      agentId,
      loads: mine.length,
      gross: mine.reduce((s, l) => s + loadRevenue(l), 0),
      medianRpm: median(
        mine
          .map((l) => {
            const miles = Number(l.loaded_miles);
            return miles > 0 ? loadRevenue(l) / miles : null;
          })
          .filter((r): r is number => r != null),
      ),
      lastWorked,
      // Clamped at 0: a pickup dated later today is not "-1 days quiet".
      daysSince: since != null && Number.isFinite(since) ? Math.max(0, since) : null,
    });
  }
  return rows.sort((a, b) => b.gross - a.gross);
};

const bucketOf = (rows: AgentBookRow[], total: number): BookBucket => {
  const gross = rows.reduce((s, r) => s + r.gross, 0);
  return { desks: rows.length, gross, share: total > 0 ? gross / total : 0 };
};

// How the book splits between desks you used once, twice, and three or more
// times. On a spot book this is the fact that matters: concentration asks
// whether one desk owns too much of you, and the answer here has always been
// no — the money is scattered across desks that never came back.
export const bookShape = (rows: AgentBookRow[]): BookShape => {
  const gross = rows.reduce((s, r) => s + r.gross, 0);
  return {
    desks: rows.length,
    gross,
    once: bucketOf(rows.filter((r) => r.loads === 1), gross),
    twice: bucketOf(rows.filter((r) => r.loads === 2), gross),
    repeat: bucketOf(rows.filter((r) => r.loads >= 3), gross),
    repeatDesks: rows.filter((r) => r.loads >= REPEAT_AT).length,
  };
};

// The desks that came back and then stopped, richest first — the money at risk.
// A one-load desk is never listed: it is a stranger, not a lapsed relationship,
// and on this book there are forty-odd of them.
export const goneQuiet = (
  rows: AgentBookRow[],
  quietDays = QUIET_DAYS,
  minLoads = REPEAT_AT,
): AgentBookRow[] =>
  rows
    .filter(
      (r) => r.loads >= minLoads && r.daysSince != null && r.daysSince >= quietDays,
    )
    .sort((a, b) => b.gross - a.gross);

// Who you have been working with, most recent first — the active bench. Undated
// rows fall to the end rather than sorting as "today".
export const workingWith = (rows: AgentBookRow[]): AgentBookRow[] =>
  [...rows].sort(
    (a, b) => (a.daysSince ?? Infinity) - (b.daysSince ?? Infinity) || b.gross - a.gross,
  );
