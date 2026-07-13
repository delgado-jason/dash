import { useState, useEffect } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Truck } from "@/types/truck";
import type { Obligation } from "@/types/obligation";
import type { Driver } from "@/types/driver";
import type { Trophy } from "@/types/trophy";
import { getExpensePeriods } from "@/services/expensesService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrucks } from "@/services/trucksService";
import { getObligations } from "@/services/obligationsService";
import { getDrivers } from "@/services/driversService";
import { getTrophies } from "@/services/trophyService";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { computeGrind } from "@/lib/metrics/grind";
import { loadRevenue } from "@/lib/metrics/rateTargets";
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
const KEY = "dash.awards.v1";
interface Store {
  baselined: boolean;
  seen: string[];
}
const read = (): Store => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "");
    if (s && Array.isArray(s.seen)) return { baselined: !!s.baselined, seen: s.seen };
  } catch {
    /* fresh device */
  }
  return { baselined: false, seen: [] };
};
const write = (s: Store) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
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
    obligations: Obligation[];
    trophies: Trophy[];
    drivers: Driver[];
  } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([
      getExpensePeriods(),
      getFuelEntries(),
      getTrucks(),
      getObligations(),
      getTrophies(),
      getDrivers(),
    ])
      .then(([periods, fuel, trucks, obligations, trophies, drivers]) =>
        setData({ periods, fuel, trucks, obligations, trophies, drivers }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!data || loads.length === 0 || done) return;
    setDone(true);

    const now = new Date();
    const lifetimeMiles = Math.max(
      0,
      ...data.trucks.map((t) => Number(t.current_odometer) || 0),
      maxFuelOdometer(data.fuel) ?? 0,
      ...loads.map((l) => Number(l.odometer_end) || 0),
    );
    const obligationsDebtMonthly = data.obligations
      .filter((o) => o.active && !o.is_draw)
      .reduce((s, o) => s + Number(o.amount), 0);
    const obligationsAllActive = data.obligations
      .filter((o) => o.active)
      .reduce((s, o) => s + Number(o.amount), 0);
    const grind = computeGrind(loads, data.periods, obligationsAllActive, now);

    const baseAwards = earnedAwards({
      loads,
      periods: data.periods,
      fuel: data.fuel,
      lifetimeMiles,
      obligationsDebtMonthly,
      streak: grind.currentStreak,
      now,
    });

    // Trophy Hall earns, from the same status engine the Hall renders.
    const byKey: Record<string, Trophy> = {};
    for (const t of data.trophies) byKey[t.trophy_key] = t;
    const cumulativeGross = loads
      .filter((l) => l.load_status === "delivered")
      .reduce((s, l) => s + loadRevenue(l), 0);
    const statuses = computeAllStatuses(TROPHY_CATALOG, byKey, {
      lifetimeMiles,
      driverCount: data.drivers.filter((d) => d.active).length,
      truckCount: data.trucks.length,
      cumulativeGross,
      truckLoan: assetLoanStatus(data.obligations, "truck", now),
      trailerLoan: assetLoanStatus(data.obligations, "trailer", now),
    });
    const earned = [
      ...earnedTrophyAwards(TROPHY_CATALOG, statuses, byKey),
      ...baseAwards,
    ];
    const currentIds = earned.map((a) => a.id);
    const store = read();

    if (!store.baselined) {
      write({ baselined: true, seen: currentIds }); // silent baseline
      return;
    }
    const fresh = newAwards(earned, new Set(store.seen));
    if (fresh.length > 0) {
      write({ baselined: true, seen: [...new Set([...store.seen, ...currentIds])] });
      setPops(fresh);
    }
  }, [data, loads, done]);

  const truckAvatarUrl = data?.trucks.find((t) => t.avatar_url)?.avatar_url ?? null;
  return { pops, truckAvatarUrl };
};
