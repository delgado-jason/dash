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
// Type-only (erased at build, so no import cycle): the load sequence the IN
// half grades lives with the ledger that builds it.
import type { SequencedLoad } from "./marketLedger";

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
//
// `keyFor` is how a load is bucketed — the origin STATE by default, which is what
// the Load Scorer asks for. The Lanes ledger passes a freight-region key at region
// grain so the region rows are graded by this same arithmetic on the region's own
// loads, rather than by averaging state grades (which would be a second rule).
export const outboundStrength = (
  loads: Load[],
  keyFor: (l: Load) => string = (l) => up(l.origin_state),
): Map<string, OutboundMarket> => {
  const delivered = loads.filter((l) => l.load_status === "delivered");
  const overall = median(
    delivered.map(loadedRpm).filter((r): r is number => r != null),
  );

  const byState = new Map<string, Load[]>();
  for (const l of delivered) {
    const s = keyFor(l);
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

// ---- the IN half: what a delivery there LEAVES you ----
//
// The other side of the same question. `outboundStrength` grades the freight a
// market gives you; this grades the cost of getting empty in it — read off your
// own load sequence (the next load's deadhead and how long you waited for it),
// relative to YOUR median reload, exactly as the OUT half is relative to your
// own median rate. Lives here beside it so Score a Load can read one module.
// Calibrated on the real book 2026-09-16 (median reload 162 mi over 55 logged
// reloads): the sheet's 70 % / 150 % turned nearly every market "fair". At
// 85 % / 125 % PA and OH read strong, TX/VA/KY/MI soft, NC and IN fair —
// a spread a dispatcher can act on.
export const IN_STRONG_MULT = 0.85; // reload ≤ 85% of your median → cheap to leave
export const IN_SOFT_MULT = 1.25; // ≥ 125% of it → expensive
export const IN_STRONG_MIN = 3; // …and enough deliveries to mean it
export const IN_IDLE_STRONG = 2; // days waiting for the next pickup
export const IN_IDLE_SOFT = 3;

export interface InboundMarket {
  state: string;
  // Delivered loads that ENDED here AND carry a pickup date, i.e. the legs the
  // sequence can actually read a reload off. One delivery set for the grade and
  // for the ledger row beside it — an undated load is counted in neither.
  deliveries: number;
  reloadMilesMedian: number | null; // typical empty run to the next pickup
  idleDaysAvg: number | null; // days between delivery and the next pickup
  nextRpmMedian: number | null; // what the load you found here paid
  grade: MarketGrade;
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

// YOUR median reload — the yardstick every market is judged against. It is
// computed over the WHOLE sequence (every delivered load, all time), never over
// the window being displayed: a market's grade answers "how does this stop
// compare to my book", so flipping 12 months → this year → all time must not
// move the yardstick under a market whose own numbers didn't change.
export const reloadYardstick = (seq: SequencedLoad[]): number | null =>
  median(
    seq.map((s) => s.next?.deadheadMiles).filter((m): m is number => m != null),
  );

// A 0 deadhead is "not logged", never free — `sequenceLoads` already nulls it,
// so every figure here is over the legs that actually carry a number.
//
// `yardstick` is required and passed in on purpose (`reloadYardstick` builds
// it): when it was derived from `seq` inside, a caller handing in one window's
// legs silently graded that window against itself.
export const inboundStrength = (
  seq: SequencedLoad[],
  yardstick: number | null,
  keyFor: (s: SequencedLoad) => string = (s) => up(s.load.destination_state),
): Map<string, InboundMarket> => {
  const yourMedian = yardstick;

  const byState = new Map<string, SequencedLoad[]>();
  for (const s of seq) {
    const k = keyFor(s);
    if (!k) continue;
    (byState.get(k) ?? byState.set(k, []).get(k)!).push(s);
  }

  const out = new Map<string, InboundMarket>();
  for (const [state, group] of byState) {
    const reloads = group
      .map((s) => s.next?.deadheadMiles)
      .filter((m): m is number => m != null);
    // A week off doesn't grade a market: home entries leave the idle average.
    const idles = group
      .filter((s) => !s.home)
      .map((s) => s.next?.idleDays)
      .filter((d): d is number => d != null);
    const rpms = group
      .map((s) => s.next?.rpm)
      .filter((r): r is number => r != null);

    const reloadMilesMedian = median(reloads);
    const idleDaysAvg = mean(idles);

    let grade: MarketGrade;
    if (group.length < 2 || reloadMilesMedian == null) {
      grade = "thin";
    } else if (
      yourMedian != null &&
      reloadMilesMedian <= yourMedian * IN_STRONG_MULT &&
      idleDaysAvg != null &&
      idleDaysAvg <= IN_IDLE_STRONG &&
      group.length >= IN_STRONG_MIN
    ) {
      grade = "strong";
    } else if (
      (yourMedian != null && reloadMilesMedian >= yourMedian * IN_SOFT_MULT) ||
      (idleDaysAvg != null && idleDaysAvg >= IN_IDLE_SOFT)
    ) {
      grade = "soft";
    } else {
      grade = "fair";
    }

    out.set(state, {
      state,
      deliveries: group.length,
      reloadMilesMedian,
      idleDaysAvg,
      nextRpmMedian: median(rpms),
      grade,
    });
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
  // Kept in the signature for the Scorer's call site (and so the flag is there
  // when the copy starts using it); deliberately unread today.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
