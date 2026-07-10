import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Driver } from "@/types/driver";
import { getDrivers, createDriver } from "@/services/driversService";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import { MilestoneBurst } from "@/components/fleet/MilestoneBurst";
import { mileMilestone } from "@/lib/metrics/mileClub";
import { useLoads } from "@/hooks/useLoads";

const FIELDS: FormField[] = [
  { name: "first_name", label: "First name", required: true },
  { name: "last_name", label: "Last name", required: true },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "cdl_number", label: "CDL #" },
  { name: "cdl_state", label: "CDL state", placeholder: "AL" },
  { name: "cdl_expiration", label: "CDL expires", type: "date" },
  { name: "endorsements", label: "Endorsements", placeholder: "H, N, T" },
  { name: "hire_date", label: "Hire date", type: "date" },
];

const DriversPage = () => {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { loads } = useLoads(0);

  // Career miles hauled per driver, from their delivered loads.
  const milesByDriver = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of loads) {
      if (l.load_status !== "delivered" || !l.driver_id) continue;
      map.set(
        l.driver_id,
        (map.get(l.driver_id) ?? 0) + (Number(l.loaded_miles) || 0),
      );
    }
    return map;
  }, [loads]);

  const load = () =>
    getDrivers()
      .then(setDrivers)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  const save = async (data: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await createDriver(data);
      setShowForm(false);
      await load();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Could not create the driver";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-condensed">Drivers</h1>
        {!showForm && (
          <button
            className="bg-amber text-steel px-3 py-1 rounded text-sm font-semibold flex items-center gap-1"
            onClick={() => setShowForm(true)}
          >
            <Plus size={15} /> Add driver
          </button>
        )}
      </div>

      {showForm && (
        <EntityForm
          title="New driver"
          fields={FIELDS}
          onSave={save}
          onCancel={() => setShowForm(false)}
          busy={busy}
          error={error}
        />
      )}

      {loading ? (
        <p className="text-muted-text">Loading…</p>
      ) : drivers.length === 0 ? (
        <p className="text-muted-text">
          No drivers yet. Add one to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map((d) => {
            const m = mileMilestone(milesByDriver.get(d.driver_id) ?? 0);
            return (
              <Link
                key={d.driver_id}
                to={`/drivers/${d.driver_id}`}
                className="relative overflow-hidden bg-plate rounded-lg p-4 flex gap-3 items-center hover:bg-steel transition-colors"
              >
                {m.crossed != null && (
                  <div className="absolute -top-2 -right-2 rotate-[-8deg]">
                    <MilestoneBurst tier={m.tier!} label={m.label!} size={44} />
                  </div>
                )}
                <div className="w-16 h-16 rounded-full overflow-hidden bg-steel shrink-0">
                  {d.avatar_url ? (
                    <img
                      src={d.avatar_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <AvatarFallback kind="driver" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {d.first_name} {d.last_name}
                  </p>
                  <p className="text-xs text-muted-text truncate">
                    {d.phone || d.email || "—"}
                  </p>
                  <p className="text-xs text-muted-text">
                    {d.active ? "active" : "inactive"}
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

export default DriversPage;
