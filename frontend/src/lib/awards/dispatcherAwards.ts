// Dispatcher achievements — scoped to ONE person via booked_by, everything on
// GROSS (never net; see agents/lanes principle). Two kinds, mirroring the driver
// system's mechanics so they render and POP the same way:
//   • MEDALS  = rare, hard feats (tiered on how many times earned)
//   • PATCHES = the everyday grind (a value that climbs; celebrates at milestones)
import type { Load } from "@/types/load";
import { loadGross, type RateLadder } from "@/lib/metrics/rateTargets";
import { scoreLoad, type ScoreBasis } from "@/lib/metrics/loadScore";
import { loadDeadheadPct, loadEmptyMiles } from "@/lib/metrics/deadhead";
import { onTimeStatus, detentionCollected } from "@/lib/detention";
import { isSpecializedLoadType } from "@/lib/dimensions";
import { tiered, type Medal } from "./medals";
import type { Award } from "@/lib/metrics/awards";
import {
  DEADHEAD_TARGET,
  RATE_TIERS,
  SPEC_TIERS,
  type RateTiers,
} from "@/lib/constants/targets";

export interface DispatcherAwardInput {
  loads: Load[];
  userId: string;
  ladder: RateLadder;
  scoreBasis: ScoreBasis;
  freeHours: number;
  streak: number; // best booking streak in weeks (from the grind)
  tiers?: RateTiers; // standard markup tiers — the "steal" verdict for legal freight
  specTiers?: RateTiers; // specialized tiers — for oversize/hazmat/heavy loads
}

// A grind patch for display: a value that climbs toward milestones.
export interface GrindPatch {
  key: string;
  name: string;
  icon: string;
  earned: boolean;
  badge: string; // "×150", "$487k", "6 wk"
  hint: string;
  progress: number; // 0..1 toward the next milestone
  reached: number; // milestones crossed — encodes the pop id (so it pops at tiers)
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const cnt = (n: number) => `${Math.round(n)}`;
const kMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : `$${Math.round(n)}`;

// Superload by the common cross-state thresholds (16' wide/high, 150' long, 200k lb).
const isSuperload = (l: Load): boolean =>
  (Number(l.width_in) || 0) >= 192 ||
  (Number(l.height_in) || 0) >= 192 ||
  (Number(l.length_in) || 0) >= 1800 ||
  (Number(l.weight) || 0) >= 200_000;

const rpm = (l: Load): number => {
  const miles = Number(l.loaded_miles) || 0;
  return miles > 0 ? loadGross(l) / miles : 0;
};
// Actual deadhead, from the odometer — null until the load has run, so an
// un-driven load can't masquerade as a "lean" or slam-worthy one.
const deadheadPct = (l: Load): number | null => loadDeadheadPct(l);
const bothOnTime = (l: Load): boolean =>
  onTimeStatus(l.pickup_appt_start, l.pickup_appt_end, l.shipper_in) === "on-time" &&
  onTimeStatus(l.delivery_appt_start, l.delivery_appt_end, l.receiver_in) === "on-time";

const weekKey = (iso: string): string => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
};

// All the raw tallies, computed once.
interface Stats {
  loadsBooked: number;
  gross: number;
  rateHawk: number;
  detentionLoads: number;
  topAgentLoads: number;
  clockwork: number;
  quickTurn: number;
  oversize: number;
  lean: number;
  steal: number;
  doubleUp: number;
  superload: number;
  whale: number;
  perfectWeeks: number;
  grandSlam: number;
  bestWeekLoads: number;
  backhaul: number;
}

const computeStats = (input: DispatcherAwardInput): Stats => {
  const {
    loads,
    userId,
    ladder,
    scoreBasis,
    tiers = RATE_TIERS,
    specTiers = SPEC_TIERS,
  } = input;
  const mine = loads.filter((l) => l.booked_by === userId && l.load_status !== "cancelled");
  const delivered = mine.filter((l) => l.load_status === "delivered");
  const target = ladder.target ?? Infinity;
  const walkAway = ladder.walkAway ?? Infinity;

  const isSteal = (l: Load): boolean =>
    scoreLoad(
      {
        rate: loadGross(l),
        loadedMiles: Number(l.loaded_miles) || 0,
        // Actual empty miles once the load has run. Until then it's still a
        // prospective load — which is exactly what the planning estimate is for.
        deadheadMiles: loadEmptyMiles(l) ?? (Number(l.deadhead_miles) || 0),
      },
      scoreBasis,
      // Specialized freight is graded on the higher set, mirroring the Scorer.
      isSpecializedLoadType(l.load_type) ? specTiers : tiers,
    ).verdict === "steal";

  // Deepest single-agent relationship.
  const byAgent = new Map<string, number>();
  for (const l of mine) byAgent.set(l.agent_id, (byAgent.get(l.agent_id) ?? 0) + 1);
  const topAgentLoads = byAgent.size ? Math.max(...byAgent.values()) : 0;

  // Quick turns: consecutive runs where the next pickup lands ≤ 1 day after the
  // prior delivery.
  const chron = [...delivered]
    .filter((l) => l.delivery_date && l.pickup_date)
    .sort((a, b) => (a.delivery_date! < b.delivery_date! ? -1 : 1));
  let quickTurn = 0;
  for (let i = 1; i < chron.length; i++) {
    const prevDel = Date.parse(chron[i - 1].delivery_date!.slice(0, 10) + "T00:00:00Z");
    const nextPick = Date.parse(chron[i].pickup_date.slice(0, 10) + "T00:00:00Z");
    if (nextPick >= prevDel && nextPick - prevDel <= 86_400_000) quickTurn++;
  }

  // Weekly buckets (of booked loads) for Big Week + Perfect Week.
  const weeks = new Map<string, Load[]>();
  for (const l of delivered)
    if (l.delivery_date) {
      const k = weekKey(l.delivery_date);
      (weeks.get(k) ?? weeks.set(k, []).get(k)!).push(l);
    }
  let bestWeekLoads = 0;
  let perfectWeeks = 0;
  for (const w of weeks.values()) {
    if (w.length > bestWeekLoads) bestWeekLoads = w.length;
    if (w.length > 0 && w.every((l) => rpm(l) >= target)) perfectWeeks++;
  }

  // Backhaul chains: booked loads whose origin market is where the PREVIOUS
  // booked load delivered — a booked return leg, not a deadhead reset. Market
  // (metro) match, since exact-city never lines up. Sequenced by pickup.
  const seq = [...mine]
    .filter((l) => l.pickup_date)
    .sort((a, b) => (a.pickup_date < b.pickup_date ? -1 : 1));
  let backhaul = 0;
  for (let i = 1; i < seq.length; i++) {
    const prevDest = seq[i - 1].destination_market_id;
    const origin = seq[i].origin_market_id;
    if (origin && prevDest && origin === prevDest) backhaul++;
  }

  return {
    loadsBooked: mine.length,
    gross: mine.reduce((s, l) => s + loadGross(l), 0),
    rateHawk: mine.filter((l) => rpm(l) >= target).length,
    detentionLoads: delivered.filter((l) => detentionCollected(l)).length,
    topAgentLoads,
    clockwork: delivered.filter(bothOnTime).length,
    quickTurn,
    oversize: mine.filter((l) => l.load_type === "oversize").length,
    lean: delivered.filter((l) => {
      const d = deadheadPct(l);
      return d != null && d <= DEADHEAD_TARGET;
    }).length,
    steal: mine.filter(isSteal).length,
    doubleUp: mine.filter((l) => rpm(l) >= 2 * walkAway).length,
    superload: mine.filter(isSuperload).length,
    whale: mine.filter((l) => loadGross(l) >= 10_000).length,
    perfectWeeks,
    grandSlam: delivered.filter(
      (l) => isSteal(l) && bothOnTime(l) && (deadheadPct(l) ?? 1) <= 0.1,
    ).length,
    bestWeekLoads,
    backhaul,
  };
};

// ---- MEDALS (rare feats, tiered on times earned) ----
export const dispatcherMedals = (input: DispatcherAwardInput): Medal[] => {
  const s = computeStats(input);
  return [
    tiered("disp-steal", "Steal", "crown", [1, 5, 15], s.steal, cnt),
    tiered("disp-double-up", "Double-Up", "coins", [1, 3, 10], s.doubleUp, cnt),
    tiered("disp-whale", "Whale", "package", [1, 3, 10], s.whale, cnt),
    tiered("disp-superload", "Superload", "mountain", [1, 2, 5], s.superload, cnt),
    tiered("disp-perfect-week", "Perfect Week", "medal", [1, 3, 10], s.perfectWeeks, cnt),
    tiered("disp-grand-slam", "Grand Slam", "trophy", [1, 2, 5], s.grandSlam, cnt),
    tiered("disp-big-week", "Big Week", "stack-2", [5, 10, 15], s.bestWeekLoads, (n) => `${Math.round(n)} loads`),
  ];
};

// ---- PATCHES (the grind, milestone-based) ----
const grindPatch = (
  key: string,
  name: string,
  icon: string,
  value: number,
  milestones: number[],
  fmt: (n: number) => string,
): GrindPatch => {
  let reached = 0;
  for (const m of milestones) if (value >= m) reached++;
  const next = reached < milestones.length ? milestones[reached] : null;
  const prev = reached > 0 ? milestones[reached - 1] : 0;
  return {
    key,
    name,
    icon,
    earned: value > 0,
    badge: fmt(value),
    hint: next != null ? `next: ${fmt(next)}` : "maxed out",
    progress: next != null ? clamp((value - prev) / (next - prev)) : 1,
    reached,
  };
};

export const dispatcherPatches = (input: DispatcherAwardInput): GrindPatch[] => {
  const s = computeStats(input);
  const x = (n: number) => `×${Math.round(n)}`;
  return [
    grindPatch("disp-deal-closer", "Deal Closer", "package", s.loadsBooked, [25, 75, 150, 300], x),
    grindPatch("disp-rainmaker", "Big Month", "cash", s.gross, [100_000, 350_000, 750_000], kMoney),
    grindPatch("disp-rate-hawk", "Rate Hawk", "feather", s.rateHawk, [15, 50, 125], x),
    grindPatch("disp-iron-booker", "Iron Booker", "flame", input.streak, [4, 8, 12], (n) => `${Math.round(n)} wk`),
    grindPatch("disp-bounty", "Bounty Hunter", "coins", s.detentionLoads, [3, 10, 25], x),
    grindPatch("disp-right-hand", "Right Hand", "users", s.topAgentLoads, [10, 25, 50], x),
    grindPatch("disp-clockwork", "Clockwork", "gauge", s.clockwork, [25, 75, 200], x),
    grindPatch("disp-quick-turn", "Quick Turn", "arrows-horizontal", s.quickTurn, [15, 50, 125], x),
    grindPatch("disp-oversize", "Oversize Ace", "truck", s.oversize, [5, 15, 40], x),
    grindPatch("disp-lean", "Lean Machine", "route", s.lean, [25, 75, 200], x),
    grindPatch("disp-backhaul-boss", "Backhaul Boss", "road", s.backhaul, [3, 10, 25, 50], x),
  ];
};

// ---- AWARDS (for the pop celebration) ----
// Medals pop on tier-up; grind patches pop when a new MILESTONE is crossed
// (the id encodes `reached`, not the raw count — so no per-load spam).
export const dispatcherEarnedAwards = (input: DispatcherAwardInput): Award[] => {
  const out: Award[] = [];
  for (const m of dispatcherMedals(input))
    if (m.tier > 0)
      out.push({
        id: `medal:${m.key}:${m.tier}`,
        tier: "medal",
        name: `${m.name} ${m.tierLabel}`,
        detail: m.hint,
        icon: m.icon,
        medalTier: m.tier,
      });
  for (const p of dispatcherPatches(input))
    if (p.reached > 0)
      out.push({
        id: `patch:${p.key}:${p.reached}`,
        tier: "patch",
        name: `${p.name} ${p.badge}`,
        detail: p.hint,
        icon: p.icon,
      });
  return out;
};
