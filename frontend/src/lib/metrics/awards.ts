// The set of awards currently earned, each with a STABLE id that changes only
// when the award is genuinely re-earned (a new record, a new tier). The pop
// system diffs this against a per-device "seen" list: anything whose id isn't
// seen is new and fires a celebration. Encoding the value/threshold in the id is
// what makes "beat your own best" re-pop while an unchanged best stays quiet.
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { FuelEntry } from "@/types/fuelEntry";
import {
  careerRank,
  getSeasonStats,
  marginGrade,
  personalBests,
} from "./playerCard";
import { mileMilestone } from "./mileClub";
import { resolvePeriod, loadsInRange, type RecapScope } from "./recap";
import { loadRevenue } from "./rateTargets";

export type AwardTier = "recap" | "marquee" | "burst";

export interface Award {
  id: string;
  tier: AwardTier;
  name: string;
  detail: string;
  icon: string; // mapped to a lucide icon in the UI
  scope?: RecapScope; // recap tier only — drives the prestige of the ceremony
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const kMoney = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;

export interface AwardInputs {
  loads: Load[];
  periods: ExpensePeriod[];
  fuel: FuelEntry[];
  lifetimeMiles: number;
  obligationsDebtMonthly: number;
  streak?: number; // current grind streak (weeks beating target)
  now: Date;
}

const RELATIONSHIP_MARKS = [5, 10, 25, 50, 100];
const CENTURY_MARKS = [500, 250, 100];
const STREAK_MARKS = [12, 8, 4];

export const earnedAwards = (i: AwardInputs): Award[] => {
  const out: Award[] = [];

  // ---- Recap ceremony: each COMPLETED period (month/quarter/year) with earned
  // freight. A smaller period that closes on the SAME day as a larger one is
  // SUBSUMED — only the grandest ceremony fires (the last month of a quarter
  // hands the moment to the quarter; the last quarter of a year, to the year).
  // The subsumed period is still fully browsable on the recap page. The id carries
  // the label so each period only ever fires once.
  const monthR = resolvePeriod("month", 0, i.now);
  const quarterR = resolvePeriod("quarter", 0, i.now);
  const yearR = resolvePeriod("year", 0, i.now);
  const sameClose = (a: typeof monthR, b: typeof monthR) =>
    a.end.getTime() === b.end.getTime();
  const recapPeriods = [
    { scope: "month" as RecapScope, r: monthR, subsumed: sameClose(monthR, quarterR) },
    { scope: "quarter" as RecapScope, r: quarterR, subsumed: sameClose(quarterR, yearR) },
    { scope: "year" as RecapScope, r: yearR, subsumed: false },
  ];
  for (const { scope, r, subsumed } of recapPeriods) {
    if (subsumed) continue;
    const inR = loadsInRange(i.loads, r);
    if (inR.length === 0) continue;
    const gross = inR.reduce((s, l) => s + loadRevenue(l), 0);
    out.push({
      id: `recap:${scope}:${r.label}`,
      tier: "recap",
      scope,
      name: r.label,
      detail: `${kMoney(gross)} hauled · ${inR.length} load${inR.length === 1 ? "" : "s"}`,
      icon: "trophy",
    });
  }

  // ---- Marquee: career rank ----
  const rank = careerRank(i.lifetimeMiles);
  out.push({
    id: `rank:${rank.key}`,
    tier: "marquee",
    name: `Rank up — ${rank.name}`,
    detail: `${Math.round(rank.miles).toLocaleString("en-US")} lifetime miles`,
    icon: "truck",
  });

  // ---- Marquee: mile club ----
  const mm = mileMilestone(i.lifetimeMiles);
  if (mm.crossed != null && mm.label)
    out.push({
      id: `mileclub:${mm.crossed}`,
      tier: "marquee",
      name: `${mm.label} Mile Club`,
      detail: mm.title ?? "Lifetime",
      icon: "medal",
    });

  // ---- Marquee: strong season ----
  const season = getSeasonStats(i.periods, i.loads, i.now, 3, i.obligationsDebtMonthly);
  if (marginGrade(season.netMargin) === "strong")
    out.push({
      id: `strong-season:${season.label}`,
      tier: "marquee",
      name: "Strong Season",
      detail: `${season.label} · ${season.netMargin != null ? (season.netMargin * 100).toFixed(1) : "?"}% margin`,
      icon: "trophy",
    });

  // ---- Burst: personal bests (re-fire when the record improves) ----
  const pb = personalBests(i.loads, i.fuel, i.now);
  if (pb.bestWeekRevenue != null)
    out.push({ id: `best-week:${Math.round(pb.bestWeekRevenue)}`, tier: "burst", name: "Personal Best Week", detail: `${money(pb.bestWeekRevenue)} in a week`, icon: "trophy" });
  if (pb.bestMpg != null)
    out.push({ id: `best-mpg:${pb.bestMpg.toFixed(1)}`, tier: "burst", name: "Feather Foot", detail: `New best tank — ${pb.bestMpg.toFixed(1)} mpg`, icon: "flame" });
  if (pb.biggestLoad != null)
    out.push({ id: `biggest-load:${Math.round(pb.biggestLoad)}`, tier: "burst", name: "Heavy Purse", detail: `Biggest load — ${money(pb.biggestLoad)}`, icon: "package" });
  if (pb.mostLoadsInWeek != null)
    out.push({ id: `most-loads:${pb.mostLoadsInWeek}`, tier: "burst", name: "Busy Week", detail: `${pb.mostLoadsInWeek} loads in a week`, icon: "stack" });
  if (pb.lowestDeadheadPct != null)
    out.push({ id: `best-deadhead:${(pb.lowestDeadheadPct * 100).toFixed(1)}`, tier: "burst", name: "Tight Lines", detail: `Deadhead down to ${(pb.lowestDeadheadPct * 100).toFixed(1)}%`, icon: "gauge" });

  // ---- Burst: relationship milestones (per agent) ----
  const byAgent = new Map<string, { name: string; count: number }>();
  for (const l of i.loads)
    if (l.load_status === "delivered" && l.agent_id) {
      const a = byAgent.get(l.agent_id) ?? { name: l.agent, count: 0 };
      a.count += 1;
      byAgent.set(l.agent_id, a);
    }
  for (const [agentId, a] of byAgent) {
    const mark = [...RELATIONSHIP_MARKS].reverse().find((x) => a.count >= x);
    if (mark)
      out.push({ id: `relationship:${agentId}:${mark}`, tier: "burst", name: "Relationship Builder", detail: `${a.name} ×${mark}`, icon: "users" });
  }

  // ---- Burst: century of loads ----
  const delivered = i.loads.filter((l) => l.load_status === "delivered").length;
  const century = CENTURY_MARKS.find((x) => delivered >= x);
  if (century)
    out.push({ id: `century:${century}`, tier: "burst", name: `${century} Loads`, detail: "Career milestone", icon: "stack" });

  // ---- Burst: grind streak milestones ----
  if (i.streak) {
    const mark = STREAK_MARKS.find((x) => i.streak! >= x);
    if (mark)
      out.push({ id: `on-a-roll:${mark}`, tier: "burst", name: "On a Roll", detail: `${i.streak}-week target streak`, icon: "flame" });
  }

  return out;
};

// Sample awards for previewing the celebration UI (dashboard `?awarddemo`) —
// since a real device silently baselines on first load, this is how you see the
// pop without waiting to earn one.
export const DEMO_AWARDS: Award[] = [
  { id: "demo:recap-year", tier: "recap", scope: "year", name: "2026", detail: "$141k hauled · 47 loads", icon: "trophy" },
  { id: "demo:recap-quarter", tier: "recap", scope: "quarter", name: "Q2 2026", detail: "$70.4k hauled · 23 loads", icon: "trophy" },
  { id: "demo:recap-month", tier: "recap", scope: "month", name: "Jun 2026", detail: "$24.1k hauled · 8 loads", icon: "trophy" },
  { id: "demo:rank", tier: "marquee", name: "Rank up — Road Captain", detail: "582,450 lifetime miles and climbing.", icon: "truck" },
  { id: "demo:tightlines", tier: "burst", name: "Tight Lines", detail: "Deadhead down to 7.2%", icon: "gauge" },
  { id: "demo:feather", tier: "burst", name: "Feather Foot", detail: "New best tank — 6.9 mpg", icon: "flame" },
];

// Split newly-earned awards against a seen-id set. Marquee first (they take over
// the screen), then bursts.
export const newAwards = (earned: Award[], seen: Set<string>): Award[] => {
  const fresh = earned.filter((a) => !seen.has(a.id));
  const scopeRank: Record<string, number> = { year: 0, quarter: 1, month: 2 };
  // Recap ceremonies lead, grandest first (year → quarter → month) so the biggest
  // milestone is the primary pop and smaller ones queue behind it; then any
  // marquee, then bursts.
  const recaps = fresh
    .filter((a) => a.tier === "recap")
    .sort((a, b) => (scopeRank[a.scope ?? "month"] ?? 0) - (scopeRank[b.scope ?? "month"] ?? 0));
  return [
    ...recaps,
    ...fresh.filter((a) => a.tier === "marquee"),
    ...fresh.filter((a) => a.tier === "burst"),
  ];
};
