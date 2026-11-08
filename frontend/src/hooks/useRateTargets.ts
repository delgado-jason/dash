import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import type { Trip } from "@/types/trip";
import { getTrips } from "@/services/tripsService";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getSettlementSplits } from "@/services/settlementSplitService";
import { splitInForce } from "@/lib/metrics/splits";
import { localDayKey } from "@/lib/metrics/today";
import type { SettlementSplit } from "@/types/settlementSplit";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { computeRateTargets, monthlyObligationCost, type RateTargets } from "@/lib/metrics/rateTargets";
import { useLocalToday } from "./useLocalToday";

// THE one basis lives in lib/metrics/rateTargets (computeRateTargets) since
// 2026-11-04, so the metric modules can share it; re-exported here for the
// pages that import it from the hook file.
export { computeRateTargets, type RateTargets };

// Assembles the rate ladder + weekly/daily pace targets from the P&L,
// obligations, and loads. Break-even is blended over the last BASIS_MONTHS
// complete months (see getCostBasis); everything hangs off that true cost.
// `now` is the operator's local day, and it rolls at midnight (call 13).
export const useRateTargets = (loads: Load[]) => {
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  // The trip log — home and shop miles join the basis's odometer union (BASIS-07).
  const [trips, setTrips] = useState<Trip[]>([]);
  // The dated pay splits — the one in force today hands the basis its linehaul take (NET-01).
  const [splits, setSplits] = useState<SettlementSplit[]>([]);
  const now = useLocalToday();

  useEffect(() => {
    let active = true;
    Promise.all([
      getExpensePeriods().catch(() => [] as ExpensePeriod[]),
      getObligations().catch(() => [] as Obligation[]),
      getSettlementSchedule().catch(() => null),
      getTrips().catch(() => [] as Trip[]),
      getSettlementSplits().catch(() => [] as SettlementSplit[]),
    ]).then(([ps, obs, sch, ts, sp]) => {
      if (!active) return;
      setPeriods(ps);
      setObligations(obs);
      setSchedule(sch);
      setTrips(ts);
      setSplits(sp);
    });
    return () => {
      active = false;
    };
  }, []);

  const obligationsMonthly = useMemo(
    () => monthlyObligationCost(obligations),
    [obligations],
  );

  const split = useMemo(() => splitInForce(splits, localDayKey(now)), [splits, now]);

  return useMemo(
    () => computeRateTargets(loads, periods, obligationsMonthly, schedule, now, trips, split),
    [periods, obligationsMonthly, loads, schedule, now, trips, split],
  );
};
