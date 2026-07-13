import { useState, useEffect, useMemo } from "react";
import { useLoads } from "@/hooks/useLoads";
import type { MaintenanceItem, MaintenanceService, MaintenanceUnit } from "@/types/maintenance";
import type { FuelEntry } from "@/types/fuelEntry";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { getFuelEntries } from "@/services/fuelService";
import {
  currentTractorMiles,
  recentMilesPerMonth,
  maxOdometer,
} from "@/lib/metrics/maintenance";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { ScheduleTab } from "@/components/maintenance/ScheduleTab";
import { ServicesTab } from "@/components/maintenance/ServicesTab";

const MaintenancePage = () => {
  const { loads } = useLoads(0);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [tab, setTab] = useState<"schedule" | "services">("schedule");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getMaintenanceItems(),
      getMaintenanceServices(),
      getFuelEntries(),
    ])
      .then(([its, svcs, fuel]) => {
        if (!active) return;
        setItems(its);
        setServices(svcs);
        setFuelEntries(fuel);
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
      ),
      trailer: maxOdometer(maxServiceOdo("trailer")),
    };
  }, [loads, services, fuelEntries]);

  const milesPerMonth = useMemo(() => recentMilesPerMonth(loads, new Date()), [loads]);

  const tabBtn = (key: "schedule" | "services", label: string) => (
    <button
      onClick={() => setTab(key)}
      className={`px-3 py-2 text-sm border-b-2 ${
        tab === key
          ? "border-amber text-light font-medium"
          : "border-transparent text-muted-text"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <h1 className="text-3xl font-condensed mb-1">Maintenance</h1>
      <p className="text-xs text-muted-text mb-4">
        Tractor 580991 · International LT625 / Cummins X15 · Trailer 780991
        {currentMiles.tractor != null &&
          ` · ${currentMiles.tractor.toLocaleString("en-US")} mi`}
      </p>

      <div className="flex gap-1 border-b border-steel mb-5">
        {tabBtn("schedule", "Schedule")}
        {tabBtn("services", "Services")}
      </div>

      {loading ? (
        <p className="text-muted-text">Loading...</p>
      ) : tab === "schedule" ? (
        <ScheduleTab
          items={items}
          currentMiles={currentMiles}
          milesPerMonth={milesPerMonth}
          onChange={refresh}
        />
      ) : (
        <ServicesTab items={items} services={services} onChange={refresh} />
      )}
    </div>
  );
};

export default MaintenancePage;
