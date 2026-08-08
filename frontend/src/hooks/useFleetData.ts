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
import { getPerDiemDays } from "@/services/perDiemService";
import { getComplianceItems } from "@/services/complianceService";
import { getDrivers } from "@/services/driversService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getObligations } from "@/services/obligationsService";

// Everything the Fleet tab needs, fetched once when the tab opens (it only mounts
// when Fleet is the active dashboard tab, so these calls are lazy).
export interface FleetData {
  loading: boolean;
  trucks: Truck[];
  trailers: Trailer[];
  fuel: FuelEntry[];
  items: MaintenanceItem[];
  services: MaintenanceService[];
  homeDays: string[]; // explicit per-diem "home" marks
  travelDays: string[]; // per-diem "full"/"half" (on-the-road) marks
  compliance: ComplianceItem[];
  drivers: Driver[];
  nationalDiesel: number | null; // $/gal
  hometimeThreshold: number | null; // days-out target (settlement schedule)
  assetNote: number; // monthly truck + trailer notes (for all-in cost/mile)
}

const EMPTY: Omit<FleetData, "loading"> = {
  trucks: [], trailers: [], fuel: [], items: [], services: [], homeDays: [], travelDays: [],
  compliance: [], drivers: [], nationalDiesel: null, hometimeThreshold: null, assetNote: 0,
};

export const useFleetData = (): FleetData => {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const year = new Date().getUTCFullYear();
    (async () => {
      try {
        const [trucks, trailers, fuel, items, services, pdThis, pdPrev, compliance, drivers, nat, sched, obligations] =
          await Promise.all([
            getTrucks(),
            getTrailers(),
            getFuelEntries(),
            getMaintenanceItems(),
            getMaintenanceServices(),
            getPerDiemDays(year),
            getPerDiemDays(year - 1).catch(() => []),
            getComplianceItems(),
            getDrivers(),
            getNationalDiesel().catch(() => null),
            getSettlementSchedule().catch(() => null),
            getObligations().catch(() => []),
          ]);
        if (!alive) return;
        const perDiem = [...pdThis, ...pdPrev];
        setData({
          trucks, trailers, fuel, items, services, compliance, drivers,
          homeDays: perDiem.filter((d) => d.status === "home").map((d) => d.day),
          travelDays: perDiem.filter((d) => d.status === "full" || d.status === "half").map((d) => d.day),
          nationalDiesel: nat?.value ?? null,
          hometimeThreshold: sched?.hometime_threshold_days ?? null,
          // the rig's own notes (truck + trailer); a plain loan like Best Egg isn't
          // a cost of running the rig, so it's excluded.
          assetNote: obligations
            .filter((o) => o.active && !o.is_draw && (o.asset_type === "truck" || o.asset_type === "trailer"))
            .reduce((s, o) => s + (Number(o.amount) || 0), 0),
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
