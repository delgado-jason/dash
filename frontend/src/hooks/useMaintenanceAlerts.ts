import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { Alert } from "@/types/alert";
import type {
  MaintenanceItem,
  MaintenanceService,
  MaintenanceUnit,
} from "@/types/maintenance";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Trip } from "@/types/trip";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrips } from "@/services/tripsService";
import {
  maintenanceAlerts,
  currentTractorMiles,
  recentMilesPerMonth,
  maxOdometer,
  maxTripOdometer,
} from "@/lib/metrics/maintenance";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";

// Overdue / due-soon maintenance items as dashboard alerts. Empty (renders no
// banners) until items exist and something is actually due.
export const useMaintenanceAlerts = (loads: Load[]): Alert[] => {
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

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
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => {
    const now = new Date();
    // A "both" service covers this unit too; the trailer reads its hub, the
    // truck its odometer.
    const svcOdo = (unit: MaintenanceUnit): number | null => {
      const read = (s: (typeof services)[number]) =>
        unit === "trailer" ? s.trailer_hub : s.odometer;
      return services
        .filter((s) => (s.unit === unit || s.unit === "both") && read(s) != null)
        .reduce<number | null>((m, s) => {
          const v = read(s)!;
          return m == null || v > m ? v : m;
        }, null);
    };
    const currentMiles: Record<MaintenanceUnit, number | null> = {
      tractor: maxOdometer(
        currentTractorMiles(loads),
        svcOdo("tractor"),
        maxFuelOdometer(fuelEntries),
        maxTripOdometer(trips),
      ),
      trailer: maxOdometer(svcOdo("trailer")),
    };
    return maintenanceAlerts(items, currentMiles, now, recentMilesPerMonth(loads, now));
  }, [items, services, fuelEntries, trips, loads]);
};
