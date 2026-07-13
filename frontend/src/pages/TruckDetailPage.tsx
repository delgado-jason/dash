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
  recentMilesPerMonth,
  maxOdometer,
} from "@/lib/metrics/maintenance";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { loadRevenue } from "@/lib/metrics/rateTargets";
import { getObligations } from "@/services/obligationsService";
import type { Obligation } from "@/types/obligation";
import { isPayoffTracked, assetLoanStatus } from "@/lib/metrics/payoff";
import { PayoffTracker } from "@/components/fleet/PayoffTracker";
import { computeTruckMetrics } from "@/lib/metrics/truckMetrics";
import {
  computeTruckPatches,
  computeTruckMedals,
  truckRecords,
} from "@/lib/awards/truckAwards";
import { earnedMedals } from "@/lib/awards/medals";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { RecordBook, type RecordChip } from "@/components/awards/RecordBook";
import { PatchBoard } from "@/components/awards/PatchBoard";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { MileClub } from "@/components/fleet/MileClub";
import { TRUCK_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate } from "@/lib/format";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const num = (n: number) => Math.round(n).toLocaleString("en-US");

// One tile in the truck-metrics strip.
const Kpi = ({
  value,
  label,
  sub,
  green,
}: {
  value: string;
  label: string;
  sub?: string;
  green?: boolean;
}) => (
  <div className="flex-1 min-w-[92px] rounded-[10px] px-2 py-2.5 text-center" style={{ background: "#1c2333" }}>
    <div className="font-comic text-[20px] leading-none" style={{ color: green ? "#4ade80" : "#f5e6c8" }}>
      {value}
    </div>
    <div className="text-[9px] text-muted-text mt-1 tracking-wide">{label}</div>
    {sub && <div className="text-[8px] text-muted-text">{sub}</div>}
  </div>
);

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
  const [obligations, setObligations] = useState<Obligation[]>([]);
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
    getObligations()
      .then(setObligations)
      .catch(() => {});
  }, [id]);

  // The loan/lease tracked against this truck, if any.
  const truckLoan = obligations.find(
    (o) =>
      o.asset_type === "truck" &&
      (o.asset_id === id || o.asset_id == null) &&
      isPayoffTracked(o),
  );

  const truckLoads = useMemo(
    () => loads.filter((l) => l.truck_id === id),
    [loads, id],
  );
  // Revenue/count use only earned freight — delivered AND paid — matching the
  // dashboard. Cancelled/booked/in-transit loads haven't earned anything yet.
  const earnedLoads = useMemo(
    () =>
      truckLoads.filter(
        (l) => l.load_status === "delivered" && l.payment_status === "paid",
      ),
    [truckLoads],
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

  const mpm = useMemo(() => recentMilesPerMonth(loads, new Date()), [loads]);
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

  const revenue = earnedLoads.reduce((s, l) => s + loadRevenue(l), 0);
  const now = new Date();
  const truckFuel = fuelEntries.filter((f) => f.truck_id === id);
  const metrics = computeTruckMetrics(truck, truckLoads, truckFuel, services, now);
  const truckMedals = earnedMedals(
    computeTruckMedals({
      odometer,
      avgMpg: metrics.avgMpg,
      deliveredCount: earnedLoads.length,
      loanPaidPct: assetLoanStatus(obligations, "truck", now)?.ownedPct ?? null,
    }),
  );
  const patches = computeTruckPatches(truckLoads, truckFuel);
  const recs = truckRecords(truckLoads, truckFuel);
  const recordChips: RecordChip[] = [
    { icon: "flame", color: "#e8940a", value: recs.bestTank != null ? recs.bestTank.toFixed(1) : "—", label: "BEST TANK" },
    { icon: "road", color: "#f5b03a", value: recs.bigMonthMiles != null ? num(recs.bigMonthMiles) : "—", label: "BIG MONTH (MI)" },
    { icon: "cash", color: "#4ade80", value: recs.bestRevPerMile != null ? `$${recs.bestRevPerMile.toFixed(2)}` : "—", label: "BEST REV/MI" },
    { icon: "arrows-horizontal", color: "#60a5fa", value: recs.longestHaul != null ? num(recs.longestHaul) : "—", label: "LONGEST HAUL" },
  ];

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
              {!editing && truckMedals.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {truckMedals.map((m) => (
                    <MedalBadge key={m.key} medal={m} />
                  ))}
                </div>
              )}
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

      <div className="mt-1">
        <p className="text-xs text-muted-text mb-2">Truck metrics</p>
        <div className="flex gap-2 flex-wrap">
          <div
            className="flex-[1.4] min-w-[130px] rounded-[10px] px-3 py-2.5 text-center"
            style={{ background: "#0f2419", border: "1px solid #2f6f52" }}
          >
            <div className="font-comic text-2xl leading-none" style={{ color: "#4ade80" }}>
              {metrics.utilization != null ? `${Math.round(metrics.utilization * 100)}%` : "—"}
            </div>
            <div className="text-[9px] mt-1 tracking-wide" style={{ color: "#8fd6a8" }}>
              UTILIZATION · ACTIVE WEEKS
            </div>
          </div>
          <Kpi value={metrics.avgMpg != null ? metrics.avgMpg.toFixed(1) : "—"} label="AVG MPG" />
          <Kpi value={metrics.bestTank != null ? metrics.bestTank.toFixed(1) : "—"} label="BEST TANK" />
          <Kpi value={metrics.fuelPerMile != null ? `$${metrics.fuelPerMile.toFixed(2)}` : "—"} label="FUEL / MI" />
          <Kpi value={metrics.revPerMile != null ? `$${metrics.revPerMile.toFixed(2)}` : "—"} label="REVENUE / MI" green />
          <Kpi
            value={metrics.costToRunPerMile != null ? `$${metrics.costToRunPerMile.toFixed(2)}` : "—"}
            label="COST TO RUN / MI"
            sub="fuel + maintenance"
          />
          <Kpi value={metrics.milesPerMonth != null ? num(metrics.milesPerMonth) : "—"} label="MI / MONTH" />
        </div>
      </div>

      {truckLoan && <PayoffTracker obligation={truckLoan} kind="truck" />}

      <RecordBook records={recordChips} />
      <PatchBoard patches={patches} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
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
          <p className="text-2xl font-condensed">{earnedLoads.length}</p>
        </div>
        <div className="bg-plate rounded-lg p-4">
          <p className="text-xs text-muted-text mb-1">Net revenue · all time</p>
          <p className="text-2xl font-condensed">{money(revenue)}</p>
        </div>
      </div>

      <div className="bg-plate rounded-lg p-4 mt-4">
        <p className="text-xs text-muted-text mb-2">Recent loads</p>
        {earnedLoads.length === 0 ? (
          <p className="text-sm text-muted-text">None on this truck yet.</p>
        ) : (
          <div className="text-sm divide-y divide-steel">
            {earnedLoads.slice(0, 6).map((l) => (
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
