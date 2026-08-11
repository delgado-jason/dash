// The set of awards currently earned, each with a STABLE id that changes only
// when the award is genuinely re-earned (a new record value, a stacked patch, a
// higher medal tier). The pop system diffs this against a per-device "seen" list;
// anything whose id isn't seen is new and fires a celebration. Encoding the
// value/count/tier in the id is what makes "beat your own best" re-pop while an
// unchanged one stays quiet.
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import type { ExpensePeriod } from "@/types/expense";
import type { FuelEntry } from "@/types/fuelEntry";
import {
  careerRank,
  getSeasonStats,
  marginGrade,
  personalBests,
} from "./playerCard";
import { resolvePeriod, loadsInRange, type RecapScope } from "./recap";
import { loadRevenue, loadGross } from "./rateTargets";
import { computePatches } from "@/lib/awards/patches";
import { computeMedals } from "@/lib/awards/medals";
import type { TrophyDef } from "@/lib/trophies/catalog";
import type { TrophyStatus } from "@/lib/trophies/status";
import type { Trophy } from "@/types/trophy";
import { money } from "@/lib/format";

// Grandest → smallest. trophy = career Hall monument; medal = a tier-up; recap = a
// period close; patch = a stacked hard feat; record = a new personal best.
export type AwardTier = "trophy" | "medal" | "recap" | "patch" | "record";

export interface Award {
  id: string;
  tier: AwardTier;
  name: string;
  detail: string;
  icon: string; // mapped to a lucide icon in the UI
  scope?: RecapScope; // recap tier — drives the ceremony prestige
  image?: string; // trophy tier — the approved AI art
  medalTier?: number; // medal tier — drives the medallion metal (1/2/3)
}

const kMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`);

export interface AwardInputs {
  loads: Load[];
  trips: Trip[];
  periods: ExpensePeriod[];
  fuel: FuelEntry[];
  lifetimeMiles: number;
  obligationsDebtMonthly: number;
  streak?: number; // grind streak (weeks beating target)
  loanPaidPct?: number | null; // best % paid across tracked loans — Debt Crusher medal
  now: Date;
}

export const earnedAwards = (i: AwardInputs): Award[] => {
  const out: Award[] = [];

  // ---- Recap ceremony: each COMPLETED period (month/quarter/year) with earned
  // freight. A smaller period that closes on the SAME day as a larger one is
  // subsumed — only the grandest ceremony fires; the id carries the label so each
  // period only ever fires once.
  const monthR = resolvePeriod("month", 0, i.now);
  const quarterR = resolvePeriod("quarter", 0, i.now);
  const yearR = resolvePeriod("year", 0, i.now);
  const sameClose = (a: typeof monthR, b: typeof monthR) => a.end.getTime() === b.end.getTime();
  const recapPeriods = [
    { scope: "month" as RecapScope, r: monthR, subsumed: sameClose(monthR, quarterR) },
    { scope: "quarter" as RecapScope, r: quarterR, subsumed: sameClose(quarterR, yearR) },
    { scope: "year" as RecapScope, r: yearR, subsumed: false },
  ];
  for (const { scope, r, subsumed } of recapPeriods) {
    if (subsumed) continue;
    const inR = loadsInRange(i.loads, r);
    if (inR.length === 0) continue;
    const gross = inR.reduce((s, l) => s + loadGross(l), 0); // GROSS — "hauled" = freight moved
    out.push({
      id: `recap:${scope}:${r.label}`,
      tier: "recap",
      scope,
      name: r.label,
      detail: `${kMoney(gross)} hauled · ${inR.length} load${inR.length === 1 ? "" : "s"}`,
      icon: "trophy",
    });
  }

  // ---- Medals (tier-up): the fixed milestone ladder + a career rank-up ----
  const del = i.loads.filter((l) => l.load_status === "delivered");
  const season = getSeasonStats(i.periods, i.loads, i.trips, i.now, i.obligationsDebtMonthly);
  const medals = computeMedals({
    lifetimeMiles: i.lifetimeMiles,
    deliveredCount: del.length,
    cumulativeNet: del.reduce((s, l) => s + loadRevenue(l), 0),
    streak: i.streak ?? 0,
    loanPaidPct: i.loanPaidPct ?? null,
    seasonStrong: marginGrade(season.netMargin) === "strong",
  });
  for (const m of medals)
    if (m.tier > 0)
      out.push({ id: `medal:${m.key}:${m.tier}`, tier: "medal", name: `${m.name} ${m.tierLabel}`, detail: m.hint, icon: m.icon, medalTier: m.tier });
  const rank = careerRank(i.lifetimeMiles);
  out.push({
    id: `medal:rank:${rank.index}`,
    tier: "medal",
    name: `Rank up — ${rank.name}`,
    detail: `${Math.round(rank.miles).toLocaleString("en-US")} lifetime miles`,
    icon: "truck",
    medalTier: 3,
  });

  // ---- Patches (stacked hard feat): fire when the ×count climbs ----
  for (const p of computePatches(i.loads, i.fuel))
    if (p.count > 0)
      out.push({ id: `patch:${p.key}:${p.count}`, tier: "patch", name: `${p.name} ×${p.count}`, detail: p.hint, icon: p.icon });

  // ---- Records (new personal best): fire when a best improves ----
  const pb = personalBests(i.loads, i.fuel, i.now);
  const rec = (key: string, val: number | null, id: string, name: string, detail: string, icon: string) => {
    if (val != null) out.push({ id: `record:${key}:${id}`, tier: "record", name, detail, icon });
  };
  rec("top-week", pb.bestWeekRevenue, `${Math.round(pb.bestWeekRevenue ?? 0)}`, "New record — Top Week", money(pb.bestWeekRevenue ?? 0), "trophy");
  rec("best-tank", pb.bestMpg, `${(pb.bestMpg ?? 0).toFixed(1)}`, "New record — Best Tank", `${(pb.bestMpg ?? 0).toFixed(1)} mpg`, "flame");
  rec("biggest-load", pb.biggestLoad, `${Math.round(pb.biggestLoad ?? 0)}`, "New record — Biggest Load", money(pb.biggestLoad ?? 0), "package");
  rec("most-week", pb.mostLoadsInWeek, `${pb.mostLoadsInWeek ?? 0}`, "New record — Most in a Week", `${pb.mostLoadsInWeek ?? 0} loads`, "stack");

  return out;
};

// The earned Hall trophies as awards — the grandest tier. Same earn-detection the
// Trophy Room uses, so a trophy pops the instant it's earned. Carries the AI art.
export const earnedTrophyAwards = (
  catalog: TrophyDef[],
  statuses: Record<string, TrophyStatus>,
  recordsByKey: Record<string, Trophy>,
): Award[] =>
  catalog
    .filter((d) => statuses[d.key]?.earned)
    .map((d) => ({
      id: `trophy:${d.key}`,
      tier: "trophy" as const,
      name: d.name,
      detail: d.blurb,
      icon: "trophy",
      image: recordsByKey[d.key]?.image_url ?? undefined,
    }));

// Sample awards for previewing the celebration UI (dashboard `?awarddemo`).
export const DEMO_AWARDS: Award[] = [
  { id: "demo:trophy", tier: "trophy", name: "Owner Operator", detail: "The origin — you went out on your own.", icon: "trophy" },
  { id: "demo:recap-year", tier: "recap", scope: "year", name: "2026", detail: "$141k hauled · 47 loads", icon: "trophy" },
  { id: "demo:medal", tier: "medal", name: "Mile Club III", detail: "582k / 1M", icon: "medal", medalTier: 3 },
  { id: "demo:patch", tier: "patch", name: "Mountain Mover ×4", detail: "clear 48,000 lb", icon: "mountain" },
  { id: "demo:record", tier: "record", name: "New record — Top Week", detail: "$8,100", icon: "trophy" },
];

// Order fresh awards for the pop host: takeovers first (trophy, then recap grandest-
// first, then medal), then the corner slide-ins (patch, then record).
export const newAwards = (earned: Award[], seen: Set<string>): Award[] => {
  const fresh = earned.filter((a) => !seen.has(a.id));
  const scopeRank: Record<string, number> = { year: 0, quarter: 1, month: 2 };
  const recaps = fresh
    .filter((a) => a.tier === "recap")
    .sort((a, b) => (scopeRank[a.scope ?? "month"] ?? 0) - (scopeRank[b.scope ?? "month"] ?? 0));
  return [
    ...fresh.filter((a) => a.tier === "trophy"),
    ...recaps,
    ...fresh.filter((a) => a.tier === "medal"),
    ...fresh.filter((a) => a.tier === "patch"),
    ...fresh.filter((a) => a.tier === "record"),
  ];
};
