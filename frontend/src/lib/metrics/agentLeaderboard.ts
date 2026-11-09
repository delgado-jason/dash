import type { Load } from "@/types/load";
import { loadRevenue } from "./loads";
import { isDelivered, isNeverRevenue } from "./status";

// Per-agent card stats — the totals an agent's card prints beside their name.
//
// This file used to carry a whole quarterly-honours apparatus as well: medals
// per calendar quarter, a rookie → contender → all-star → champion → legend
// prestige ladder, season logs and podium standings. The Redesign's phase B
// (v1.262.0) deleted the components that drew them, but the engine survived the
// deletion and sat here computing nothing for anyone — about 90% of the file,
// reachable from no screen, carrying two contradictory podium rules that could
// never disagree because neither one ran. It came out with the Agents tab
// (v1.266.0). The desk ranking that replaced it lives in metrics/leaderboard.ts.
//
// GROSS, like every agent surface: agents are a market-value lens.

export interface AgentStat {
  loadCount: number; // non-cancelled loads
  revenue: number; // delivered gross
  lastWorked: string | null; // 'YYYY-MM-DD' of the latest delivery
}

// LIFETIME — no window. The agent card shows a career total beside the name;
// the windowed figures all come off the leaderboard and the scorecard.
export const perAgentStats = (loads: Load[]): Map<string, AgentStat> => {
  const out = new Map<string, AgentStat>();
  for (const l of loads) {
    if (!l.agent_id) continue;
    const s = out.get(l.agent_id) ?? {
      loadCount: 0,
      revenue: 0,
      lastWorked: null,
    };
    if (!isNeverRevenue(l)) s.loadCount += 1;
    if (isDelivered(l)) {
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
