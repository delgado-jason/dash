import type { Load } from "@/types/load";
import type { Agent } from "@/types/agent";
import { loadRevenue } from "./loads";

// Agent achievements, tallied over calendar-quarter leaderboards derived from
// delivered loads. The board (starburst) is more inclusive than the podium
// (trophies): you make the board more easily than you win the quarter.
export interface AgentHonors {
  board: number; // quarters finished top-5 (2+ loads)
  gold: number; // quarters finished #1 (3+ loads)
  silver: number; // quarters finished #2 (3+ loads)
}

// Calendar-quarter key for a delivered load's date, e.g. "2026-Q3".
export const quarterKey = (dateStr: string): string => {
  const d = new Date(String(dateStr).slice(0, 10) + "T00:00:00Z");
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
};

interface QAgg {
  revenue: number;
  loads: number;
}

// Delivered loads → quarter → agent → { revenue, loads }.
const byQuarterAgent = (loads: Load[]): Map<string, Map<string, QAgg>> => {
  const out = new Map<string, Map<string, QAgg>>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.delivery_date || !l.agent_id) continue;
    const q = quarterKey(l.delivery_date);
    let agents = out.get(q);
    if (!agents) {
      agents = new Map();
      out.set(q, agents);
    }
    const cur = agents.get(l.agent_id) ?? { revenue: 0, loads: 0 };
    cur.revenue += loadRevenue(l);
    cur.loads += 1;
    agents.set(l.agent_id, cur);
  }
  return out;
};

// Revenue desc, then agent_id asc so ties resolve deterministically.
const rankByRevenue = (entries: [string, QAgg][]): [string, QAgg][] =>
  [...entries].sort(
    (a, b) => b[1].revenue - a[1].revenue || a[0].localeCompare(b[0]),
  );

export const computeHonors = (
  loads: Load[],
  now: Date,
): Map<string, AgentHonors> => {
  const honors = new Map<string, AgentHonors>();
  const currentQ = quarterKey(now.toISOString());
  const bump = (agentId: string, key: keyof AgentHonors) => {
    const h = honors.get(agentId) ?? { board: 0, gold: 0, silver: 0 };
    h[key] += 1;
    honors.set(agentId, h);
  };

  for (const [quarter, agents] of byQuarterAgent(loads)) {
    // A quarter is only official once it has ended — the in-progress quarter
    // (and any future-dated data) doesn't count toward awards.
    if (quarter >= currentQ) continue;
    const entries = [...agents.entries()];
    // Board: 2+ loads, top 5 by revenue.
    const board = rankByRevenue(entries.filter(([, a]) => a.loads >= 2)).slice(
      0,
      5,
    );
    for (const [agentId] of board) bump(agentId, "board");
    // Podium: 3+ loads, #1 gold, #2 silver.
    const podium = rankByRevenue(entries.filter(([, a]) => a.loads >= 3));
    if (podium[0]) bump(podium[0][0], "gold");
    if (podium[1]) bump(podium[1][0], "silver");
  }
  return honors;
};

// Career rank from the honors record. This replaces the raw ×counts on the
// card; the full board/gold/silver breakdown lives in the detail trophy case.
export type PrestigeTier =
  | "rookie"
  | "contender"
  | "all-star"
  | "champion"
  | "legend";

export const agentPrestige = (h?: AgentHonors): PrestigeTier => {
  if (!h || h.board === 0) return "rookie";
  if (h.gold >= 8) return "legend";
  if (h.gold >= 3) return "champion";
  if (h.gold >= 1 || h.silver >= 1) return "all-star";
  return "contender";
};

// One agent's quarter-by-quarter leaderboard record (oldest first) for the
// detail-page trophy case. `result` is their finish that quarter.
export interface SeasonEntry {
  quarter: string; // "2026-Q3"
  result: "gold" | "silver" | "board" | "ran";
  revenue: number;
  loads: number;
}

export const agentSeasonLog = (
  loads: Load[],
  agentId: string,
  now: Date,
): SeasonEntry[] => {
  const out: SeasonEntry[] = [];
  const currentQ = quarterKey(now.toISOString());
  for (const [quarter, agents] of byQuarterAgent(loads)) {
    if (quarter >= currentQ) continue; // completed quarters only
    const mine = agents.get(agentId);
    if (!mine) continue;
    const entries = [...agents.entries()];
    const podium = rankByRevenue(entries.filter(([, a]) => a.loads >= 3));
    const board = rankByRevenue(entries.filter(([, a]) => a.loads >= 2))
      .slice(0, 5)
      .map(([id]) => id);
    let result: SeasonEntry["result"] = "ran";
    if (podium[0]?.[0] === agentId) result = "gold";
    else if (podium[1]?.[0] === agentId) result = "silver";
    else if (board.includes(agentId)) result = "board";
    out.push({ quarter, result, revenue: mine.revenue, loads: mine.loads });
  }
  out.sort((a, b) => a.quarter.localeCompare(b.quarter));
  return out;
};

// The agent's provisional standing in the CURRENT (in-progress) quarter — shown
// as a live, not-yet-official figure. null when they've run nothing this
// quarter. `boardRank` is their position in the 2+-load board race.
export interface LiveStanding {
  quarter: string;
  result: "gold" | "silver" | "board" | "ran";
  boardRank: number | null;
  loads: number;
  revenue: number;
}

// Every agent's provisional standing this quarter, in one pass (for the roster).
export const currentQuarterStandings = (
  loads: Load[],
  now: Date,
): Map<string, LiveStanding> => {
  const currentQ = quarterKey(now.toISOString());
  const out = new Map<string, LiveStanding>();
  const agents = byQuarterAgent(loads).get(currentQ);
  if (!agents) return out;

  const entries = [...agents.entries()];
  const boardRanked = rankByRevenue(entries.filter(([, a]) => a.loads >= 2));
  const podium = rankByRevenue(entries.filter(([, a]) => a.loads >= 3));

  for (const [agentId, agg] of entries) {
    const idx = boardRanked.findIndex(([id]) => id === agentId);
    let result: LiveStanding["result"] = "ran";
    if (podium[0]?.[0] === agentId) result = "gold";
    else if (podium[1]?.[0] === agentId) result = "silver";
    else if (idx >= 0 && idx < 5) result = "board";
    out.set(agentId, {
      quarter: currentQ,
      result,
      boardRank: idx >= 0 ? idx + 1 : null,
      loads: agg.loads,
      revenue: agg.revenue,
    });
  }
  return out;
};

export const currentQuarterStanding = (
  loads: Load[],
  agentId: string,
  now: Date,
): LiveStanding | null =>
  currentQuarterStandings(loads, now).get(agentId) ?? null;

// ---- per-agent card stats ----

export interface AgentStat {
  loadCount: number; // non-cancelled loads
  revenue: number; // delivered gross
  lastWorked: string | null; // 'YYYY-MM-DD' of the latest delivery
}

export const perAgentStats = (loads: Load[]): Map<string, AgentStat> => {
  const out = new Map<string, AgentStat>();
  for (const l of loads) {
    if (!l.agent_id) continue;
    const s = out.get(l.agent_id) ?? {
      loadCount: 0,
      revenue: 0,
      lastWorked: null,
    };
    if (l.load_status !== "cancelled") s.loadCount += 1;
    if (l.load_status === "delivered") {
      s.revenue += loadRevenue(l);
      if (l.delivery_date) {
        const dd = l.delivery_date.slice(0, 10);
        if (!s.lastWorked || dd > s.lastWorked) s.lastWorked = dd;
      }
    }
    out.set(l.agent_id, s);
  }
  return out;
};

// ---- page KPIs ----

export interface RosterKpis {
  total: number;
  rated: number;
  callFirst: number; // rating 5
  avoid: number; // rating 1 or 2
  topEarner: { agentId: string; revenue: number } | null; // last 90 days
  activeCount: number; // agents with a non-cancelled load picked up in last 90d
}

export const rosterKpis = (
  agents: Agent[],
  loads: Load[],
  now: Date,
): RosterKpis => {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const rev90 = new Map<string, number>();
  const active = new Set<string>();
  for (const l of loads) {
    if (!l.agent_id) continue;
    const pd = l.pickup_date?.slice(0, 10);
    if (pd && pd >= cutoffStr && l.load_status !== "cancelled")
      active.add(l.agent_id);
    if (
      l.load_status === "delivered" &&
      l.delivery_date &&
      l.delivery_date.slice(0, 10) >= cutoffStr
    ) {
      rev90.set(l.agent_id, (rev90.get(l.agent_id) ?? 0) + loadRevenue(l));
    }
  }

  let topEarner: RosterKpis["topEarner"] = null;
  for (const [agentId, revenue] of rev90) {
    if (!topEarner || revenue > topEarner.revenue)
      topEarner = { agentId, revenue };
  }

  return {
    total: agents.length,
    rated: agents.filter((a) => a.rating != null).length,
    callFirst: agents.filter((a) => a.rating === 5).length,
    avoid: agents.filter((a) => a.rating === 1 || a.rating === 2).length,
    topEarner,
    activeCount: active.size,
  };
};
