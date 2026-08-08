import { useEffect, useState } from "react";
import type { Truck } from "@/types/truck";
import type { Trailer } from "@/types/trailer";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import type { ComplianceItem } from "@/types/compliance";
import type { Driver } from "@/types/driver";
import { getTrucks } from "@/services/trucksService";
import { getTrailers } from "@/services/trailersService";
import { getFuelEntries, getNationalDiesel } from "@/services/fuelService";
import { getMaintenanceItems, getMaintenanceServices } from "@/services/maintenanceService";
import { getHomeDays } from "@/services/perDiemService";
import { getComplianceItems } from "@/services/complianceService";
import { getDrivers } from "@/services/driversService";

// Everything the Fleet tab needs, fetched once when the tab opens (it only mounts
// when Fleet is the active dashboard tab, so these calls are lazy). Raw data —
// the tab computes the metrics from it so the math stays pure and testable.
export interface FleetData {
  loading: boolean;
  trucks: Truck[];
  trailers: Trailer[];
  fuel: FuelEntry[];
  items: MaintenanceItem[];
  services: MaintenanceService[];
  homeDays: string[];
  compliance: ComplianceItem[];
  drivers: Driver[];
  nationalDiesel: number | null; // $/gal
}

const EMPTY: Omit<FleetData, "loading"> = {
  trucks: [], trailers: [], fuel: [], items: [], services: [], homeDays: [], compliance: [], drivers: [], nationalDiesel: null,
};

export const useFleetData = (): FleetData => {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [trucks, trailers, fuel, items, services, homeDays, compliance, drivers, nat] =
          await Promise.all([
            getTrucks(),
            getTrailers(),
            getFuelEntries(),
            getMaintenanceItems(),
            getMaintenanceServices(),
            getHomeDays(),
            getComplianceItems(),
            getDrivers(),
            getNationalDiesel().catch(() => null),
          ]);
        if (!alive) return;
        setData({
          trucks, trailers, fuel, items, services, homeDays, compliance, drivers,
          nationalDiesel: nat?.value ?? null,
        });
      } catch {
        /* leave empty — the tab shows an empty state */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { loading, ...data };
};
