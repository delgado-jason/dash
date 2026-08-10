import { useState, useEffect, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import type { MaintenanceItem, MaintenanceService, MaintenanceUnit } from "@/types/maintenance";
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
} from "@/lib/metrics/maintenance";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { computeDue } from "@/lib/metrics/maintenance";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ScheduleTab } from "@/components/maintenance/ScheduleTab";
import { ServicesTab } from "@/components/maintenance/ServicesTab";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";

const MaintenancePage = () => {
  const { loads } = useLoads(0);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [tab, setTab] = useState<"schedule" | "services">("schedule");
  const [serviceSignal, setServiceSignal] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
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

  const refresh = () => setRefreshKey((k) => k + 1);

  // Current mileage = the highest reading we've seen, from either loads or the
  // service log (services often carry a fresher odometer than entered loads).
  const currentMiles: Record<MaintenanceUnit, number | null> = useMemo(() => {
    // A "both" service covers this unit too; the trailer reads its hub, the
    // truck its odometer.
    const maxServiceOdo = (unit: MaintenanceUnit): number | null => {
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
    };
  }, [loads, services, fuelEntries, trips]);

  const milesPerMonth = useMemo(() => recentMilesPerMonth(loads, new Date()), [loads]);

  // The answering line: every clock's level, and the year's shop money.
  const counts = useMemo(() => {
    const c = { overdue: 0, soon: 0, ok: 0, unknown: 0 };
    const now = new Date();
    for (const i of items) c[computeDue(i, currentMiles[i.unit], now, milesPerMonth).level]++;
    return c;
  }, [items, currentMiles, milesPerMonth]);
  const ytdSpend = useMemo(() => {
    const yr = String(new Date().getUTCFullYear());
    return services
      .filter((s) => s.service_date.startsWith(yr))
      .reduce((sum, s) => sum + (s.cost ?? 0), 0);
  }, [services]);

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">MAINTENANCE</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the clocks and the log
          </span>
          <span className="flex-1" />
          <span
            className="inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px]"
            style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
            role="tablist"
          >
            {(["schedule", "services"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`px-3 rounded-md font-condensed font-semibold text-[12.5px] capitalize ${
                  tab === t ? "bg-amber text-canvas" : "text-dim hover:text-ink"
                }`}
              >
                {t}
              </button>
            ))}
          </span>
          <button
            onClick={() => {
              setTab("services");
              setServiceSignal((n) => n + 1);
            }}
            className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
            style={{
              background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
              boxShadow:
                "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
            }}
          >
            + LOG SERVICE
          </button>
        </div>

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-4">
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
            {currentMiles.tractor != null && (
              <>
                {" "}
                · tractor at{" "}
                <b className="font-semibold text-ink tabular-nums">
                  {currentMiles.tractor.toLocaleString("en-US")}
                </b>
              </>
            )}
            {currentMiles.trailer != null && (
              <>
                {" "}
                · hub at{" "}
                <b className="font-semibold text-ink tabular-nums">
                  {currentMiles.trailer.toLocaleString("en-US")}
                </b>
              </>
            )}
          </span>
        </div>

        {loading ? (
          <div className="mt-4">
            <RowsSkeleton rows={6} />
          </div>
        ) : tab === "schedule" ? (
          <ScheduleTab
            items={items}
            currentMiles={currentMiles}
            milesPerMonth={milesPerMonth}
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
