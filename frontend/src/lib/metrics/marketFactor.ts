// The destination / repositioning factor for the Load Scorer: "where does this
// load leave me?" A load can pay fine yet strand you in a market you can't get a
// good load OUT of. This grades the delivery market by YOUR OWN outbound history —
// how well freight out of there has paid you, how much of it there's been, and how
// many agents source it — so a soft market reads as a reposition cost at booking
// time, not a surprise later. Everything is GROSS (market value, like agents/lanes).
import type { Load } from "@/types/load";
import type { Verdict } from "./loadScore";
import { loadRevenue } from "./loads"; // GROSS per load
import { median } from "./stats";
import { haversineMiles, cityKey, type CoordMap } from "./foreman";
import type { AgentScorecard } from "./agentScorecard";

const up = (s?: string | null): string => String(s ?? "").trim().toUpperCase();
const loadedRpm = (l: Load): number | null => {
  const miles = Number(l.loaded_miles);
  return miles > 0 ? loadRevenue(l) / miles : null;
};

// Below this many loads OUT of a market, we can't judge it — "thin," not graded.
// Set to 2 so a single load is thin but a 2-load market still surfaces its signal
// (the UI always shows the load count, so the thinness stays visible/honest). It
// firms up as more loads log. STRONG still needs real volume (STRONG_MIN_LOADS).
export const THIN_OUT = 2;
const STRONG_MULT = 1.05; // pays ≥5% over your overall norm → strong
const SOFT_MULT = 0.85; // pays ≤15% under → soft
const STRONG_MIN_LOADS = 4; // …and enough volume to be reliable

export type MarketGrade = "strong" | "fair" | "soft" | "thin";

export interface OutboundMarket {
  state: string;
  loadsOut: number; // delivered loads that ORIGINATED here
  medianRpm: number | null; // gross ÷ loaded mile, out of here
  agents: number; // distinct agents sourcing here
  grade: MarketGrade;
}

// Your outbound strength per origin state, from delivered loads. Grade is relative
// to your OWN overall outbound rate, so it means "good/soft FOR ME," not a market
// absolute.
export const outboundStrength = (loads: Load[]): Map<string, OutboundMarket> => {
  const delivered = loads.filter((l) => l.load_status === "delivered");
  const overall = median(
    delivered.map(loadedRpm).filter((r): r is number => r != null),
  );

  const byState = new Map<string, Load[]>();
  for (const l of delivered) {
    const s = up(l.origin_state);
    if (!s) continue;
    (byState.get(s) ?? byState.set(s, []).get(s)!).push(l);
  }

  const out = new Map<string, OutboundMarket>();
  for (const [state, ls] of byState) {
    const rpms = ls.map(loadedRpm).filter((r): r is number => r != null);
    const medianRpm = rpms.length ? median(rpms) : null;
    const agents = new Set(ls.map((l) => l.agent_id).filter(Boolean)).size;
    const loadsOut = ls.length;

    let grade: MarketGrade;
    if (loadsOut < THIN_OUT || medianRpm == null || overall == null) {
      grade = "thin";
    } else if (medianRpm >= overall * STRONG_MULT && loadsOut >= STRONG_MIN_LOADS) {
      grade = "strong";
    } else if (medianRpm <= overall * SOFT_MULT) {
      grade = "soft";
    } else {
      grade = "fair";
    }
    out.set(state, { state, loadsOut, medianRpm, agents, grade });
  }
  return out;
};

export interface NearestStrong {
  city: string;
  state: string;
  miles: number;
}

export interface DestinationFactor {
  state: string;
  market: OutboundMarket | null; // the delivery state's outbound (null = never loaded out of here)
  strongMarkets: OutboundMarket[]; // your strongest outbound markets, for contrast
  nearestStrong: NearestStrong | null; // nearest strong-market origin you've actually loaded from
}

const byRateThenVolume = (a: OutboundMarket, b: OutboundMarket): number =>
  (b.medianRpm ?? 0) - (a.medianRpm ?? 0) || b.loadsOut - a.loadsOut;

// The delivery market's grade, your strong markets for contrast, and — when we
// have a trusted coordinate for the delivery city — the nearest strong-market
// origin you've actually loaded from, so "this strands you" comes with a distance.
export const destinationFactor = (
  loads: Load[],
  delivery: { city: string; state: string },
  coords: CoordMap,
): DestinationFactor => {
  const strengths = outboundStrength(loads);
  const state = up(delivery.state);
  const market = strengths.get(state) ?? null;
  const strongMarkets = [...strengths.values()]
    .filter((m) => m.grade === "strong")
    .sort(byRateThenVolume);

  let nearestStrong: NearestStrong | null = null;
  const deliveryCoord = coords.get(cityKey(delivery.city, delivery.state));
  if (deliveryCoord && strongMarkets.length) {
    const strongStates = new Set(strongMarkets.map((m) => m.state));
    const seen = new Set<string>();
    for (const l of loads) {
      if (l.load_status !== "delivered" || !strongStates.has(up(l.origin_state))) continue;
      const key = cityKey(l.origin_city, l.origin_state);
      if (seen.has(key)) continue;
      seen.add(key);
      const c = coords.get(key);
      if (!c) continue;
      const miles = haversineMiles(deliveryCoord, c);
      if (!nearestStrong || miles < nearestStrong.miles)
        nearestStrong = { city: l.origin_city, state: l.origin_state, miles };
    }
  }

  return { state, market, strongMarkets: strongMarkets.slice(0, 3), nearestStrong };
};

// ---- the synthesized recommendation ----
export type CallTone = "good" | "caution" | "bad";
export interface TheCall {
  tone: CallTone;
  text: string;
}

const isKeeper = (a: AgentScorecard | null | undefined): boolean =>
  !!a && a.loadCount >= 3 && a.moneyLostLoads === 0;

// Weigh the rate verdict, the destination market, and the agent into one honest
// bottom-line. The rate verdict leads (it's the money); the destination and agent
// tip a marginal load or add a caution — they never rescue a money-loser on their
// own.
export const theCall = (
  verdict: Verdict | null,
  dest: DestinationFactor | null,
  agent: AgentScorecard | null | undefined,
  _isNewAgent: boolean,
): TheCall | null => {
  if (!verdict) return null;
  const grade = dest?.market?.grade ?? null;
  const keeper = isKeeper(agent);
  const dist = dest?.nearestStrong
    ? ` (nearest strong freight ~${Math.round(dest.nearestStrong.miles)} mi)`
    : "";

  if (verdict === "pass") {
    return {
      tone: "bad",
      text: `Loses money after the deadhead — pass unless ${keeper ? "the relationship" : "a strong backhaul"} makes it strategic.`,
    };
  }

  const clears = verdict === "steal" ? "Clears your strong tier" : "Clears your target";

  if (verdict === "take" || verdict === "steal") {
    if (grade === "soft")
      return {
        tone: "caution",
        text: `${clears}, but it strands you in a soft outbound market${dist}. Take it and plan your reposition${keeper ? ", or lean on the agent for the backhaul" : ""}.`,
      };
    if (grade === "strong")
      return {
        tone: "good",
        text: `Good load — ${clears.toLowerCase()} and drops you into a strong outbound market${keeper ? ", from a keeper agent" : ""}. Take it.`,
      };
    return { tone: "good", text: `${clears}. Take it.` };
  }

  // meh — the deadhead dragged it; the destination + agent decide if it's worth it
  if (grade === "strong")
    return {
      tone: "caution",
      text: "Only fair on rate — the deadhead's the drag — but it sets you up in a strong market. Worth it; counter toward SOLID.",
    };
  if (keeper)
    return {
      tone: "caution",
      text: "Only fair on rate, but the agent's a keeper. Counter toward SOLID — the relationship's worth it.",
    };
  if (grade === "soft")
    return {
      tone: "caution",
      text: `Only fair on rate, and it strands you in a soft market${dist}. Counter up hard, or let it go.`,
    };
  return { tone: "caution", text: "Only fair on rate. Counter up, or let it go." };
};
