// Earn-detection for the trophy hall. Manual trophies come straight from the
// stored record's `earned` flag; the data-driven ones compute from lifetime
// miles / fleet size / cumulative gross; Highway Legend is the capstone —
// earned only when own authority, free-and-clear, and the million miles are all
// done.
import type { TrophyDef } from "./catalog";
import type { Trophy } from "@/types/trophy";

export interface TrophyStatus {
  earned: boolean;
  progress: number | null; // 0..1 for the data-driven ones; null for yes/no
  progressLabel: string | null;
}

// A tracked loan/lease against an asset — drives the paid-off trophies.
export interface LoanStatus {
  paidOff: boolean;
  ownedPct: number | null; // 0..1 owned so far
  owed: number;
}

export interface TrophyStatusData {
  lifetimeMiles: number;
  driverCount: number;
  truckCount: number;
  cumulativeGross: number;
  truckLoan?: LoanStatus | null; // null/absent = no truck loan tracked
  trailerLoan?: LoanStatus | null;
}

const MI = (n: number) => `${Math.round(n / 1000)}K`;
const K = (n: number) => `$${Math.round(n / 1000)}k`;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

// Paid-off trophies earn either manually (owned outright, no loan tracked) OR the
// moment the tracked loan balance reaches $0. When a loan IS tracked, its balance
// drives the progress bar toward free-and-clear.
const loanTrophy = (
  record: Trophy | undefined,
  loan: LoanStatus | null | undefined,
): TrophyStatus => {
  if (record?.earned) return { earned: true, progress: null, progressLabel: null };
  if (!loan) return { earned: false, progress: null, progressLabel: null };
  return {
    earned: loan.paidOff,
    progress: loan.ownedPct,
    progressLabel: loan.paidOff ? "Paid off" : `${K(loan.owed)} to go`,
  };
};

const one = (
  def: TrophyDef,
  record: Trophy | undefined,
  d: TrophyStatusData,
  earnedByKey: Record<string, boolean>,
): TrophyStatus => {
  switch (def.key) {
    case "million-mile-club":
      return {
        earned: d.lifetimeMiles >= 1_000_000,
        progress: clamp(d.lifetimeMiles / 1_000_000),
        progressLabel: `${MI(d.lifetimeMiles)} / 1M mi`,
      };
    case "second-driver":
      return { earned: d.driverCount >= 2, progress: clamp(d.driverCount / 2), progressLabel: `${d.driverCount} of 2 drivers` };
    case "second-truck":
      return { earned: d.truckCount >= 2, progress: clamp(d.truckCount / 2), progressLabel: `${d.truckCount} of 2 trucks` };
    case "five-truck-fleet":
      return { earned: d.truckCount >= 5, progress: clamp(d.truckCount / 5), progressLabel: `${d.truckCount} of 5 trucks` };
    case "one-million-hauled":
      return {
        earned: d.cumulativeGross >= 1_000_000,
        progress: clamp(d.cumulativeGross / 1_000_000),
        progressLabel: `${K(d.cumulativeGross)} / $1M`,
      };
    case "free-and-clear":
      return loanTrophy(record, d.truckLoan);
    case "trailer-paid-off":
      return loanTrophy(record, d.trailerLoan);
    case "highway-legend": {
      const done = [
        earnedByKey["own-authority"],
        earnedByKey["free-and-clear"],
        earnedByKey["million-mile-club"],
      ].filter(Boolean).length;
      return { earned: done === 3, progress: done / 3, progressLabel: `${done} of 3 milestones` };
    }
    default:
      // manual: owner-operator, own-authority, free-and-clear, trailer-paid-off
      return { earned: record?.earned ?? false, progress: null, progressLabel: null };
  }
};

export const computeAllStatuses = (
  catalog: TrophyDef[],
  recordsByKey: Record<string, Trophy>,
  data: TrophyStatusData,
): Record<string, TrophyStatus> => {
  const out: Record<string, TrophyStatus> = {};
  const earnedByKey: Record<string, boolean> = {};

  // Pass 1: everything except the capstone (which depends on the others).
  for (const def of catalog)
    if (def.kind !== "capstone") {
      const s = one(def, recordsByKey[def.key], data, {});
      out[def.key] = s;
      earnedByKey[def.key] = s.earned;
    }
  // Pass 2: the capstone.
  for (const def of catalog)
    if (def.kind === "capstone")
      out[def.key] = one(def, recordsByKey[def.key], data, earnedByKey);

  return out;
};
