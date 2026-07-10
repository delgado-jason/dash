import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Truck } from "@/types/truck";
import type { Load } from "@/types/load";
import type { MaintenanceItem } from "@/types/maintenance";
import { getTruck } from "@/services/trucksService";
import { getMaintenanceItems } from "@/services/maintenanceService";
import { useLoads } from "@/hooks/useLoads";
import { computeDue, avgMilesPerMonth } from "@/lib/metrics/maintenance";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const loadRev = (l: Load) =>
  Number(l.linehaul) + Number(l.fuel_surcharge) + Number(l.total_accessorials);

const Spec = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) => (
  <div>
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-sm">{value === null || value === undefined || value === "" ? "—" : value}</p>
  </div>
);

const TruckDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { loads } = useLoads(0);
  const [truck, setTruck] = useState<Truck | null>(null);
  const [items, setItems] = useState<MaintenanceItem[]>([]);

  useEffect(() => {
    if (!id) return;
    getTruck(id).then(setTruck).catch(() => {});
    getMaintenanceItems().then(setItems).catch(() => {});
  }, [id]);

  const truckLoads = useMemo(
    () => loads.filter((l) => l.truck_id === id),
    [loads, id],
  );
  const mpm = useMemo(() => avgMilesPerMonth(loads, new Date()), [loads]);
  const due = useMemo(() => {
    let overdue = 0;
    let soon = 0;
    if (truck) {
      for (const it of items.filter((i) => i.truck_id === id)) {
        const d = computeDue(it, truck.current_odometer, new Date(), mpm);
        if (d.level === "overdue") overdue++;
        else if (d.level === "soon") soon++;
      }
    }
    return { overdue, soon };
  }, [items, truck, id, mpm]);

  if (!truck)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Loading…</p>
      </div>
    );

  const revenue = truckLoads.reduce((s, l) => s + loadRev(l), 0);

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <Link to="/trucks" className="text-xs text-muted-text hover:text-light">
        ← Trucks
      </Link>

      <div className="flex flex-col md:flex-row gap-6 mt-3 mb-6">
        <EntityAvatar
          kind="truck"
          id={truck.truck_id}
          avatarUrl={truck.avatar_url}
          size={180}
          onUpdated={(u) => setTruck({ ...truck, avatar_url: u })}
        />
        <div className="flex-1">
          <h1 className="text-3xl font-condensed">Unit {truck.unit_number}</h1>
          <p className="text-muted-text text-sm mb-4">
            {[truck.year, truck.make, truck.model].filter(Boolean).join(" ")} ·{" "}
            {truck.status}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Spec label="Unit #" value={truck.unit_number} />
            <Spec label="Odometer" value={`${truck.current_odometer.toLocaleString("en-US")} mi`} />
            <Spec label="VIN" value={truck.vin} />
            <Spec
              label="Plate"
              value={truck.plate_number ? `${truck.plate_number} ${truck.plate_state || ""}` : null}
            />
            <Spec label="In service" value={truck.in_service_date} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/maintenance" className="bg-plate rounded-lg p-4 hover:bg-steel transition-colors">
          <p className="text-xs text-muted-text mb-2">Maintenance</p>
          <div className="flex gap-3 text-sm">
            <span style={{ color: "#e24b4a" }}>{due.overdue} overdue</span>
            <span style={{ color: "#e8940a" }}>{due.soon} due soon</span>
          </div>
        </Link>
        <div className="bg-plate rounded-lg p-4">
          <p className="text-xs text-muted-text mb-1">Loads hauled</p>
          <p className="text-2xl font-condensed">{truckLoads.length}</p>
        </div>
        <div className="bg-plate rounded-lg p-4">
          <p className="text-xs text-muted-text mb-1">Revenue · all time</p>
          <p className="text-2xl font-condensed">{money(revenue)}</p>
        </div>
      </div>

      <div className="bg-plate rounded-lg p-4 mt-4">
        <p className="text-xs text-muted-text mb-2">Recent loads</p>
        {truckLoads.length === 0 ? (
          <p className="text-sm text-muted-text">None on this truck yet.</p>
        ) : (
          <div className="text-sm divide-y divide-steel">
            {truckLoads.slice(0, 6).map((l) => (
              <div key={l.load_id} className="py-2 flex justify-between">
                <span>
                  {l.origin_market} → {l.delivery_market}
                </span>
                <span className="text-muted-text">{money(loadRev(l))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TruckDetailPage;
