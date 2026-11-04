import { useState, useEffect, useRef } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Truck } from "@/types/truck";
import type { Trip } from "@/types/trip";
import type { Obligation } from "@/types/obligation";
import type { Driver } from "@/types/driver";
import type { Trophy } from "@/types/trophy";
import { getExpensePeriods } from "@/services/expensesService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrucks } from "@/services/trucksService";
import { getTrips } from "@/services/tripsService";
import { getObligations } from "@/services/obligationsService";
import { getDrivers } from "@/services/driversService";
import { getTrophies } from "@/services/trophyService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { getMonthlyFinancials, type MonthlyFinancialRow } from "@/services/cashflowService";
import { localToday } from "@/lib/metrics/today";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { computeGrind } from "@/lib/metrics/grind";
import { marginGoalFrom } from "@/lib/constants/targets";
import { loadNetRevenue, monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { assetLoanStatus } from "@/lib/metrics/payoff";
import { computeAllStatuses } from "@/lib/trophies/status";
import { TROPHY_CATALOG } from "@/lib/trophies/catalog";
import {
  earnedAwards,
  earnedTrophyAwards,
  newAwards,
  type Award,
} from "@/lib/metrics/awards";

// Per-device "seen" store. Earned-award facts are objective (computed from data);
// which ones a device has already celebrated is per-device — that's what lets
// Jason and Brandie each catch every award once on their own screen even though
// they share the login.
// Keyed PER IDENTITY: an identity swap on a shared device must not diff one
// user's earned set against another's baseline — that's an award storm
// (2026-08-16). The legacy device-wide store migrates to the first identity
// that reads it, so shipping this doesn't re-storm anyone.
const BASE_KEY = "dash.awards.v1";
const storeKey = (userId: string) => `${BASE_KEY}.${userId}`;
interface Store {
  baselined: boolean;
  seen: string[];
}
const read = (userId: string): Store => {
  try {
    const legacy = localStorage.getItem(BASE_KEY);
    if (legacy && !localStorage.getItem(storeKey(userId))) {
      localStorage.setItem(storeKey(userId), legacy);
      localStorage.removeItem(BASE_KEY);
    }
    const s = JSON.parse(localStorage.getItem(storeKey(userId)) || "");
    if (s && Array.isArray(s.seen)) return { baselined: !!s.baselined, seen: s.seen };
  } catch {
    /* fresh device */
  }
  return { baselined: false, seen: [] };
};
const write = (userId: string, s: Store) => {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(s));
  } catch {
    /* storage disabled — pops just won't persist */
  }
};

// Computes the awards newly earned since this device last looked. On a device's
// first-ever load it silently baselines the current set (no day-one flood), so
// only things earned AFTER that fire a celebration.
export const useAwardPops = (
  loads: Load[],
): { pops: Award[]; truckAvatarUrl: string | null } => {
  const [pops, setPops] = useState<Award[]>([]);
  const [data, setData] = useState<{
    periods: ExpensePeriod[];
    fuel: FuelEntry[];
    trucks: Truck[];
    trips: Trip[];
    obligations: Obligation[];
    trophies: Trophy[];
    drivers: Driver[];
    schedule: SettlementSchedule | null;
    financials: MonthlyFinancialRow[]; // the QBO archive — the Strong Season medal reads the graded margin
  } | null>(null);
  // Runs once per mount, once the data is in — a ref, not state, so the effect
  // never sets state synchronously (the React Compiler lint, 2026-11-04).
  const doneRef = useRef(false);

  useEffect(() => {
    Promise.all([
      getExpensePeriods(),
      getFuelEntries(),
      getTrucks(),
      getTrips(),
      getObligations(),
      getTrophies(),
      getDrivers(),
      getSettlementSchedule().catch(() => null),
      getMonthlyFinancials().catch(() => [] as MonthlyFinancialRow[]),
    ])
      .then(([periods, fuel, trucks, trips, obligations, trophies, drivers, schedule, financials]) =>
        setData({ periods, fuel, trucks, trips, obligations, trophies, drivers, schedule, financials }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!data || loads.length === 0 || doneRef.current) return;
    doneRef.current = true;

    const now = localToday(); // the local day, anchored — the same clock every page reads
    const lifetimeMiles = Math.max(
      0,
      ...data.trucks.map((t) => Number(t.current_odometer) || 0),
      maxFuelOdometer(data.fuel) ?? 0,
      ...loads.map((l) => Number(l.odometer_end) || 0),
    );
    // Break-even excludes owner draws AND on-P&L bills (those already sit in
    // operating cost) — same rule as monthlyObligationCost, kept in one place.
    const obligationsDebtMonthly = monthlyObligationCost(data.obligations);
    const grind = computeGrind(loads, data.periods, obligationsDebtMonthly, data.schedule, now);
    const truckLoan = assetLoanStatus(data.obligations, "truck", now);
    const trailerLoan = assetLoanStatus(data.obligations, "trailer", now);
    const paidPcts = [truckLoan?.ownedPct, trailerLoan?.ownedPct].filter(
      (x): x is number => x != null,
    );
    const loanPaidPct = paidPcts.length ? Math.max(...paidPcts) : null;

    const baseAwards = earnedAwards({
      loads,
      trips: data.trips,
      periods: data.periods,
      fuel: data.fuel,
      lifetimeMiles,
      obligationsDebtMonthly,
      marginGoal: marginGoalFrom(data.schedule),
      streak: grind.currentStreak,
      loanPaidPct,
      financials: data.financials,
      now,
    });

    // Trophy Hall earns, from the same status engine the Hall renders.
    const byKey: Record<string, Trophy> = {};
    for (const t of data.trophies) byKey[t.trophy_key] = t;
    const cumulativeGross = loads
      .filter((l) => l.load_status === "delivered")
      .reduce((s, l) => s + loadNetRevenue(l), 0);
    const statuses = computeAllStatuses(TROPHY_CATALOG, byKey, {
      lifetimeMiles,
      driverCount: data.drivers.filter((d) => d.active).length,
      truckCount: data.trucks.length,
      cumulativeGross,
      truckLoan,
      trailerLoan,
    });
    const earned = [
      ...earnedTrophyAwards(TROPHY_CATALOG, statuses, byKey),
      ...baseAwards,
    ];
    // Identity read at effect time — pops must diff against THIS user's own
    // baseline, never another identity's (see storeKey).
    const userId = localStorage.getItem("user_id");
    if (!userId) return;
    const currentIds = earned.map((a) => a.id);
    const store = read(userId);

    if (!store.baselined) {
      write(userId, { baselined: true, seen: currentIds }); // silent baseline
      return;
    }
    const fresh = newAwards(earned, new Set(store.seen));
    if (fresh.length > 0) {
      write(userId, { baselined: true, seen: [...new Set([...store.seen, ...currentIds])] });
      // The celebration fires a tick after the commit, never synchronously
      // inside the effect (the React Compiler lint, 2026-11-04).
      queueMicrotask(() => setPops(fresh));
    }
  }, [data, loads]);

  const truckAvatarUrl = data?.trucks.find((t) => t.avatar_url)?.avatar_url ?? null;
  return { pops, truckAvatarUrl };
};
