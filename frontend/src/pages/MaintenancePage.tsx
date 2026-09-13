import { useState, useEffect, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import type { FuelEntry } from "@/types/fuelEntry";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrips } from "@/services/tripsService";
import type { Trip } from "@/types/trip";
import {
  currentTractorMiles,
  recentMilesPerMonth,
  maxOdometer,
  maxTripOdometer,
  computeDue,
  type CurrentReading,
} from "@/lib/metrics/maintenance";
import { apuReadings, projectApuHours, roadDayShare } from "@/lib/metrics/apuHours";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ScheduleTab } from "@/components/maintenance/ScheduleTab";
import { ServicesTab } from "@/components/maintenance/ServicesTab";
import { PrimaryButton, GhostButton } from "@/components/relationships/primitives";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const shortDay = (key: string) =>
  new Date(key + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const MaintenancePage = () => {
  const { loads } = useLoads(0);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tab, setTab] = useState<"schedule" | "services">("schedule");
  const [serviceSignal, setServiceSignal] = useState(0);
  const [addClockSignal, setAddClockSignal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  // `loading` is raised by whoever ASKS for a reload (the initial state, and
  // refresh() below) and lowered when the fetch lands — never set from inside
  // the effect body, which would cascade a second render on every mount.
  useEffect(() => {
    let active = true;
    Promise.all([
      getMaintenanceItems(),
      getMaintenanceServices(),
      getFuelEntries(),
      getTrips(),
    ])
      .then(([its, svcs, fuel, trps]) => {
        if (!active) return;
        setItems(its);
        setServices(svcs);
        setFuelEntries(fuel);
        setTrips(trps);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const refresh = () => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  };

  // The APU's meter: the newest reading we hold — off an APU invoice or a
  // fuel-up — carried forward over the road days since (decision 10).
  const apu = useMemo(
    () => projectApuHours(apuReadings(services, fuelEntries), loads, new Date()),
    [services, fuelEntries, loads],
  );
  const share = useMemo(() => roadDayShare(loads, new Date()), [loads]);

  // What each unit's meter reads now. Miles = the highest reading we've seen,
  // from either loads or the service log (services often carry a fresher
  // odometer than entered loads); the APU reads projected hours.
  const currentReading: CurrentReading = useMemo(() => {
    // A "both" service covers this unit too; the trailer reads its hub, the
    // truck its odometer. An APU service reads neither.
    const maxServiceOdo = (unit: "tractor" | "trailer"): number | null => {
      const read = (s: (typeof services)[number]) =>
        unit === "trailer" ? s.trailer_hub : s.odometer;
      return services
        .filter((s) => (s.unit === unit || s.unit === "both") && read(s) != null)
        .reduce<number | null>((max, s) => {
          const v = read(s)!;
          return max == null || v > max ? v : max;
        }, null);
    };
    // The fuel log usually carries the freshest tractor odometer, so fold its
    // latest reading in alongside loads and services.
    return {
      tractor: maxOdometer(
        currentTractorMiles(loads),
        maxServiceOdo("tractor"),
        maxFuelOdometer(fuelEntries),
        maxTripOdometer(trips),
      ),
      trailer: maxOdometer(maxServiceOdo("trailer")),
      apu: apu.hours,
      apuEstimated: apu.estimated,
    };
  }, [loads, services, fuelEntries, trips, apu]);

  const milesPerMonth = useMemo(() => recentMilesPerMonth(loads, new Date()), [loads]);

  // The answering line: every clock's level, and the year's shop money.
  const counts = useMemo(() => {
    const c = { overdue: 0, soon: 0, ok: 0, unknown: 0 };
    const now = new Date();
    for (const i of items)
      c[
        computeDue(
          i,
          i.unit === "apu" ? null : currentReading[i.unit],
          now,
          milesPerMonth,
          {
            currentHours: i.unit === "apu" ? currentReading.apu : null,
            hoursPerRoadDay: apu.rate,
            roadDayShare: share,
          },
        ).level
      ]++;
    return c;
  }, [items, currentReading, milesPerMonth, apu.rate, share]);
  const ytdSpend = useMemo(() => {
    const yr = String(new Date().getUTCFullYear());
    return services
      .filter((s) => s.service_date.startsWith(yr))
      .reduce((sum, s) => sum + (s.cost ?? 0), 0);
  }, [services]);

  // "truck 568,737 mi · trailer hub 456,123 · APU ~1,240 hrs · est. from road
  // days since Sep 3". The ~ and the estimate clause appear only when the APU
  // number is projected; with no reading at all it says so outright.
  const subLine = useMemo(() => {
    const parts: string[] = [];
    parts.push(
      currentReading.tractor != null
        ? `truck ${num(currentReading.tractor)} mi`
        : "truck — mi",
    );
    parts.push(
      currentReading.trailer != null
        ? `trailer hub ${num(currentReading.trailer)}`
        : "trailer hub —",
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
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">MAINTENANCE</h1>
          <span className="font-condensed font-medium text-[13.5px] text-dim tabular-nums">
            {subLine}
          </span>
          <span className="flex-1" />
          <PrimaryButton
            onClick={() => {
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
          style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={tab === "schedule"}
            onClick={() => setTab("schedule")}
            className={`px-3 rounded-md font-condensed font-semibold text-[12.5px] ${
              tab === "schedule" ? "bg-amber text-canvas" : "text-dim hover:text-ink"
            }`}
          >
            Schedule
          </button>
          <button
            role="tab"
            aria-selected={tab === "services"}
            onClick={() => setTab("services")}
            className={`px-3 rounded-md font-condensed font-semibold text-[12.5px] ${
              tab === "services" ? "bg-amber text-canvas" : "text-dim hover:text-ink"
            }`}
          >
            Services · {services.length}
          </button>
        </span>

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-3">
          <span className="font-display text-[21px] tracking-[.03em] tabular-nums">
            {items.length} CLOCK{items.length === 1 ? "" : "S"}
          </span>
          {counts.overdue > 0 && (
            <span className="font-condensed font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-[#e05252] border border-[rgba(224,82,82,.35)] bg-[rgba(224,82,82,.08)]">
              {counts.overdue} OVERDUE
            </span>
          )}
          {counts.soon > 0 && (
            <span className="font-condensed font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-amber-hi border border-[rgba(232,148,10,.35)] bg-[rgba(232,148,10,.08)]">
              {counts.soon} CLOSE
            </span>
          )}
          {counts.ok > 0 && (
            <span className="font-condensed font-bold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-[#6fd08c] border border-[rgba(111,208,140,.3)] bg-[rgba(111,208,140,.06)]">
              {counts.ok} RUNNING
            </span>
          )}
          {counts.unknown > 0 && (
            <span className="font-condensed font-semibold text-[11px] tracking-[.1em] px-[10px] py-[3px] rounded-full text-faint border border-dashed border-hairline">
              {counts.unknown} NO BASELINE
            </span>
          )}
          <span className="font-condensed text-[13px] text-faint">
            · <b className="font-semibold text-ink">${Math.round(ytdSpend).toLocaleString("en-US")}</b>{" "}
            spent this year
          </span>
        </div>

        {loading ? (
          <div className="mt-4">
            <RowsSkeleton rows={6} />
          </div>
        ) : tab === "schedule" ? (
          <ScheduleTab
            items={items}
            currentReading={currentReading}
            milesPerMonth={milesPerMonth}
            apu={apu}
            roadDayShare={share}
            addSignal={addClockSignal}
            onChange={refresh}
          />
        ) : (
          <ServicesTab
            items={items}
            services={services}
            onChange={refresh}
            openSignal={serviceSignal}
          />
        )}
      </div>
    </div>
  );
};

export default MaintenancePage;
