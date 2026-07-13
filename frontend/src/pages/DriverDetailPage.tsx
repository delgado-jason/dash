import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import type { Driver } from "@/types/driver";
import type { ExpensePeriod } from "@/types/expense";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Truck } from "@/types/truck";
import type { Obligation } from "@/types/obligation";
import { getDriver, patchDriver } from "@/services/driversService";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getFuelEntries } from "@/services/fuelService";
import { getTrucks } from "@/services/trucksService";
import { useLoads } from "@/hooks/useLoads";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { DRIVER_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate } from "@/lib/format";
import {
  getCostBasis,
  getRateLadder,
  loadRevenue,
} from "@/lib/metrics/rateTargets";
import { RATE_TIERS } from "@/lib/constants/targets";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import {
  careerRank,
  getSeasonStats,
  marginGrade,
  rpmGrade,
  worseGrade,
} from "@/lib/metrics/playerCard";
import { earnedAwards } from "@/lib/metrics/awards";
import { computeGrind } from "@/lib/metrics/grind";
import { PlayerCard } from "@/components/playercard/PlayerCard";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

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
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getDriver(id)
      .then(setDriver)
      .catch(() => {});
  }, [id]);

  // Business-level inputs for the card (P&L, obligations, fuel, odometer).
  useEffect(() => {
    getExpensePeriods().then(setPeriods).catch(() => {});
    getObligations().then(setObligations).catch(() => {});
    getFuelEntries().then(setFuel).catch(() => {});
    getTrucks().then(setTrucks).catch(() => {});
  }, []);

  const driverLoads = useMemo(
    () => loads.filter((l) => l.driver_id === id),
    [loads, id],
  );
  // Revenue/count use only earned freight — delivered AND paid — matching the
  // dashboard. Cancelled/booked/in-transit loads haven't earned anything yet.
  const earnedLoads = useMemo(
    () =>
      driverLoads.filter(
        (l) => l.load_status === "delivered" && l.payment_status === "paid",
      ),
    [driverLoads],
  );

  // The player card only makes sense for a driver who actually hauls; a
  // dispatch-only driver (e.g. Brandie) keeps the plain page.
  const card = useMemo(() => {
    if (driverLoads.length === 0) return null;
    const now = new Date();
    // All active obligations (incl. the owner draw) drive break-even/rate; only
    // the debt ones (draws excluded) subtract from True Net.
    const obligationsTotal = obligations
      .filter((o) => o.active)
      .reduce((s, o) => s + Number(o.amount), 0);
    const obligationsDebt = obligations
      .filter((o) => o.active && !o.is_draw)
      .reduce((s, o) => s + Number(o.amount), 0);
    const lifetimeMiles = Math.max(
      0,
      ...trucks.map((t) => Number(t.current_odometer) || 0),
      maxFuelOdometer(fuel) ?? 0,
      ...driverLoads.map((l) => Number(l.odometer_end) || 0),
    );
    const basis = getCostBasis(periods, obligationsTotal, driverLoads, now);
    const ladder = getRateLadder(basis.breakEvenRpm, RATE_TIERS);
    const season = getSeasonStats(periods, driverLoads, now, 3, obligationsDebt);
    const rpmG = rpmGrade(basis.windowRpm, ladder);
    const marginG = marginGrade(season.netMargin);
    // One award engine drives both the pops and the card, so a badge here matches
    // the pop that announced it. Split by tier: burst = badges, marquee = shelf
    // (rank lives in the header, so it's kept off the shelf).
    const grind = computeGrind(driverLoads, periods, obligationsTotal, now);
    const awards = earnedAwards({
      loads: driverLoads,
      periods,
      fuel,
      lifetimeMiles,
      obligationsDebtMonthly: obligationsDebt,
      streak: grind.currentStreak,
      now,
    });
    return {
      rank: careerRank(lifetimeMiles),
      season,
      rpmGrade: rpmG,
      marginGrade: marginG,
      form: worseGrade(rpmG, marginG),
      windowRpm: basis.windowRpm,
      badges: awards.filter((a) => a.tier === "burst"),
      shelf: awards.filter((a) => a.tier === "marquee" && !a.id.startsWith("rank:")),
    };
  }, [driverLoads, periods, obligations, fuel, trucks]);

  const saveEdit = async (data: Record<string, unknown>) => {
    if (!driver) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchDriver(driver.driver_id, data);
      setDriver(updated);
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

  if (!driver)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Loading…</p>
      </div>
    );

  const revenue = earnedLoads.reduce((s, l) => s + loadRevenue(l), 0);
  const milesHauled = driverLoads.reduce(
    (s, l) =>
      l.load_status === "delivered" ? s + (Number(l.loaded_miles) || 0) : s,
    0,
  );
  const name = `${driver.first_name} ${driver.last_name}`;

  const avatar = (
    <EntityAvatar
      kind="driver"
      id={driver.driver_id}
      avatarUrl={driver.avatar_url}
      size={150}
      allowVariant
      onUpdated={(u) => setDriver({ ...driver, avatar_url: u })}
    />
  );

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <Link to="/drivers" className="text-xs text-muted-text hover:text-light">
        ← Drivers
      </Link>

      {card ? (
        <div className="mt-3">
          <PlayerCard
            name={name}
            business="Delgado Trucking Services · Owner-Operator"
            avatar={avatar}
            rank={card.rank}
            season={card.season}
            rpmGrade={card.rpmGrade}
            marginGrade={card.marginGrade}
            form={card.form}
            windowRpm={card.windowRpm}
            badges={card.badges}
            shelf={card.shelf}
          />
          <div className="flex justify-center gap-4 mt-3">
            <Link to="/trophy-room" className="text-sm text-status-info-text hover:underline">
              Trophy Room →
            </Link>
            <Link to="/recap" className="text-sm text-status-info-text hover:underline">
              Full recap →
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-6 mt-3 mb-2 items-start">
          {avatar}
          <div>
            <h1 className="text-3xl font-condensed">{name}</h1>
            <p className="text-muted-text text-sm">
              {driver.active ? "Active driver" : "Inactive"}
            </p>
          </div>
        </div>
      )}

      {/* driver details — demoted below the card, still fully editable */}
      <div className="bg-plate rounded-lg p-4 mt-4">
        {editing ? (
          <EntityForm
            title="Edit driver"
            fields={DRIVER_FIELDS}
            initial={toFormValues(
              driver as unknown as Record<string, unknown>,
              DRIVER_FIELDS,
            )}
            onSave={saveEdit}
            onCancel={() => setEditing(false)}
            busy={busy}
            error={error}
          />
        ) : (
          <>
            <div className="flex justify-between items-start gap-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                <Spec label="Phone" value={driver.phone} />
                <Spec label="Email" value={driver.email} />
                <Spec
                  label="CDL"
                  value={
                    driver.cdl_number
                      ? `${driver.cdl_number} ${driver.cdl_state || ""}`
                      : null
                  }
                />
                <Spec label="CDL expires" value={formatDate(driver.cdl_expiration)} />
                <Spec label="Endorsements" value={driver.endorsements} />
                <Spec label="Hired" value={formatDate(driver.hire_date)} />
              </div>
              <button
                onClick={() => setEditing(true)}
                className="bg-steel text-light px-2 py-1 rounded text-xs flex items-center gap-1 shrink-0"
              >
                <Pencil size={13} /> Edit
              </button>
            </div>
            <p className="text-xs text-muted-text mt-2">
              CDL is managed on the{" "}
              <Link to="/compliance" className="text-status-info-text hover:underline">
                Compliance page
              </Link>
              .
            </p>
          </>
        )}
      </div>

      {/* plain-page stats for a non-hauling driver (hauling stats live in the card) */}
      {!card && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-plate rounded-lg p-4">
            <p className="text-xs text-muted-text mb-1">Loads hauled</p>
            <p className="text-2xl font-condensed">{earnedLoads.length}</p>
          </div>
          <div className="bg-plate rounded-lg p-4">
            <p className="text-xs text-muted-text mb-1">Net revenue · all time</p>
            <p className="text-2xl font-condensed">{money(revenue)}</p>
          </div>
          <div className="bg-plate rounded-lg p-4">
            <p className="text-xs text-muted-text mb-1">Miles hauled</p>
            <p className="text-2xl font-condensed">
              {milesHauled.toLocaleString("en-US")}
            </p>
          </div>
        </div>
      )}

      <div className="bg-plate rounded-lg p-4 mt-4">
        <p className="text-xs text-muted-text mb-2">Recent loads</p>
        {earnedLoads.length === 0 ? (
          <p className="text-sm text-muted-text">None for this driver yet.</p>
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

export default DriverDetailPage;
