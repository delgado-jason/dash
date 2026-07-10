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
    const svcOdo = (unit: MaintenanceUnit): number | null =>
      services
        .filter((s) => s.unit === unit && s.odometer != null)
        .reduce<number | null>(
          (m, s) => (m == null || s.odometer! > m ? s.odometer! : m),
          null,
        );
    const currentMiles: Record<MaintenanceUnit, number | null> = {
      tractor: maxOdometer(currentTractorMiles(loads), svcOdo("tractor")),
      trailer: maxOdometer(svcOdo("trailer")),
    };
    return maintenanceAlerts(items, currentMiles, now, avgMilesPerMonth(loads, now));
  }, [items, services, loads]);
};
