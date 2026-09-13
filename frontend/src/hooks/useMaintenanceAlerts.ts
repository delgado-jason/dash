import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { Alert } from "@/types/alert";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
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
  type CurrentReading,
} from "@/lib/metrics/maintenance";
import { apuDueOptions } from "@/lib/metrics/apuHours";
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
    // truck its odometer. An APU service reads neither — it reads hours.
    const svcOdo = (unit: "tractor" | "trailer"): number | null => {
      const read = (s: (typeof services)[number]) =>
        unit === "trailer" ? s.trailer_hub : s.odometer;
      return services
        .filter((s) => (s.unit === unit || s.unit === "both") && read(s) != null)
        .reduce<number | null>((m, s) => {
          const v = read(s)!;
          return m == null || v > m ? v : m;
        }, null);
    };
    // The APU alerts off the same projection the Maintenance page draws — the
    // reading is softer than an odometer, the clock is not.
    const { apu, hoursPerRoadDay, roadDayShare } = apuDueOptions(
      services,
      fuelEntries,
      loads,
      now,
    );
    const currentReading: CurrentReading = {
      tractor: maxOdometer(
        currentTractorMiles(loads),
        svcOdo("tractor"),
        maxFuelOdometer(fuelEntries),
        maxTripOdometer(trips),
      ),
      trailer: maxOdometer(svcOdo("trailer")),
      apu: apu.hours,
      apuEstimated: apu.estimated,
    };
    return maintenanceAlerts(
      items,
      currentReading,
      now,
      recentMilesPerMonth(loads, now),
      { hoursPerRoadDay, roadDayShare },
    );
  }, [items, services, fuelEntries, trips, loads]);
};
