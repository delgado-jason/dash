import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { FuelEntry } from "@/types/fuelEntry";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import type { Truck } from "@/types/truck";
import type { Load } from "@/types/load";
import { useLoads } from "@/hooks/useLoads";
import { getFuelEntries } from "@/services/fuelService";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getTrucks } from "@/services/trucksService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { useSplitToday } from "@/hooks/useSplitToday";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { useLocation } from "react-router-dom";
import {
  computeRecap,
  resolvePeriod,
  latestRecapWithData,
  type RecapScope,
  type RecapRange,
} from "@/lib/metrics/recap";
import { monthlyObligationCost } from "@/lib/metrics/rateTargets";
import { useLocalToday } from "@/hooks/useLocalToday";
import { careerRank } from "@/lib/metrics/playerCard";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { RecapPoster } from "@/components/recap/RecapPoster";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { isDelivered } from "@/lib/metrics/status";

const SCOPES: { key: RecapScope; label: string }[] = [
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];

const hasData = (loads: Load[], r: RecapRange): boolean =>
  loads.some((l) => {
    if (!isDelivered(l) || !l.delivery_date) return false;
    const t = new Date(l.delivery_date.slice(0, 10) + "T00:00:00Z").getTime();
    return t >= r.start.getTime() && t < r.end.getTime();
  });

const RecapPage = () => {
  const { loads } = useLoads(0);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  const split = useSplitToday(); // the pay split in force today (NET-01)
  const location = useLocation();
  const navScope = (location.state as { scope?: RecapScope } | null)?.scope;
  const [scope, setScope] = useState<RecapScope>(navScope ?? "month");
  const [ago, setAgo] = useState(0);
  // Once loads arrive, land on the grandest FINISHED period that has data (unless
  // a ceremony pop already told us which scope to open). Set-once, then the user
  // is free to switch scopes.
  const [autoScoped, setAutoScoped] = useState(!!navScope);

  // A failed fetch is named with a Retry — the poster is never drawn from a
  // book that is missing its fuel, P&L, notes, trucks or schedule (NET-03).
  const [failed, setFailed] = useState<string[]>([]);
  const [fetchKey, setFetchKey] = useState(0);
  useEffect(() => {
    let active = true;
    const note = (what: string) => {
      if (active) setFailed((f) => (f.includes(what) ? f : [...f, what]));
    };
    const ok = (what: string) => {
      if (active) setFailed((f) => f.filter((w) => w !== what));
    };
    getFuelEntries().then((v) => { if (active) setFuel(v); ok("the fuel log"); }).catch(() => note("the fuel log"));
    getExpensePeriods().then((v) => { if (active) setPeriods(v); ok("the P&L"); }).catch(() => note("the P&L"));
    getObligations().then((v) => { if (active) setObligations(v); ok("the obligations"); }).catch(() => note("the obligations"));
    getTrucks().then((v) => { if (active) setTrucks(v); ok("the trucks"); }).catch(() => note("the trucks"));
    getSettlementSchedule().then((v) => { if (active) setSchedule(v); ok("the settlement schedule"); }).catch(() => note("the settlement schedule"));
    return () => {
      active = false;
    };
  }, [fetchKey]);

  // The operator's local day, anchored, rolling at midnight (call 13).
  const now = useLocalToday();
  useEffect(() => {
    if (autoScoped || loads.length === 0) return;
    const latest = latestRecapWithData(loads, now);
    if (latest) setScope(latest.scope);
    setAutoScoped(true);
  }, [loads, autoScoped, now]);

  const range = resolvePeriod(scope, ago, now);
  const obligationsMonthly = monthlyObligationCost(obligations);

  const stats = useMemo(
    () => computeRecap(loads, fuel, periods, obligationsMonthly, range, scope, now, schedule, split),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loads, fuel, periods, obligationsMonthly, range.label, scope, schedule, split, now],
  );

  const truckAvatarUrl = trucks.find((t) => t.avatar_url)?.avatar_url ?? null;
  const lifetimeMiles = Math.max(
    0,
    ...trucks.map((t) => Number(t.current_odometer) || 0),
    maxFuelOdometer(fuel) ?? 0,
    ...loads.map((l) => Number(l.odometer_end) || 0),
  );
  const rank = careerRank(lifetimeMiles).name;
  const canNext = ago > 0;
  const canPrev = hasData(loads, resolvePeriod(scope, ago + 1, now));

  const pick = (s: RecapScope) => {
    setScope(s);
    setAgo(0);
  };

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <h1 className="text-3xl font-condensed">Recap</h1>
        <SegmentedTabs
          ariaLabel="Recap period"
          tabs={SCOPES.map((s) => ({ value: s.key, label: s.label }))}
          value={scope}
          onChange={pick}
        />
      </div>

      <div className="flex items-center justify-center gap-4 mb-4">
        <button
          onClick={() => canPrev && setAgo(ago + 1)}
          disabled={!canPrev}
          className="text-muted-text disabled:opacity-30 hover:text-light"
          aria-label="Earlier"
        >
          <ChevronLeft size={22} />
        </button>
        <span className="font-condensed text-lg w-32 text-center">{range.label}</span>
        <button
          onClick={() => canNext && setAgo(ago - 1)}
          disabled={!canNext}
          className="text-muted-text disabled:opacity-30 hover:text-light"
          aria-label="Later"
        >
          <ChevronRight size={22} />
        </button>
      </div>

      {failed.length > 0 ? (
        <FetchFailed
          className="text-center mt-10"
          what={failed.join(", ").replace(/, ([^,]*)$/, " and $1")}
          onRetry={() => setFetchKey((k) => k + 1)}
        />
      ) : stats.loads === 0 ? (
        <p className="text-center text-muted-text mt-10">
          No runs logged for {range.label}.
        </p>
      ) : (
        <RecapPoster
          stats={stats}
          rank={rank}
          truckAvatarUrl={scope === "year" ? truckAvatarUrl : null}
        />
      )}
    </div>
  );
};

export default RecapPage;
