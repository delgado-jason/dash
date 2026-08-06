// "Am I on track to beat last quarter?" — paces the in-progress quarter against
// the PREVIOUS one. The honest engine: don't flat-pro-rate by calendar days
// (freight isn't earned evenly). Instead compare against last quarter's OWN
// curve — how far you'd got by this same point of last quarter — and project the
// finish by scaling last quarter's final by that ratio. Paces a REAL-TIME metric
// (net from delivered loads + load count), never the laggy P&L profit.
import type { Load } from "@/types/load";
import { loadRevenue } from "./rateTargets";
import { rangeFor, resolvePeriod } from "./recap";

const MS_DAY = 86_400_000;

// Net (per-load, settlement-schedule) over delivered loads delivered in
// [start, cutoff). Cumulative — pass the quarter end for a final, `now` for
// to-date, or start+elapsed for a same-point comparison.
const aggregate = (
  loads: Load[],
  start: Date,
  cutoff: Date,
): { net: number; loads: number } => {
  let net = 0;
  let n = 0;
  const s = start.getTime();
  const c = cutoff.getTime();
  for (const l of loads) {
    if (l.load_status !== "delivered" || !l.delivery_date) continue;
    const t = new Date(l.delivery_date.slice(0, 10) + "T00:00:00Z").getTime();
    if (t >= s && t < c) {
      net += loadRevenue(l);
      n++;
    }
  }
  return { net, loads: n };
};

export type PaceVerdict = "beat" | "behind" | "even" | "early" | "no-prior";

export interface QuarterPace {
  label: string; // current quarter, e.g. "Q3 2026"
  prevLabel: string; // previous quarter, e.g. "Q2 2026"
  daysElapsed: number; // day N of the quarter (1-based)
  daysTotal: number; // days in the quarter
  currentNet: number; // net from delivered loads so far this quarter
  currentLoads: number;
  prevSamePointNet: number; // prev quarter's net through the same elapsed point
  prevFinalNet: number; // prev quarter's final net
  prevFinalLoads: number;
  projectedNet: number | null; // projected finish (null while too early / no prior)
  projectedLoads: number | null;
  pacePct: number | null; // net vs prev same-point, e.g. +0.09 = 9% ahead
  verdict: PaceVerdict;
}

// Below either floor, the projection is too noisy to call — one big load swings it.
const CONFIDENCE_DAYS = 14;
const CONFIDENCE_LOADS = 3;
const EVEN_BAND = 0.02; // within ±2% of prior pace reads as "on pace"

export const getQuarterPace = (loads: Load[], now: Date): QuarterPace => {
  const cur = rangeFor(
    "quarter",
    now.getUTCFullYear(),
    Math.floor(now.getUTCMonth() / 3),
  );
  const prev = resolvePeriod("quarter", 0, now); // the completed quarter before `cur`

  const elapsedMs = Math.max(0, now.getTime() - cur.start.getTime());
  const daysTotal = Math.round((cur.end.getTime() - cur.start.getTime()) / MS_DAY);
  const daysElapsed = Math.min(daysTotal, Math.floor(elapsedMs / MS_DAY) + 1);

  const curAgg = aggregate(loads, cur.start, now);
  const prevSame = aggregate(loads, prev.start, new Date(prev.start.getTime() + elapsedMs));
  const prevFull = aggregate(loads, prev.start, prev.end);

  const hasPrior = prevFull.net > 0 || prevFull.loads > 0;

  let projectedNet: number | null = null;
  let projectedLoads: number | null = null;
  let pacePct: number | null = null;
  let verdict: PaceVerdict;

  if (!hasPrior) {
    verdict = "no-prior";
  } else if (daysElapsed < CONFIDENCE_DAYS || curAgg.loads < CONFIDENCE_LOADS) {
    verdict = "early";
  } else {
    // Loads project on a simple run-rate (a secondary number); net uses last
    // quarter's shape when we have a same-point to anchor to, else run-rate.
    projectedLoads = Math.round(curAgg.loads * (daysTotal / daysElapsed));
    if (prevSame.net > 0) {
      const ratio = curAgg.net / prevSame.net;
      pacePct = ratio - 1;
      projectedNet = prevFull.net * ratio;
    } else {
      projectedNet = curAgg.net * (daysTotal / daysElapsed);
    }
    verdict =
      projectedNet > prevFull.net * (1 + EVEN_BAND)
        ? "beat"
        : projectedNet < prevFull.net * (1 - EVEN_BAND)
          ? "behind"
          : "even";
  }

  return {
    label: cur.label,
    prevLabel: prev.label,
    daysElapsed,
    daysTotal,
    currentNet: curAgg.net,
    currentLoads: curAgg.loads,
    prevSamePointNet: prevSame.net,
    prevFinalNet: prevFull.net,
    prevFinalLoads: prevFull.loads,
    projectedNet,
    projectedLoads,
    pacePct,
    verdict,
  };
};
