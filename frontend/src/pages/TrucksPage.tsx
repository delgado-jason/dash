import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Truck } from "@/types/truck";
import { getTrucks, createTruck } from "@/services/trucksService";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import { MilestoneBurst } from "@/components/fleet/MilestoneBurst";
import { mileMilestone } from "@/lib/metrics/mileClub";

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
  const [trucks, setTrucks] = useState<Truck[]>([]);
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
  }, []);

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
