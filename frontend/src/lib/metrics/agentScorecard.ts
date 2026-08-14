// Per-agent decision analytics for the roster: the three axes that actually
// decide who to book — Rate ($/mi they pay), Volume (loads + trend), and Dwell
// (money lost to CONFIRMED-but-uncollected detention) — plus a data-derived
// specialty label and a "Go-to" tier that complements (never replaces) the
// owner's star rating. Gross throughout (agents are a market-value lens), and
// small samples stay unscored so one lucky load can't crown anyone.
import type { Load } from "@/types/load";
import type { Agent } from "@/types/agent";
import { loadRevenue } from "./loads"; // GROSS per load
import { median } from "./stats";
import { detentionOwed, detentionCollected } from "@/lib/detention";

// Below this many delivered loads an agent is "thin data" — shown, never scored.
export const MIN_SCORE_LOADS = 2;
const COLD_DAYS = 90; // no delivered load in this many days → "cold"
const MS_DAY = 86_400_000;
// Cohort rate spread (inter-percentile, $/mi) below which rates count as "the
// same" — no strong/weak grading on sub-dime noise.
const RATE_SPREAD_FLOOR = 0.1;

// ---- specialty (data-derived from load mix) ----
export type SpecialtyTag = "oversize" | "specialty" | "standard";
const OVERSIZE_TYPES = new Set(["oversize", "heavy haul"]);
const STANDARD_TYPE = "standard flatbed";

export interface SpecialtyMix {
  tag: SpecialtyTag;
  oversizeShare: number; // 0..1 of delivered loads that are oversize/heavy-haul
  specialtyShare: number; // 0..1 that are non-standard (incl. hazmat)
  oversizeCount: number;
}

// Majority + a real count → a label; otherwise standard (or thin). The manual
// pin (fast-follow) will let the owner override this.
export const classifySpecialty = (delivered: Load[]): SpecialtyMix => {
  const n = delivered.length;
  const oversizeCount = delivered.filter((l) => OVERSIZE_TYPES.has(l.load_type)).length;
  const specialtyCount = delivered.filter((l) => l.load_type !== STANDARD_TYPE).length;
  const oversizeShare = n ? oversizeCount / n : 0;
  const specialtyShare = n ? specialtyCount / n : 0;
  let tag: SpecialtyTag = "standard";
  if (oversizeCount >= 2 && oversizeShare >= 0.5) tag = "oversize";
  else if (specialtyCount >= 2 && specialtyShare >= 0.5) tag = "specialty";
  return { tag, oversizeShare, specialtyShare, oversizeCount };
};

// ---- one agent's raw metrics (pre-tier) ----
export type Trend = "up" | "down" | "flat";
export type GoToTier = "call-first" | "solid" | "watch" | "cold" | "thin";
export type RatingFlag = "under" | "over"; // your star rating disagrees with the data

// Relationship bucket. An agent you've hit the same shipper OR receiver 2+ times
// through is a direct customer (their own account); otherwise spot market.
export type AgentClass = "direct" | "spot";
export interface RepeatCustomer {
  facility: string; // original-cased shipper/receiver name
  count: number; // loads touching it (either role)
}

export interface AgentScorecard {
  agentId: string;
  loadCount: number; // delivered
  revenue: number; // delivered gross
  medianRpm: number | null; // gross ÷ loaded mile, the typical load
  trend: Trend | null; // last 90d revenue vs the prior 90d
  lastWorked: string | null;
  daysSince: number | null;
  moneyLostLoads: number; // detentionOwed — confirmed billable, still unpaid
  collectedLoads: number; // detentionCollected
  collectRate: number | null; // collected ÷ (owed + collected), null if none confirmed
  specialty: SpecialtyMix;
  autoClass: AgentClass; // data-derived; overridden by agent.agent_class when pinned
  repeatCustomers: RepeatCustomer[]; // facilities seen 2+ times, count desc
  tier: GoToTier;
  ratingFlag: RatingFlag | null;
}

const loadRpm = (l: Load): number | null => {
  const miles = Number(l.loaded_miles);
  if (!(miles > 0)) return null;
  return loadRevenue(l) / miles;
};

const trendOf = (delivered: Load[], now: number): Trend | null => {
  const recent = now - 90 * MS_DAY;
  const prior = now - 180 * MS_DAY;
  let r = 0;
  let p = 0;
  for (const l of delivered) {
    if (!l.delivery_date) continue;
    const t = new Date(l.delivery_date).getTime();
    if (t >= recent && t <= now) r += loadRevenue(l);
    else if (t >= prior && t < recent) p += loadRevenue(l);
  }
  if (p === 0 && r === 0) return null;
  if (p === 0) return "up";
  const ratio = r / p;
  return ratio >= 1.15 ? "up" : ratio <= 0.85 ? "down" : "flat";
};

// Raw per-agent metrics for one agent's loads (already filtered to that agent).
const rawScorecard = (
  agentId: string,
  loads: Load[],
  now: number,
): Omit<AgentScorecard, "tier" | "ratingFlag"> => {
  const delivered = loads.filter((l) => l.load_status === "delivered");
  const rpms = delivered.map(loadRpm).filter((r): r is number => r !== null);
  const revenue = delivered.reduce((s, l) => s + loadRevenue(l), 0);

  let lastWorked: string | null = null;
  for (const l of delivered) {
    if (!l.delivery_date) continue;
    const d = l.delivery_date.slice(0, 10);
    if (!lastWorked || d > lastWorked) lastWorked = d;
  }
  const daysSince = lastWorked
    ? Math.floor((now - new Date(lastWorked + "T00:00:00Z").getTime()) / MS_DAY)
    : null;

  // Money lost to sitting = CONFIRMED-billable detention that never got paid.
  // Oversize crane time stays an unconfirmed candidate → never counted here.
  const moneyLostLoads = delivered.filter((l) => detentionOwed(l)).length;
  const collectedLoads = delivered.filter((l) => detentionCollected(l)).length;
  const confirmed = moneyLostLoads + collectedLoads;

  // Relationship bucket: a shipper OR receiver hit 2+ times through this agent is
  // their own customer. Counts non-cancelled loads (a booked repeat still counts).
  const facCount = new Map<string, { display: string; count: number }>();
  for (const l of loads) {
    if (l.load_status === "cancelled") continue;
    for (const nm of [l.shipper_name, l.receiver_name]) {
      const raw = String(nm ?? "").trim();
      if (!raw) continue;
      const key = raw.toUpperCase();
      const cur = facCount.get(key);
      if (cur) cur.count += 1;
      else facCount.set(key, { display: raw, count: 1 });
    }
  }
  const repeatCustomers = [...facCount.values()]
    .filter((v) => v.count >= 2)
    .map((v) => ({ facility: v.display, count: v.count }))
    .sort((a, b) => b.count - a.count);

  return {
    agentId,
    loadCount: delivered.length,
    revenue,
    medianRpm: rpms.length ? median(rpms) : null,
    trend: trendOf(delivered, now),
    lastWorked,
    daysSince,
    moneyLostLoads,
    collectedLoads,
    collectRate: confirmed > 0 ? collectedLoads / confirmed : null,
    specialty: classifySpecialty(delivered),
    autoClass: repeatCustomers.length > 0 ? "direct" : "spot",
    repeatCustomers,
  };
};

// Rate is only fair WITHIN a specialty type (oversize pays more per mile). Grade
// an agent's rate against same-type peers: top third strong, bottom third weak —
// but only when the cohort is big enough (3+) to rank meaningfully.
type RateGrade = "strong" | "weak" | "neutral";
const rateGrades = (
  cards: Omit<AgentScorecard, "tier" | "ratingFlag">[],
): Map<string, RateGrade> => {
  const grades = new Map<string, RateGrade>();
  const byType = new Map<SpecialtyTag, Omit<AgentScorecard, "tier" | "ratingFlag">[]>();
  for (const c of cards) {
    if (c.loadCount < MIN_SCORE_LOADS || c.medianRpm == null) continue;
    const t = c.specialty.tag;
    (byType.get(t) ?? byType.set(t, []).get(t)!).push(c);
  }
  for (const cohort of byType.values()) {
    if (cohort.length < 3) {
      for (const c of cohort) grades.set(c.agentId, "neutral");
      continue;
    }
    // Grade by rate VALUE (not index), so tied rates get the SAME grade. And
    // only when the cohort has a MEANINGFUL spread — a roster where everyone
    // pays ~the same $/mi (within a dime) is all-neutral, never split on cents.
    const vals = cohort.map((c) => c.medianRpm as number).sort((a, b) => a - b);
    const n = vals.length;
    const loVal = vals[Math.floor((n - 1) * 0.34)];
    const hiVal = vals[Math.ceil((n - 1) * 0.66)];
    const meaningful = hiVal - loVal >= RATE_SPREAD_FLOOR;
    for (const c of cohort) {
      const r = c.medianRpm as number;
      let g: RateGrade = "neutral";
      if (meaningful) {
        if (r >= hiVal) g = "strong";
        else if (r <= loVal) g = "weak";
      }
      grades.set(c.agentId, g);
    }
  }
  return grades;
};

const tierOf = (
  c: Omit<AgentScorecard, "tier" | "ratingFlag">,
  rate: RateGrade,
): GoToTier => {
  if (c.loadCount < MIN_SCORE_LOADS) return "thin";
  if (c.daysSince != null && c.daysSince > COLD_DAYS) return "cold";
  const hasMoneyLost = c.moneyLostLoads > 0;
  if (rate === "weak" || hasMoneyLost) return "watch";
  if (rate === "strong") return "call-first";
  return "solid";
};

// The gut-vs-data flag: surfaces where the owner's star rating and the data
// pull in opposite directions — a low-rated agent the numbers like ("under"-
// rated), or a high-rated one the numbers don't ("over"-rated).
const ratingFlagOf = (rating: number | null | undefined, tier: GoToTier): RatingFlag | null => {
  if (rating == null) return null;
  if (rating <= 2 && (tier === "call-first" || tier === "solid")) return "under";
  if (rating >= 4 && tier === "watch") return "over";
  return null;
};

// Build every agent's scorecard in two passes (raw metrics, then cohort-relative
// rate grade → tier). Keyed by agent_id.
export const buildAgentScorecards = (
  agents: Agent[],
  loads: Load[],
  now: Date = new Date(),
): Map<string, AgentScorecard> => {
  const nowMs = now.getTime();
  const byAgent = new Map<string, Load[]>();
  for (const l of loads) {
    if (!l.agent_id) continue;
    (byAgent.get(l.agent_id) ?? byAgent.set(l.agent_id, []).get(l.agent_id)!).push(l);
  }
  const raw = agents.map((a) => rawScorecard(a.agent_id, byAgent.get(a.agent_id) ?? [], nowMs));
  const grades = rateGrades(raw);
  const ratingById = new Map(agents.map((a) => [a.agent_id, a.rating]));

  const out = new Map<string, AgentScorecard>();
  for (const c of raw) {
    const tier = tierOf(c, grades.get(c.agentId) ?? "neutral");
    out.set(c.agentId, {
      ...c,
      tier,
      ratingFlag: ratingFlagOf(ratingById.get(c.agentId), tier),
    });
  }
  return out;
};

// The effective bucket for an agent: the owner's pin wins; otherwise the
// data-derived class from the scorecard.
export const effectiveAgentClass = (
  agent: Agent,
  card: AgentScorecard | undefined,
): { bucket: AgentClass; source: "pinned" | "auto" } => {
  if (agent.agent_class === "direct" || agent.agent_class === "spot") {
    return { bucket: agent.agent_class, source: "pinned" };
  }
  return { bucket: card?.autoClass ?? "spot", source: "auto" };
};

// ---- roster-level analytics for the KPI row ----
export interface RosterAnalytics {
  rateLeader: { agentId: string; medianRpm: number } | null;
  oversizeBench: number; // agents labeled oversize
  specCapable: number; // agents with any oversize/heavy-haul load
  concentrationPct: number | null; // top-3 revenue ÷ total delivered revenue
  goingCold: { agentId: string; revenue: number; daysSince: number } | null; // best cold agent
  moneyLostAgents: number; // agents with any confirmed-unpaid detention
}

export const agentRosterAnalytics = (
  cards: Map<string, AgentScorecard>,
): RosterAnalytics => {
  const list = [...cards.values()];
  const scored = list.filter((c) => c.loadCount >= MIN_SCORE_LOADS);

  let rateLeader: RosterAnalytics["rateLeader"] = null;
  for (const c of scored) {
    if (c.medianRpm == null) continue;
    if (!rateLeader || c.medianRpm > rateLeader.medianRpm)
      rateLeader = { agentId: c.agentId, medianRpm: c.medianRpm };
  }

  const totalRev = list.reduce((s, c) => s + c.revenue, 0);
  const top3 = [...list].sort((a, b) => b.revenue - a.revenue).slice(0, 3);
  const top3Rev = top3.reduce((s, c) => s + c.revenue, 0);

  // The most valuable agent who's gone quiet — worth a call.
  let goingCold: RosterAnalytics["goingCold"] = null;
  for (const c of list) {
    if (c.tier !== "cold") continue;
    if (!goingCold || c.revenue > goingCold.revenue)
      goingCold = { agentId: c.agentId, revenue: c.revenue, daysSince: c.daysSince ?? 0 };
  }

  return {
    rateLeader,
    oversizeBench: list.filter((c) => c.specialty.tag === "oversize").length,
    specCapable: list.filter((c) => c.specialty.oversizeCount > 0).length,
    concentrationPct: totalRev > 0 ? top3Rev / totalRev : null,
    goingCold,
    moneyLostAgents: list.filter((c) => c.moneyLostLoads > 0).length,
  };
};

// ---- revenue concentration (WINDOWED — current dependency, not lifetime) ----
// Healthy guideline for a one-truck bench: no single agent over ~30% of your
// book, top-3 under ~65%. Tunable in settings.
export const SINGLE_CAP = 0.3;
export const TOP3_CAP = 0.65;

export interface ConcentrationShare {
  agentId: string;
  revenue: number;
  share: number; // 0..1 of the windowed book
}
export interface Concentration {
  windowDays: number;
  total: number;
  shares: ConcentrationShare[]; // every contributing agent, revenue desc
  top3Pct: number | null;
  singleMax: ConcentrationShare | null;
  overSingleCap: boolean; // any single agent over the cap
  singleCap: number;
}

// ---- momentum (booking velocity: recent 90d vs the prior 90d) ----
// Per-agent gross-revenue % change, recent-vs-prior. null = no activity either
// window; +1 (capped) when they're new/surging from a zero prior. Feeds the
// diverging momentum bars — who's heating up, who's falling off.
export const agentMomentum = (
  loads: Load[],
  now: Date = new Date(),
): Map<string, number | null> => {
  const nowMs = now.getTime();
  const recentCut = nowMs - 90 * MS_DAY;
  const priorCut = nowMs - 180 * MS_DAY;
  const acc = new Map<string, { r: number; p: number }>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.agent_id || !l.delivery_date) continue;
    const t = new Date(l.delivery_date).getTime();
    const cur = acc.get(l.agent_id) ?? { r: 0, p: 0 };
    if (t >= recentCut && t <= nowMs) cur.r += loadRevenue(l);
    else if (t >= priorCut && t < recentCut) cur.p += loadRevenue(l);
    acc.set(l.agent_id, cur);
  }
  const out = new Map<string, number | null>();
  for (const [id, { r, p }] of acc) {
    if (r === 0 && p === 0) out.set(id, null);
    else if (p === 0) out.set(id, 1); // new / surging from nothing
    else out.set(id, r / p - 1);
  }
  return out;
};

// Concentration over a RECENT window (default 90d, matching the "cold" line) so
// an agent who's gone quiet drops out — a dependency you haven't felt in months
// isn't a dependency. Per-agent shares let you watch the single-agent cap.
export const concentrationAnalytics = (
  loads: Load[],
  now: Date = new Date(),
  windowDays = COLD_DAYS,
  singleCap = SINGLE_CAP,
): Concentration => {
  const cutoff = now.getTime() - windowDays * MS_DAY;
  const rev = new Map<string, number>();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.agent_id || !l.delivery_date) continue;
    if (new Date(l.delivery_date).getTime() < cutoff) continue;
    rev.set(l.agent_id, (rev.get(l.agent_id) ?? 0) + loadRevenue(l));
  }
  const total = [...rev.values()].reduce((a, b) => a + b, 0);
  const shares: ConcentrationShare[] = [...rev.entries()]
    .map(([agentId, revenue]) => ({ agentId, revenue, share: total > 0 ? revenue / total : 0 }))
    .sort((a, b) => b.revenue - a.revenue);
  const singleMax = shares[0] ?? null;
  return {
    windowDays,
    total,
    shares,
    top3Pct: total > 0 ? shares.slice(0, 3).reduce((s, x) => s + x.share, 0) : null,
    singleMax,
    overSingleCap: !!singleMax && singleMax.share > singleCap,
    singleCap,
  };
};
