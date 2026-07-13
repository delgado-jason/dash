import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import { getTruck, patchTruck } from "@/services/trucksService";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { getFuelEntries } from "@/services/fuelService";
import { useLoads } from "@/hooks/useLoads";
import {
  computeDue,
  avgMilesPerMonth,
  maxOdometer,
} from "@/lib/metrics/maintenance";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { loadRevenue } from "@/lib/metrics/rateTargets";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { MileClub } from "@/components/fleet/MileClub";
import { TRUCK_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate } from "@/lib/format";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const Spec = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) => (
  <div>
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-sm">
      {value === null || value === undefined || value === "" ? "—" : value}
    </p>
  </div>
);

const TruckDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { loads } = useLoads(0);
  const [truck, setTruck] = useState<Truck | null>(null);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [fuelEntries, setFuelEntries] = useState<FuelEntry[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getTruck(id)
      .then(setTruck)
      .catch(() => {});
    getMaintenanceItems()
      .then(setItems)
      .catch(() => {});
    getMaintenanceServices()
      .then(setServices)
      .catch(() => {});
    getFuelEntries()
      .then(setFuelEntries)
      .catch(() => {});
  }, [id]);

  const truckLoads = useMemo(
    () => loads.filter((l) => l.truck_id === id),
    [loads, id],
  );

  // Latest odometer, derived from the app: stored value + newest load + newest
  // service reading + newest fuel fill-up (fuel is usually the freshest).
  const odometer = useMemo(() => {
    if (!truck) return 0;
    const loadOdos = truckLoads.map((l) => l.odometer_end ?? null);
    const svcOdos = services
      .filter((s) => s.unit === "tractor" || s.unit === "both")
      .map((s) => s.odometer);
    const fuelOdo = maxFuelOdometer(
      fuelEntries.filter((f) => f.truck_id === id),
    );
    return (
      maxOdometer(truck.current_odometer, ...loadOdos, ...svcOdos, fuelOdo) ??
      truck.current_odometer
    );
  }, [truck, truckLoads, services, fuelEntries, id]);

  const mpm = useMemo(() => avgMilesPerMonth(loads, new Date()), [loads]);
  const due = useMemo(() => {
    let overdue = 0;
    let soon = 0;
    for (const it of items.filter((i) => i.truck_id === id)) {
      const d = computeDue(it, odometer, new Date(), mpm);
      if (d.level === "overdue") overdue++;
      else if (d.level === "soon") soon++;
    }
    return { overdue, soon };
  }, [items, id, odometer, mpm]);

  const saveEdit = async (data: Record<string, unknown>) => {
    if (!truck) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchTruck(truck.truck_id, data);
      setTruck(updated);
      setEditing(false);
    } catch (e) {
      setError(
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not save",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!truck)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Loading…</p>
      </div>
    );

  const revenue = truckLoads.reduce((s, l) => s + loadRevenue(l), 0);

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
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-condensed">
                Unit {truck.unit_number}
              </h1>
              <p className="text-muted-text text-sm mb-4">
                {[truck.year, truck.make, truck.model]
                  .filter(Boolean)
                  .join(" ")}{" "}
                · {truck.status}
              </p>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="bg-steel text-light px-2 py-1 rounded text-xs flex items-center gap-1"
              >
                <Pencil size={13} /> Edit
              </button>
            )}
          </div>

          {editing ? (
            <EntityForm
              title="Edit truck"
              fields={TRUCK_FIELDS}
              initial={toFormValues(
                truck as unknown as Record<string, unknown>,
                TRUCK_FIELDS,
              )}
              onSave={saveEdit}
              onCancel={() => setEditing(false)}
              busy={busy}
              error={error}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Spec label="Unit #" value={truck.unit_number} />
                <Spec
                  label="Odometer · latest"
                  value={`${odometer.toLocaleString("en-US")} mi`}
                />
                <Spec label="VIN" value={truck.vin} />
                <Spec
                  label="Plate"
                  value={
                    truck.plate_number
                      ? `${truck.plate_number} ${truck.plate_state || ""}`
                      : null
                  }
                />
                <Spec
                  label="In service"
                  value={formatDate(truck.in_service_date)}
                />
              </div>
              <MileClub miles={odometer} />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/maintenance"
          className="bg-plate rounded-lg p-4 hover:bg-steel transition-colors"
        >
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
          <p className="text-xs text-muted-text mb-1">Net revenue · all time</p>
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
                <span className="text-muted-text">{money(loadRevenue(l))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TruckDetailPage;
