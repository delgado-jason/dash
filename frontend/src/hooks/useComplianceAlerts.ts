import { useState, useEffect, useMemo } from "react";
import type { Alert } from "@/types/alert";
import type { ComplianceItem } from "@/types/compliance";
import type { Driver } from "@/types/driver";
import { getComplianceItems } from "@/services/complianceService";
import { getDrivers } from "@/services/driversService";
import {
  complianceAlerts,
  itemToCheckable,
  cdlToCheckable,
} from "@/lib/metrics/compliance";

// Expiring / expired compliance docs as dashboard alerts. Combines the tracked
// compliance items with the CDL read off each driver record. Empty until
// something is actually due, so it costs no banner space.
export const useComplianceAlerts = (): Alert[] => {
  const [items, setItems] = useState<ComplianceItem[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([getComplianceItems(), getDrivers()])
      .then(([ci, dr]) => {
        if (!active) return;
        setItems(ci);
        setDrivers(dr);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return useMemo(() => {
    const now = new Date();
    const checkables = [
      ...items.map(itemToCheckable),
      ...drivers.filter((d) => d.cdl_expiration).map(cdlToCheckable),
    ];
    return complianceAlerts(checkables, now);
  }, [items, drivers]);
};
