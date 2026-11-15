import { useState, useEffect, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import type { MaintenanceItem, MaintenanceService, ServiceUnit } from "@/types/maintenance";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import type { ExpensePeriod } from "@/types/expense";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrips } from "@/services/tripsService";
import { getTrucks } from "@/services/trucksService";
import { getExpensePeriods } from "@/services/expensesService";
import {
  getPlans,
  getAccounts,
  getSnapshots,
  type PlanRow,
  type AccountRow,
  type SnapshotRow,
} from "@/services/planService";
import {
  currentTractorMiles,
  recentMilesPerMonth,
  maxOdometer,
  maxTripOdometer,
  computeDue,
  type CurrentReading,
} from "@/lib/metrics/maintenance";
import { apuReadings, projectApuHours, roadDayShare, roadDaysSince } from "@/lib/metrics/apuHours";
import {
  lastVisitByItem,
  dueWithin,
  booksVsLog,
  shopDays,
  maintenanceBucket,
  baselineAssumed,
  meterPrompt,
} from "@/lib/metrics/maintenanceMoney";
import { truckReadings } from "@/lib/metrics/trailerMeter";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { localDayKey } from "@/lib/relationships/dayKeys";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ScheduleTab, type ScheduleRow } from "@/components/maintenance/ScheduleTab";
import { ServicesTab } from "@/components/maintenance/ServicesTab";
import type { ServicePrefill } from "@/components/maintenance/LogServiceSheet";
import { PrimaryButton, GhostButton } from "@/components/relationships/primitives";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";
import { money } from "@/lib/format";

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const shortDay = (key: string) =>
  new Date(key + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// The nine feeds this page reads, by the name a failure is reported under.
// Nothing fails silently: a feed that did not come through is named on the
// page with what it would have shown.
const FEEDS = [
  "the clocks",
  "the log",
  "the fuel log",
  "the trips",
  "the truck",
  "the P&L",
  "the plan",
  "the accounts",
  "the snapshots",
] as const;

const MaintenancePage = () => {
  const { loads } = useLoads(0);
  const targets = useRateTargets(loads);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [tab, setTab] = useState<"schedule" | "services">("schedule");
  const [serviceSignal, setServiceSignal] = useState(0);
  const [addClockSignal, setAddClockSignal] = useState(0);
  // The Done door's hand-off: the clock to tick, the unit, the newest reading.
  const [prefill, setPrefill] = useState<ServicePrefill | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // `loading` is raised by whoever ASKS for a reload (the initial state, and
  // refresh() below) and lowered when the fetch lands — never set from inside
  // the effect body, which would cascade a second render on every mount.
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      getMaintenanceItems(),
      getMaintenanceServices(),
      getFuelEntries(),
      getTrips(),
      getTrucks(),
      getExpensePeriods(),
      getPlans(),
      getAccounts(),
      getSnapshots(),
    ]).then((r) => {
      if (!active) return;
      const ok = <T,>(i: number, fallback: T): T =>
        r[i].status === "fulfilled" ? ((r[i] as PromiseFulfilledResult<T>).value) : fallback;
      setItems(ok<MaintenanceItem[]>(0, []));
      setServices(ok<MaintenanceService[]>(1, []));
      setFuelEntries(ok<FuelEntry[]>(2, []));
      setTrips(ok<Trip[]>(3, []));
      setTrucks(ok<Truck[]>(4, []));
      setPeriods(ok<ExpensePeriod[]>(5, []));
      setPlans(ok<PlanRow[]>(6, []));
      setAccounts(ok<AccountRow[]>(7, []));
      setSnapshots(ok<SnapshotRow[]>(8, []));
      setFailed(FEEDS.filter((_, i) => r[i].status === "rejected"));
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const refresh = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  const now = useMemo(() => new Date(), [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The APU's meter: the newest reading we hold — off an APU invoice or a
  // fuel-up — carried forward over the road days since (decision 10).
  const apu = useMemo(
    () => projectApuHours(apuReadings(services, fuelEntries), loads, now),
    [services, fuelEntries, loads, now],
  );
  const share = useMemo(() => roadDayShare(loads, now), [loads, now]);

  // What each unit's meter reads now. Miles = the highest reading we've seen,
  // from either loads or the service log (services often carry a fresher
  // odometer than entered loads); the APU reads projected hours.
  const currentReading: CurrentReading = useMemo(() => {
    // A "both" service covers the truck too; an APU service reads neither.
    const maxServiceOdo = (): number | null =>
      services
        .filter((s) => (s.unit === "tractor" || s.unit === "both") && s.odometer != null)
        .reduce<number | null>((max, s) => {
          const v = s.odometer!;
          return max == null || v > max ? v : max;
        }, null);
    // The fuel log usually carries the freshest tractor odometer, so fold its
    // latest reading in alongside loads and services.
    // The trailer reads the truck's odometer, by rule (GL-07): one number.
    const tractor = maxOdometer(
      currentTractorMiles(loads),
      maxServiceOdo(),
      maxFuelOdometer(fuelEntries),
      maxTripOdometer(trips),
    );
    return {
      tractor,
      trailer: tractor,
      apu: apu.hours,
      apuEstimated: apu.estimated,
    };
  }, [loads, services, fuelEntries, trips, apu]);

  // Every dated reading of the truck's odometer — the trailer's meter, by rule.
  const readings = useMemo(
    () => truckReadings(fuelEntries, loads, trips, services),
    [fuelEntries, loads, trips, services],
  );

  const milesPerMonth = useMemo(() => recentMilesPerMonth(loads, now), [loads, now]);

  // The visit that last did each clock — "last time", priced as the visit.
  const lastVisits = useMemo(() => lastVisitByItem(services), [services]);

  // The truck's in-service day: the baseline a clock that was never logged
  // can be ASSUMED to start from (the sheet's call 3), marked until a service
  // replaces it. One truck on the book; with more, the clock's own truck.
  const inServiceDay = useMemo(() => {
    const active = trucks.filter((t) => t.in_service_date);
    return active.length === 1 ? String(active[0].in_service_date).slice(0, 10) : null;
  }, [trucks]);

  // Every clock graded ONCE, here, and handed to both tabs and the plate.
  const rows = useMemo<ScheduleRow[]>(
    () =>
      items.map((item) => ({
        item,
        due: computeDue(
          item,
          item.unit === "apu" ? null : currentReading[item.unit],
          now,
          milesPerMonth,
          {
            currentHours: item.unit === "apu" ? currentReading.apu : null,
            hoursPerRoadDay: apu.rate,
            roadDayShare: share,
          },
        ),
        // Only an APU row reads a projected meter, and only then when a road
        // day has passed since the reading.
        estimated: item.unit === "apu" && currentReading.apuEstimated,
        assumed: baselineAssumed(item, inServiceDay, lastVisits),
      })),
    [items, currentReading, now, milesPerMonth, apu.rate, share, inServiceDay, lastVisits],
  );

  // The answering line: every clock's level, and the year's shop money.
  const counts = useMemo(() => {
    const c = { overdue: 0, soon: 0, ok: 0, unknown: 0 };
    for (const r of rows) c[r.due.level]++;
    return c;
  }, [rows]);
  const year = now.getUTCFullYear();
  const ytdSpend = useMemo(() => {
    const yr = String(year);
    return services
      .filter((s) => s.service_date.startsWith(yr))
      .reduce((sum, s) => sum + (s.cost ?? 0), 0);
  }, [services, year]);

  // The money (the Maintenance sheet, calls 1, 2, 5 and feature 7).
  const next = useMemo(() => dueWithin(rows, lastVisits, now, 90), [rows, lastVisits, now]);
  const books = useMemo(() => booksVsLog(periods, services, year, now), [periods, services, year, now]);
  const dayTarget = targets.gross?.dailyTargetCalendar ?? null;
  const shop = useMemo(() => shopDays(trips, year, dayTarget), [trips, year, dayTarget]);
  const bucket = useMemo(() => maintenanceBucket(accounts, snapshots), [accounts, snapshots]);
  const floor = useMemo(() => {
    const plan = plans.find((p) => p.active) ?? plans[0];
    const f = plan?.maintenance_floor;
    return f == null || f === "" ? null : Number(f);
  }, [plans]);

  // "Read the meter" — when the projection has carried too long, or an APU
  // clock is close on projected hours (the sheet's feature 6).
  const prompt = useMemo(
    () =>
      meterPrompt(
        apu,
        roadDaysSince(loads, apu.readOn, now),
        rows.filter((r) => r.item.unit === "apu"),
      ),
    [apu, loads, now, rows],
  );

  // The Done door: open Log service with this clock ticked, its unit set,
  // today's date and the newest reading in the box. An APU clock gets the
  // meter only when it was READ today — a projection is never pre-filled as
  // a reading.
  const logDone = (item: MaintenanceItem) => {
    const unit: ServiceUnit = item.unit;
    setPrefill({
      unit,
      service_date: localDayKey(now),
      odometer: unit === "apu" ? null : currentReading.tractor,
      apu_hours: unit === "apu" && apu.hours != null && !apu.estimated ? apu.hours : null,
      item_ids: [item.item_id],
    });
    setTab("services");
  };

  // "truck 614,438 mi · trailer 614,438 (truck odometer) · APU ~14,000 hrs ·
  // est. from road days since Oct 7". The ~ and the estimate clause appear
  // only when the APU number is projected; with no reading it says so.
  const subLine = useMemo(() => {
    const parts: string[] = [];
    parts.push(
      currentReading.tractor != null
        ? `truck ${num(currentReading.tractor)} mi`
        : "truck — mi",
    );
    parts.push(
      currentReading.trailer != null
        ? `trailer ${num(currentReading.trailer)} (truck odometer)`
        : "trailer — (truck odometer)",
    );
    if (apu.hours == null) parts.push("APU — hrs · needs a reading");
    else {
      parts.push(`APU ${apu.estimated ? "~" : ""}${num(apu.hours)} hrs`);
      if (apu.estimated && apu.readOn)
        parts.push(`est. from road days since ${shortDay(apu.readOn)}`);
    }
    return parts.join(" · ");
  }, [currentReading, apu]);

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[28px] tracking-[.06em] leading-none">MAINTENANCE</h1>
          <span className="font-condensed font-medium text-[14.5px] text-dim tabular-nums">
            {subLine}
          </span>
          <span className="flex-1" />
          <PrimaryButton
            onClick={() => {
              setPrefill(null);
              setTab("services");
              setServiceSignal((n) => n + 1);
            }}
          >
            Log service
          </PrimaryButton>
          {/* The second door on this page: a clock you keep yourself. It sits
              beside "Log service" because both are things you DO here — the
              due-next plate above is a readout, not a toolbar. */}
          <GhostButton
            onClick={() => {
              setTab("schedule");
              setAddClockSignal((n) => n + 1);
            }}
          >
            + Add clock
          </GhostButton>
        </div>

        <span
          className="inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px] mt-4"
          style={{ boxShadow: "var(--shadow-inset)" }}
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={tab === "schedule"}
            onClick={() => setTab("schedule")}
            className={`px-3 rounded-md font-condensed font-semibold text-[13.5px] ${
              tab === "schedule" ? "bg-amber text-canvas" : "text-dim hover:text-ink"
            }`}
          >
            Schedule
          </button>
          <button
            role="tab"
            aria-selected={tab === "services"}
            onClick={() => setTab("services")}
            className={`px-3 rounded-md font-condensed font-semibold text-[13.5px] ${
              tab === "services" ? "bg-amber text-canvas" : "text-dim hover:text-ink"
            }`}
          >
            The log
          </button>
        </span>

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-3" data-testid="answering-line">
          <span className="font-condensed font-semibold text-[22.5px] tabular-nums">
            {items.length} CLOCK{items.length === 1 ? "" : "S"}
          </span>
          {counts.overdue > 0 && (
            <span className="font-condensed font-bold text-[12px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-status-negative-text border border-status-negative-text/35 bg-status-negative-text/8">
              {counts.overdue} OVERDUE
            </span>
          )}
          {counts.soon > 0 && (
            <span className="font-condensed font-bold text-[12px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-amber-hi border border-amber/35 bg-amber/8">
              {counts.soon} CLOSE
            </span>
          )}
          {counts.ok > 0 && (
            <span className="font-condensed font-bold text-[12px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-status-positive-text border border-status-positive-text/30 bg-status-positive-text/6">
              {counts.ok} RUNNING
            </span>
          )}
          {counts.unknown > 0 && (
            <span className="font-condensed font-semibold text-[12px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-faint border border-dashed border-hairline">
              {counts.unknown} NO BASELINE
            </span>
          )}
          {/* The year's shop money as the PAIR — what you logged, what the
              books say — because the log alone read as the truth and was
              three-quarters of it (the sheet's finding 5). */}
          <span className="font-condensed text-[14px] text-faint">
            · <b className="font-semibold text-ink">{money(ytdSpend)}</b> logged this year
            {books.filedMonths > 0 ? (
              <>
                {" "}
                ·{" "}
                <button
                  type="button"
                  onClick={() => setTab("services")}
                  className="text-amber-hi hover:text-hot"
                >
                  the books say {money(books.books)} ›
                </button>
              </>
            ) : (
              <> · no P&amp;L filed this year</>
            )}
          </span>
        </div>

        {failed.length > 0 && (
          <p className="font-condensed text-[13px] text-amber-hi mt-2" data-testid="feeds-failed">
            {failed.join(", ")} didn't come through — the figures that read them are blank, not zero.{" "}
            <button type="button" onClick={refresh} className="underline underline-offset-2">
              Retry
            </button>
          </p>
        )}

        {loading ? (
          <div className="mt-4">
            <RowsSkeleton rows={6} />
          </div>
        ) : tab === "schedule" ? (
          <ScheduleTab
            rows={rows}
            currentReading={currentReading}
            milesPerMonth={milesPerMonth}
            apu={apu}
            lastVisits={lastVisits}
            next={next}
            bucket={bucket}
            floor={floor}
            inServiceDay={inServiceDay}
            prompt={prompt}
            addSignal={addClockSignal}
            onChange={refresh}
            onDone={logDone}
          />
        ) : (
          <ServicesTab
            items={items}
            services={services}
            readings={readings}
            books={books}
            shop={shop}
            onChange={refresh}
            openSignal={serviceSignal}
            prefill={prefill}
            onPrefillUsed={() => setPrefill(null)}
          />
        )}
      </div>
    </div>
  );
};

export default MaintenancePage;
