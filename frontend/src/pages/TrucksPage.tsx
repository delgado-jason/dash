import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { Truck } from "@/types/truck";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceItem } from "@/types/maintenance";
import type { Obligation } from "@/types/obligation";
import { getTrucks, createTruck } from "@/services/trucksService";
import { getFuelEntries } from "@/services/fuelService";
import { getMaintenanceItems } from "@/services/maintenanceService";
import { getObligations } from "@/services/obligationsService";
import { useLoads } from "@/hooks/useLoads";
import { computeDue, recentMilesPerMonth } from "@/lib/metrics/maintenance";
import { fuelStats } from "@/lib/metrics/fuelEconomy";
import { computePayoff, isPayoffTracked } from "@/lib/metrics/payoff";
import { mileMilestone } from "@/lib/metrics/mileClub";
import { AvatarFallback } from "@/components/fleet/AvatarFallback";
import { EntityForm, type FormField } from "@/components/fleet/EntityForm";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";

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
    label: "Odometer (seed — the app derives the live one)",
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

const STATUS_CHIP: Record<string, string> = {
  active: "text-[#6fd08c] border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)]",
  maintenance: "text-amber-hi border-[rgba(232,148,10,.45)] bg-[rgba(232,148,10,.1)]",
  out_of_service: "text-[#e05252] border-[rgba(224,82,82,.45)] bg-[rgba(224,82,82,.1)]",
  inactive: "text-faint border-hairline",
};

const TrucksPage = () => {
  const { loads } = useLoads(0);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = () =>
    getTrucks()
      .then(setTrucks)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    getFuelEntries().then(setFuel).catch(() => {});
    getMaintenanceItems().then(setItems).catch(() => {});
    getObligations().then(setObligations).catch(() => {});
  }, []);

  // Per-truck roster line: hauls, MPG, note %, and the service clocks.
  const now = useMemo(() => new Date(), []);
  const mpm = useMemo(() => recentMilesPerMonth(loads, now), [loads, now]);
  const rows = useMemo(
    () =>
      trucks.map((t) => {
        const odo = Number(t.current_odometer) || 0;
        const hauls = loads.filter(
          (l) => l.truck_id === t.truck_id && l.load_status === "delivered",
        ).length;
        const mpg = fuelStats(
          fuel.filter((f) => f.truck_id === t.truck_id),
          now,
        ).avgMpg;
        const loan = obligations.find(
          (o) =>
            o.asset_type === "truck" &&
            (o.asset_id === t.truck_id || o.asset_id == null) &&
            isPayoffTracked(o),
        );
        const payoff = loan ? computePayoff(loan, now) : null;
        let overdue = 0;
        let soon = 0;
        for (const it of items.filter(
          (i) => i.active && (i.truck_id === t.truck_id || i.truck_id == null),
        )) {
          if (it.unit !== "tractor") continue;
          const d = computeDue(it, odo, now, mpm);
          if (d.level === "overdue") overdue++;
          else if (d.level === "soon") soon++;
        }
        return { t, odo, hauls, mpg, payoff, overdue, soon, m: mileMilestone(odo) };
      }),
    [trucks, loads, fuel, obligations, items, mpm, now],
  );

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

  if (loading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-28 mb-6" />
        <RowsSkeleton rows={3} />
      </div>
    );

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">TRUCKS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the iron that earns it
          </span>
          <span className="flex-1" />
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
              style={{
                background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
                boxShadow:
                  "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
              }}
            >
              + ADD TRUCK
            </button>
          )}
        </div>

        {showForm && (
          <div className="mt-4 max-w-md">
            <EntityForm
              title="New truck"
              fields={FIELDS}
              onSave={save}
              onCancel={() => setShowForm(false)}
              busy={busy}
              error={error}
            />
          </div>
        )}

        {trucks.length === 0 ? (
          <p className="text-faint font-condensed text-[14px] mt-5">
            No trucks yet. Add one to get started.
          </p>
        ) : (
          <div className="ds2-board overflow-hidden mt-4">
            {rows.map(({ t, odo, hauls, mpg, payoff, overdue, soon, m }) => (
              <div
                key={t.truck_id}
                onClick={() => navigate(`/trucks/${t.truck_id}`)}
                className="flex items-center gap-4 px-4 py-[13px] border-t ds2-cell-rule first:border-t-0 cursor-pointer hover:bg-well/60"
              >
                <div className="w-14 h-14 rounded-[10px] overflow-hidden bg-well border border-hairline shrink-0">
                  {t.avatar_url ? (
                    <img src={t.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <AvatarFallback kind="truck" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-condensed font-semibold text-[17px] flex items-center gap-[9px] flex-wrap">
                    UNIT {t.unit_number}
                    {(t.year || t.make || t.model) && (
                      <span className="font-medium text-[10.5px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline uppercase">
                        {[t.year, t.make, t.model].filter(Boolean).join(" ")}
                      </span>
                    )}
                    <span
                      className={`font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] border uppercase ${
                        STATUS_CHIP[t.status] ?? STATUS_CHIP.inactive
                      }`}
                    >
                      {t.status.replace(/_/g, " ")}
                    </span>
                    {overdue > 0 && (
                      <span className="font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#e05252] border border-[rgba(224,82,82,.45)] bg-[rgba(224,82,82,.1)]">
                        {overdue} OVERDUE
                      </span>
                    )}
                    {overdue === 0 && soon > 0 && (
                      <span className="font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-amber-hi border border-[rgba(232,148,10,.45)] bg-[rgba(232,148,10,.1)]">
                        {soon} SERVICE{soon === 1 ? "" : "S"} CLOSE
                      </span>
                    )}
                  </div>
                  <div className="font-condensed text-[13px] text-dim mt-[3px]">
                    {odo.toLocaleString("en-US")} mi · {hauls} haul{hauls === 1 ? "" : "s"}
                    {mpg != null ? ` · ${mpg.toFixed(1)} MPG avg` : ""}
                    {payoff?.paidPct != null
                      ? ` · note ${Math.round(payoff.paidPct * 100)}% paid`
                      : ""}
                  </div>
                </div>
                {m.crossed != null && (
                  <span
                    className="font-display text-[12.5px] tracking-[.12em] rounded-[4px] px-[9px] pt-[3px] pb-[2px] rotate-[-1.2deg] whitespace-nowrap"
                    style={{
                      color: "#f0c24a",
                      border: "1.5px solid rgba(240,194,74,.55)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,.15), 0 1px 2px rgba(0,0,0,.5)",
                    }}
                  >
                    {m.label} CLUB
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrucksPage;
