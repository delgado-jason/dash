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
import type { SequencedLoad, NextLeg } from "./marketLedger";
import { isDelivered } from "./status";

const up = (s?: string | null): string => String(s ?? "").trim().toUpperCase();
const loadedRpm = (l: Load): number | null => {
  const miles = Number(l.loaded_miles);
  return miles > 0 ? loadRevenue(l) / miles : null;
};

// Below this many loads OUT of a market the grade is "thin" — and STRONG needs
// the same count. One minimum for both directions (the 2026-11-01 audit: "soft"
// fired on two loads while "strong" needed four, so the weaker call stood on
// the weaker evidence; a two-load market still prints its figure and its count).
export const OUT_MIN_LOADS = 4;
export const THIN_OUT = OUT_MIN_LOADS; // the older name, same number

// THE COST THE GRADES ARE READ AGAINST (the Grading Rework, nodded 2026-11-01):
// the rate ladder's own figures, handed in by the page from useRateTargets so
// this module never guesses them. OUT grades a market's freight by what a day
// of it earns against the ladder's calendar-day bars — the same two numbers
// that already colour the Lanes page's $/day column. IN prices a reload in
// dollars: empty miles at the cost per driven mile, idle weekdays at the
// truck's fixed cost per calendar day, as a share of the load it led to,
// against the margin goal. No multipliers tuned to the output.
export interface GradeCosts {
  perMile: number | null; // true cost per driven mile (basis.costPerTotalMile)
  perDay: number | null; // fixed cost per calendar day (true monthly cost ÷ 30.4)
  dayBreakEven: number | null; // the gross a calendar day must earn to break even
  dayTarget: number | null; // the gross a calendar day must earn at the margin goal
  marginGoal: number; // IN: strong under it, soft past twice it
}
export const NO_COSTS: GradeCosts = { perMile: null, perDay: null, dayBreakEven: null, dayTarget: null, marginGoal: 0.15 };
const CALENDAR_DAYS_PER_MONTH = 365 / 12;

// From the page's targets (useRateTargets) — structural, so a test can hand
// over the four numbers.
export const gradeCostsOf = (targets: {
  basis: { costPerTotalMile: number | null; trueMonthlyCost: number | null };
  gross: { dailyBreakEvenCalendar: number | null; dailyTargetCalendar: number | null };
  marginGoal: number;
}): GradeCosts => ({
  perMile: targets.basis.costPerTotalMile,
  perDay: targets.basis.trueMonthlyCost != null ? targets.basis.trueMonthlyCost / CALENDAR_DAYS_PER_MONTH : null,
  dayBreakEven: targets.gross.dailyBreakEvenCalendar,
  dayTarget: targets.gross.dailyTargetCalendar,
  marginGoal: targets.marginGoal,
});

export type MarketGrade = "strong" | "fair" | "soft" | "thin";

export interface OutboundMarket {
  state: string;
  loadsOut: number; // delivered loads that ORIGINATED here
  medianRpm: number | null; // gross ÷ loaded mile, out of here (the rate you negotiate)
  perDayExFuel: number | null; // the median of (gross − fuel surcharge) ÷ calendar days the load owned — the grade's basis
  agents: number; // distinct agents sourcing here
  grade: MarketGrade;
}

// Calendar days a load owned, pickup to delivery inclusive, never under one.
const calendarDaysOf = (l: Load): number | null => {
  if (!l.pickup_date || !l.delivery_date) return null;
  const a = new Date(`${String(l.pickup_date).slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${String(l.delivery_date).slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(1, Math.round((b - a) / 86400000) + 1);
};
// A load's ex-fuel $/day: the fuel surcharge is a pass-through, not freight.
export const perDayExFuel = (l: Load): number | null => {
  const d = calendarDaysOf(l);
  if (d == null) return null;
  return (loadRevenue(l) - (Number(l.fuel_surcharge) || 0)) / d;
};

// Your outbound strength per origin state, from delivered loads. The grade is
// the market's typical ex-fuel $/day against the ladder's calendar-day bars:
// strong when a day of that freight earns what your margin goal needs, soft
// when it doesn't cover the day's break-even, fair between, thin under four
// loads. Per DAY, not per mile: Jason's book pays $9.57 a loaded mile under 400
// miles and $5.21 over 1,200, and the same per day — a per-mile grade crowned
// the short hauls. Without the bars (no P&L yet) every market is thin.
//
// `keyFor` is how a load is bucketed — the origin STATE by default, which is
// what the Load Scorer asks for. The Lanes ledger passes a freight-region key
// at region grain so the region rows are graded by this same arithmetic.
export const outboundStrength = (
  loads: Load[],
  keyFor: (l: Load) => string = (l) => up(l.origin_state),
  costs: GradeCosts = NO_COSTS,
): Map<string, OutboundMarket> => {
  const delivered = loads.filter((l) => isDelivered(l));
  const byState = new Map<string, Load[]>();
  for (const l of delivered) {
    const s = keyFor(l);
    if (!s) continue;
    (byState.get(s) ?? byState.set(s, []).get(s)!).push(l);
  }

  const out = new Map<string, OutboundMarket>();
  for (const [state, ls] of byState) {
    const rpms = ls.map(loadedRpm).filter((r): r is number => r != null);
    const days = ls.map(perDayExFuel).filter((r): r is number => r != null);
    const medianRpm = rpms.length ? median(rpms) : null;
    const perDay = days.length ? median(days) : null;
    const agents = new Set(ls.map((l) => l.agent_id).filter(Boolean)).size;
    const loadsOut = ls.length;

    let grade: MarketGrade;
    if (days.length < OUT_MIN_LOADS || perDay == null || costs.dayBreakEven == null || costs.dayTarget == null) {
      grade = "thin";
    } else if (perDay >= costs.dayTarget) {
      grade = "strong";
    } else if (perDay < costs.dayBreakEven) {
      grade = "soft";
    } else {
      grade = "fair";
    }
    out.set(state, { state, loadsOut, medianRpm, perDayExFuel: perDay, agents, grade });
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
// One minimum for soft and strong, like the OUT half: under it the market is thin.
export const IN_MIN_LOADS = 4;
export const IN_STRONG_MIN = IN_MIN_LOADS; // the older name, same number

export interface InboundMarket {
  state: string;
  // Delivered loads that ENDED here AND carry a pickup date, i.e. the legs the
  // sequence can actually read a reload off. One delivery set for the grade and
  // for the ledger row beside it — an undated load is counted in neither.
  deliveries: number;
  reloadMilesMedian: number | null; // typical empty run to the next pickup
  idleDaysAvg: number | null; // weekdays between delivery and the next pickup
  reloadCostMedian: number | null; // the reload in dollars — miles at cost, idle weekdays at the day's fixed cost
  shareMedian: number | null; // that cost as a share of the load it led to — the grade's basis
  nextRpmMedian: number | null; // what the load you found here paid
  grade: MarketGrade;
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;

// YOUR median reload — context the page prints beside a market's reload. It
// is computed over the WHOLE sequence (every delivered load, all time), never
// over the window being displayed. A home stint's reload is the run back out
// from Leighton, not the market's doing — out of it as it is out of every
// grade.
export const reloadYardstick = (seq: SequencedLoad[]): number | null =>
  median(
    seq
      .filter((s) => !s.home)
      .map((s) => s.next?.deadheadMiles)
      .filter((m): m is number => m != null),
  );

// One leg's reload in dollars, and as a share of the load it led to. null when
// the leg has no logged miles, no idle read, or no next gross — never a zero.
export const legCost = (
  next: Pick<NextLeg, "deadheadMiles" | "idleDays" | "gross"> | null | undefined,
  costs: GradeCosts,
): { cost: number; share: number } | null => {
  if (!next || next.deadheadMiles == null || next.idleDays == null) return null;
  if (costs.perMile == null || costs.perDay == null) return null;
  const cost = next.deadheadMiles * costs.perMile + next.idleDays * costs.perDay;
  if (next.gross == null || !(next.gross > 0)) return null;
  return { cost, share: cost / next.gross };
};

// A 0 deadhead is "not logged", never free — `sequenceLoads` already nulls it,
// so every figure here is over the legs that actually carry a number. Home
// stints leave every median: their reload is from home and their idle days
// were on purpose. The grade: the market's median reload as a share of the
// load it led to — strong at or under your margin goal, soft at or past twice
// it, fair between, thin under four deliveries or with no reload logged.
export const inboundStrength = (
  seq: SequencedLoad[],
  costs: GradeCosts = NO_COSTS,
  keyFor: (s: SequencedLoad) => string = (s) => up(s.load.destination_state),
): Map<string, InboundMarket> => {
  const byState = new Map<string, SequencedLoad[]>();
  for (const s of seq) {
    const k = keyFor(s);
    if (!k) continue;
    (byState.get(k) ?? byState.set(k, []).get(k)!).push(s);
  }

  const out = new Map<string, InboundMarket>();
  for (const [state, group] of byState) {
    const away = group.filter((s) => !s.home);
    const reloads = away
      .map((s) => s.next?.deadheadMiles)
      .filter((m): m is number => m != null);
    const idles = away
      .map((s) => s.next?.idleDays)
      .filter((d): d is number => d != null);
    const rpms = group
      .map((s) => s.next?.rpm)
      .filter((r): r is number => r != null);
    const legs = away.map((s) => legCost(s.next, costs)).filter((c): c is { cost: number; share: number } => c != null);

    const reloadMilesMedian = median(reloads);
    const idleDaysAvg = mean(idles);
    const reloadCostMedian = median(legs.map((c) => c.cost));
    const shareMedian = median(legs.map((c) => c.share));

    let grade: MarketGrade;
    if (group.length < IN_MIN_LOADS || shareMedian == null) {
      grade = "thin";
    } else if (shareMedian <= costs.marginGoal) {
      grade = "strong";
    } else if (shareMedian >= costs.marginGoal * 2) {
      grade = "soft";
    } else {
      grade = "fair";
    }

    out.set(state, {
      state,
      deliveries: group.length,
      reloadMilesMedian,
      idleDaysAvg,
      reloadCostMedian,
      shareMedian,
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
  // The ladder's bars (gradeCostsOf(targets)). The Scorer grades on the Lanes
  // ledger's 12-month window against the same bars, so the two pages can
  // never disagree about a market.
  costs: GradeCosts = NO_COSTS,
): DestinationFactor => {
  const strengths = outboundStrength(loads, undefined, costs);
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
      if (!isDelivered(l) || !strongStates.has(up(l.origin_state))) continue;
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

  // `profit` clears the minimum rung — the margin goal — but not target, so it
  // gets its own sentence. Folding it in with `meh` ("only fair on rate") made
  // the call contradict the verdict printed beside it.
  if (verdict === "profit") {
    const room = "Clears your minimum — real margin, not your target";
    if (grade === "soft")
      return {
        tone: "caution",
        text: `${room}, and it strands you where the freight out doesn't cover your day${dist}. Counter toward target before you take it.`,
      };
    if (grade === "strong")
      return {
        tone: "good",
        text: `${room}, and it drops you where a day of freight clears your target${keeper ? ", from a keeper agent" : ""}. Worth taking — counter toward target if there's room.`,
      };
    return {
      tone: "good",
      text: `${room}. Bookable as it stands${keeper ? ", and the agent's a keeper" : ""} — counter toward target if there's room.`,
    };
  }

  const clears = verdict === "steal" ? "Clears your prime rung" : "Clears your target";

  if (verdict === "take" || verdict === "steal") {
    if (grade === "soft")
      return {
        tone: "caution",
        text: `${clears}, but it strands you where the freight out doesn't cover your day${dist}. Take it and plan your reposition${keeper ? ", or lean on the agent for the backhaul" : ""}.`,
      };
    if (grade === "strong")
      return {
        tone: "good",
        text: `Good load — ${clears.toLowerCase()} and drops you where a day of freight clears your target${keeper ? ", from a keeper agent" : ""}. Take it.`,
      };
    return { tone: "good", text: `${clears}. Take it.` };
  }

  // meh — the deadhead dragged it; the destination + agent decide if it's worth it
  if (grade === "strong")
    return {
      tone: "caution",
      text: "Only fair on rate — the deadhead's the drag — but it sets you up where a day of freight clears your target. Worth it; counter toward SOLID.",
    };
  if (keeper)
    return {
      tone: "caution",
      text: "Only fair on rate, but the agent's a keeper. Counter toward SOLID — the relationship's worth it.",
    };
  if (grade === "soft")
    return {
      tone: "caution",
      text: `Only fair on rate, and it strands you where the freight out doesn't cover your day${dist}. Counter up hard, or let it go.`,
    };
  return { tone: "caution", text: "Only fair on rate. Counter up, or let it go." };
};
