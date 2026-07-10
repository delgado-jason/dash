import { useState, useEffect, useMemo } from "react";
import type { Load } from "@/types/load";
import type { Alert } from "@/types/alert";
import type {
  MaintenanceItem,
  MaintenanceService,
  MaintenanceUnit,
} from "@/types/maintenance";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import {
  maintenanceAlerts,
  currentTractorMiles,
  avgMilesPerMonth,
  maxOdometer,
} from "@/lib/metrics/maintenance";

// Overdue / due-soon maintenance items as dashboard alerts. Empty (renders no
// banners) until items exist and something is actually due.
export const useMaintenanceAlerts = (loads: Load[]): Alert[] => {
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([getMaintenanceItems(), getMaintenanceServices()])
      .then(([its, svcs]) => {
        if (!active) return;
        setItems(its);
        setServices(svcs);
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
      tractor: maxOdometer(currentTractorMiles(loads), svcOdo("tractor")),
      trailer: maxOdometer(svcOdo("trailer")),
    };
    return maintenanceAlerts(items, currentMiles, now, avgMilesPerMonth(loads, now));
  }, [items, services, loads]);
};
