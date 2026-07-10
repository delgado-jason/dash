import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Driver } from "@/types/driver";
import type { Load } from "@/types/load";
import { getDriver } from "@/services/driversService";
import { useLoads } from "@/hooks/useLoads";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const loadRev = (l: Load) =>
  Number(l.linehaul) + Number(l.fuel_surcharge) + Number(l.total_accessorials);

const Spec = ({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) => (
  <div>
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-sm">{value ? value : "—"}</p>
  </div>
);

const DriverDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { loads } = useLoads(0);
  const [driver, setDriver] = useState<Driver | null>(null);

  useEffect(() => {
    if (!id) return;
    getDriver(id).then(setDriver).catch(() => {});
  }, [id]);

  const driverLoads = useMemo(
    () => loads.filter((l) => l.driver_id === id),
    [loads, id],
  );

  if (!driver)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Loading…</p>
      </div>
    );

  const revenue = driverLoads.reduce((s, l) => s + loadRev(l), 0);

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <Link to="/drivers" className="text-xs text-muted-text hover:text-light">
        ← Drivers
      </Link>

      <div className="flex flex-col md:flex-row gap-6 mt-3 mb-6">
        <EntityAvatar
          kind="driver"
          id={driver.driver_id}
          avatarUrl={driver.avatar_url}
          size={180}
          allowVariant
          onUpdated={(u) => setDriver({ ...driver, avatar_url: u })}
        />
        <div className="flex-1">
          <h1 className="text-3xl font-condensed">
            {driver.first_name} {driver.last_name}
          </h1>
          <p className="text-muted-text text-sm mb-4">
            {driver.active ? "Active driver" : "Inactive"}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Spec label="Phone" value={driver.phone} />
            <Spec label="Email" value={driver.email} />
            <Spec
              label="CDL"
              value={driver.cdl_number ? `${driver.cdl_number} ${driver.cdl_state || ""}` : null}
            />
            <Spec label="CDL expires" value={driver.cdl_expiration} />
            <Spec label="Endorsements" value={driver.endorsements} />
            <Spec label="Hired" value={driver.hire_date} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-plate rounded-lg p-4">
          <p className="text-xs text-muted-text mb-1">Loads hauled</p>
          <p className="text-2xl font-condensed">{driverLoads.length}</p>
        </div>
        <div className="bg-plate rounded-lg p-4">
          <p className="text-xs text-muted-text mb-1">Revenue · all time</p>
          <p className="text-2xl font-condensed">{money(revenue)}</p>
        </div>
      </div>

      <div className="bg-plate rounded-lg p-4">
        <p className="text-xs text-muted-text mb-2">Recent loads</p>
        {driverLoads.length === 0 ? (
          <p className="text-sm text-muted-text">None for this driver yet.</p>
        ) : (
          <div className="text-sm divide-y divide-steel">
            {driverLoads.slice(0, 6).map((l) => (
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

export default DriverDetailPage;
