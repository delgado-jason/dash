// The tier tree's live scoreboard: rolling-window touch counts and the
// markets an agent has DEMONSTRABLY shipped from (their loads' origin
// cities — derived, never typed, so it can't go stale or lie).
//
// Out-days count DISTINCT DAYS with an outbound touch — four logs from one
// long Carolyn conversation read as ONE day of attention, so logging
// granularity can't saturate the number. Inbound counts every event the
// agent initiated; it's the only touch number that ever argues for a tier.
// Day keys are the ISO date already inside contacted_at (string compare —
// no timezone math, the same discipline as the monthly review window).

export interface ContactLike {
  agent_id: string;
  direction: "outbound" | "inbound";
  contacted_at: string; // ISO
}

export interface LoadLike {
  agent_id?: string | null;
  origin_city?: string | null;
  origin_state?: string | null;
}

export interface TouchCounts {
  outDays: number;
  inbound: number;
}

// One pass over every contact → per-agent counts inside [startKey, endKey].
export const touchCountsByAgent = (
  contacts: ContactLike[],
  startKey: string,
  endKey: string,
): Map<string, TouchCounts> => {
  const out = new Map<string, TouchCounts>();
  const daySets = new Map<string, Set<string>>();
  for (const c of contacts) {
    const day = c.contacted_at?.slice(0, 10);
    if (!day || day < startKey || day > endKey) continue;
    let t = out.get(c.agent_id);
    if (!t) {
      t = { outDays: 0, inbound: 0 };
      out.set(c.agent_id, t);
    }
    if (c.direction === "inbound") {
      t.inbound += 1;
    } else {
      let days = daySets.get(c.agent_id);
      if (!days) {
        days = new Set();
        daySets.set(c.agent_id, days);
      }
      days.add(day);
      t.outDays = days.size;
    }
  }
  return out;
};

export interface OriginMarket {
  city: string;
  state: string;
  n: number;
}

// One pass over every load → each agent's top origin markets by load count.
// Ties break alphabetically so the order is stable render to render.
export const originMarketsByAgent = (
  loads: LoadLike[],
  top = 3,
): Map<string, OriginMarket[]> => {
  const perAgent = new Map<string, Map<string, OriginMarket>>();
  for (const l of loads) {
    if (!l.agent_id) continue;
    const city = (l.origin_city ?? "").trim();
    const state = (l.origin_state ?? "").trim();
    if (!city || !state) continue;
    let markets = perAgent.get(l.agent_id);
    if (!markets) {
      markets = new Map();
      perAgent.set(l.agent_id, markets);
    }
    const key = `${city.toUpperCase()},${state.toUpperCase()}`;
    const cur = markets.get(key);
    if (cur) cur.n += 1;
    else markets.set(key, { city, state, n: 1 });
  }
  const ranked = new Map<string, OriginMarket[]>();
  for (const [agentId, markets] of perAgent) {
    ranked.set(
      agentId,
      [...markets.values()]
        .sort((a, b) => b.n - a.n || a.city.localeCompare(b.city))
        .slice(0, top),
    );
  }
  return ranked;
};
