import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Truck } from "@/types/truck";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceService } from "@/types/maintenance";
import { getTrucks, createTruck } from "@/services/trucksService";
import { getFuelEntries } from "@/services/fuelService";
import { getMaintenanceServices } from "@/services/maintenanceService";
import { useLoads } from "@/hooks/useLoads";
import { fleetSummary } from "@/lib/metrics/truckMetrics";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import { MilestoneBurst } from "@/components/fleet/MilestoneBurst";
import { mileMilestone } from "@/lib/metrics/mileClub";

const num = (n: number) => Math.round(n).toLocaleString("en-US");

const FIELDS: FormField[] = [
  {
    name: "unit_number",
    label: "Unit #",
    required: true,
    placeholder: "580991",
  },
  { name: "make", label: "Make", placeholder: "International" },
  { name: "model", label: "Model", placeholder: "LT625" },
  { name: "year", label: "Year", type: "number", placeholder: "2019" },
  { name: "vin", label: "VIN (17 chars)", placeholder: "3HSDZAPR…" },
  { name: "plate_number", label: "Plate", placeholder: "DTS625" },
  { name: "plate_state", label: "State", placeholder: "AL" },
  {
    name: "current_odometer",
    label: "Odometer",
    type: "number",
    placeholder: "568737",
  },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ["active", "maintenance", "out_of_service", "inactive"],
  },
  { name: "in_service_date", label: "In service", type: "date" },
];

const TrucksPage = () => {
  const { loads } = useLoads(0);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    getTrucks()
      .then(setTrucks)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    getFuelEntries().then(setFuel).catch(() => {});
    getMaintenanceServices().then(setServices).catch(() => {});
  }, []);

  // Fleet comparison only earns its keep with more than one truck.
  const fleet =
    trucks.length > 1 ? fleetSummary(trucks, loads, fuel, services, new Date()) : [];
  const best = {
    util: Math.max(0, ...fleet.map((r) => r.utilization ?? 0)),
    mpg: Math.max(0, ...fleet.map((r) => r.avgMpg ?? 0)),
    rev: Math.max(0, ...fleet.map((r) => r.revPerMile ?? 0)),
    mi: Math.max(0, ...fleet.map((r) => r.milesPerMonth ?? 0)),
  };

  const save = async (data: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await createTruck(data);
      setShowForm(false);
      await load();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create the truck";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed">Trucks</h1>
        {!showForm && (
          <button
            className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold flex items-center gap-1"
            onClick={() => setShowForm(true)}
          >
            <Plus size={15} /> Add truck
          </button>
        )}
      </div>

      {showForm && (
        <EntityForm
          title="New truck"
          fields={FIELDS}
          onSave={save}
          onCancel={() => setShowForm(false)}
          busy={busy}
          error={error}
        />
      )}

      {fleet.length > 1 && (
        <div className="bg-plate rounded-lg p-4 mb-4 overflow-x-auto">
          <p className="text-xs text-muted-text mb-2">
            Fleet comparison{" "}
            <span className="text-[11px]">· best per column highlighted</span>
          </p>
          <table className="w-full text-sm" style={{ minWidth: 380 }}>
            <thead>
              <tr className="text-muted-text text-right">
                <th className="text-left font-normal pb-2">Truck</th>
                <th className="font-normal pb-2">Util</th>
                <th className="font-normal pb-2">MPG</th>
                <th className="font-normal pb-2">Rev/mi</th>
                <th className="font-normal pb-2">Mi/mo</th>
              </tr>
            </thead>
            <tbody>
              {fleet.map((r) => (
                <tr key={r.truckId} className="border-t border-steel text-right">
                  <td className="text-left py-1.5">Unit {r.unit}</td>
                  <td style={r.utilization != null && r.utilization === best.util ? { color: "#4ade80" } : undefined}>
                    {r.utilization != null ? `${Math.round(r.utilization * 100)}%` : "—"}
                  </td>
                  <td style={r.avgMpg != null && r.avgMpg === best.mpg ? { color: "#4ade80" } : undefined}>
                    {r.avgMpg != null ? r.avgMpg.toFixed(1) : "—"}
                  </td>
                  <td style={r.revPerMile != null && r.revPerMile === best.rev ? { color: "#4ade80" } : undefined}>
                    {r.revPerMile != null ? `$${r.revPerMile.toFixed(2)}` : "—"}
                  </td>
                  <td style={r.milesPerMonth != null && r.milesPerMonth === best.mi ? { color: "#4ade80" } : undefined}>
                    {r.milesPerMonth != null ? num(r.milesPerMonth) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading ? (
        <p className="text-muted-text">Loading…</p>
      ) : trucks.length === 0 ? (
        <p className="text-muted-text">
          No trucks yet. Add one to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trucks.map((t) => {
            const m = mileMilestone(t.current_odometer);
            return (
              <Link
                key={t.truck_id}
                to={`/trucks/${t.truck_id}`}
                className="relative overflow-hidden bg-plate rounded-lg p-4 flex gap-3 items-center hover:bg-steel transition-colors"
              >
                {m.crossed != null && (
                  <div className="absolute -top-2 -right-2 rotate-[-8deg]">
                    <MilestoneBurst tier={m.tier!} label={m.label!} size={44} />
                  </div>
                )}
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-steel shrink-0">
                  {t.avatar_url ? (
                    <img
                      src={t.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <AvatarFallback kind="truck" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">Unit {t.unit_number}</p>
                  <p className="text-xs text-muted-text truncate">
                    {[t.year, t.make, t.model].filter(Boolean).join(" ") || "—"}
                  </p>
                  <p className="text-xs text-muted-text">
                    {t.current_odometer.toLocaleString("en-US")} mi · {t.status}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TrucksPage;
