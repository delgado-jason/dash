import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Truck } from "@/types/truck";
import type { FuelEntry } from "@/types/fuelEntry";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import { getTruck, patchTruck } from "@/services/trucksService";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { getFuelEntries } from "@/services/fuelService";
import { getPerDiemDays } from "@/services/perDiemService";
import { useLoads } from "@/hooks/useLoads";
import {
  computeDue,
  recentMilesPerMonth,
  maxOdometer,
  maxTripOdometer,
} from "@/lib/metrics/maintenance";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import { loadRevenue } from "@/lib/metrics/rateTargets";
import { getObligations } from "@/services/obligationsService";
import { getTrips } from "@/services/tripsService";
import type { Trip } from "@/types/trip";
import type { Obligation } from "@/types/obligation";
import { isPayoffTracked, assetLoanStatus, computePayoff } from "@/lib/metrics/payoff";
import { computeTruckMetrics } from "@/lib/metrics/truckMetrics";
import { RollingNumber } from "@/components/celebrations/RollingNumber";
import {
  computeTruckPatches,
  computeTruckMedals,
  truckRecords,
} from "@/lib/awards/truckAwards";
import { earnedMedals } from "@/lib/awards/medals";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { type RecordChip } from "@/components/awards/RecordBook";
import { HardwareBoard } from "@/components/awards/HardwareBoard";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { TRUCK_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate, money } from "@/lib/format";
import { mileMilestone } from "@/lib/metrics/mileClub";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockSkeleton } from "@/components/ui/PageSkeletons";

const num = (n: number) => Math.round(n).toLocaleString("en-US");

const Spec = ({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) => (
  <div className="min-w-0">
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-sm break-words">
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
  const [trips, setTrips] = useState<Trip[]>([]);
  const [homeDays, setHomeDays] = useState<string[]>([]);
  const [travelDays, setTravelDays] = useState<string[]>([]);
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
    getTrips()
      .then(setTrips)
      .catch(() => {});
    // Per-diem drives the day split: explicit "home" marks plus "full"/"half"
    // (on-the-road) days; unmarked days default to home inside computeTruckMetrics.
    const year = new Date().getUTCFullYear();
    Promise.all([getPerDiemDays(year), getPerDiemDays(year - 1).catch(() => [])])
      .then(([a, b]) => {
        const days = [...a, ...b];
        setHomeDays(days.filter((d) => d.status === "home").map((d) => d.day));
        setTravelDays(
          days.filter((d) => d.status === "full" || d.status === "half").map((d) => d.day),
        );
      })
      .catch(() => {});
  }, [id]);

  // The loan/lease tracked against this truck, if any.
  const truckLoan = obligations.find(
    (o) =>
      o.asset_type === "truck" &&
      (o.asset_id === id || o.asset_id == null) &&
      isPayoffTracked(o),
  );

  // The truck's monthly note — folded into cost-to-run (all-in). Active, non-draw,
  // truck-scoped; a personal loan (no asset) isn't a cost of running the rig.
  const truckNote = obligations
    .filter(
      (o) =>
        o.active &&
        !o.is_draw &&
        o.asset_type === "truck" &&
        (o.asset_id === id || o.asset_id == null),
    )
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);

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
  // "Loads hauled" is about work run, so it's delivered — paid or not. A load you
  // delivered but haven't been paid for yet was still hauled. (Revenue stays on
  // earnedLoads: you've only earned money on the paid ones.)
  const deliveredLoads = useMemo(
    () => truckLoads.filter((l) => l.load_status === "delivered"),
    [truckLoads],
  );

  // Latest odometer, derived from the app: stored value + newest load + newest
  // trip + newest service reading + newest fuel fill-up (fuel is usually freshest).
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
      maxOdometer(
        truck.current_odometer,
        ...loadOdos,
        ...svcOdos,
        fuelOdo,
        maxTripOdometer(trips, id),
      ) ?? truck.current_odometer
    );
  }, [truck, truckLoads, services, fuelEntries, trips, id]);

  const mpm = useMemo(() => recentMilesPerMonth(loads, new Date()), [loads]);

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
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-32 mb-6" />
        <BlockSkeleton className="h-72" />
      </div>
    );

  const revenue = earnedLoads.reduce((s, l) => s + loadRevenue(l), 0);
  const now = new Date();
  const truckFuel = fuelEntries.filter((f) => f.truck_id === id);
  const metrics = computeTruckMetrics(truck, truckLoads, truckFuel, services, now, homeDays, travelDays, truckNote);
  const allTruckMedals = computeTruckMedals({
    odometer,
    avgMpg: metrics.avgMpg,
    deliveredCount: earnedLoads.length,
    loanPaidPct: assetLoanStatus(obligations, "truck", now)?.ownedPct ?? null,
    utilization: metrics.utilization,
  });
  const truckMedals = earnedMedals(allTruckMedals);
  const payoff = truckLoan ? computePayoff(truckLoan, now) : null;
  // Every clock on this tractor, most urgent first — the card's service row.
  const clocks = items
    .filter(
      (i) =>
        i.active &&
        (i.truck_id === id || i.truck_id == null) &&
        (i.unit === "tractor"),
    )
    .map((it) => ({ it, d: computeDue(it, odometer, now, mpm) }))
    .filter(({ d }) => d.progress != null)
    .sort((a, b) => (b.d.progress ?? 0) - (a.d.progress ?? 0));
  const nextClock = clocks[0] ?? null;
  const closeCount = clocks.filter(
    ({ d }) => d.level === "soon" || d.level === "overdue",
  ).length;
  const m = mileMilestone(odometer);
  const patches = computeTruckPatches(truckLoads, truckFuel);
  const recs = truckRecords(truckLoads, truckFuel);
  const recordChips: RecordChip[] = [
    { icon: "flame", color: "#e8940a", value: recs.bestTank != null ? recs.bestTank.toFixed(1) : "—", label: "BEST TANK" },
    { icon: "road", color: "#f5b03a", value: recs.bigMonthMiles != null ? num(recs.bigMonthMiles) : "—", label: "BIG MONTH (MI)" },
    { icon: "cash", color: "#4ade80", value: recs.bestRevPerMile != null ? `$${recs.bestRevPerMile.toFixed(2)}` : "—", label: "BEST REV/MI" },
    { icon: "arrows-horizontal", color: "#60a5fa", value: recs.longestHaul != null ? num(recs.longestHaul) : "—", label: "LONGEST HAUL" },
  ];

  const clockFill = (progress: number | null) =>
    Math.min(1, Math.max(0, progress ?? 0));

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">TRUCKS</h1>
          <Link
            to="/trucks"
            className="font-condensed font-medium text-[15px] text-faint hover:text-ink"
          >
            ← back to the fleet
          </Link>
        </div>

        <div className="flex items-center gap-4 flex-wrap mt-[18px]">
          <EntityAvatar
            kind="truck"
            id={truck.truck_id}
            avatarUrl={truck.avatar_url}
            size={84}
            onUpdated={(u) => setTruck({ ...truck, avatar_url: u })}
          />
          <div className="min-w-0">
            <h2 className="font-display text-[34px] tracking-[.04em] leading-none">
              UNIT {truck.unit_number}
            </h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              {(truck.year || truck.make || truck.model) && (
                <span className="font-condensed font-medium text-[10.5px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline uppercase">
                  {[truck.year, truck.make, truck.model].filter(Boolean).join(" ")}
                </span>
              )}
              <span className="font-condensed font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#6fd08c] border border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)] uppercase">
                {truck.status.replace(/_/g, " ")}
              </span>
            </div>
            {truckMedals.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {truckMedals.map((md) => (
                  <MedalBadge key={md.key} medal={md} />
                ))}
              </div>
            )}
          </div>
          <div className="ml-auto text-right">
            <span
              className="inline-block font-display text-[38px] tracking-[.1em] tabular-nums px-3 py-[2px] rounded-[8px] bg-well border border-hairline"
              style={{ boxShadow: "inset 0 3px 8px rgba(0,0,0,.6)" }}
            >
              <RollingNumber value={odometer} />
            </span>
            <p className="font-condensed text-[10.5px] tracking-[.14em] text-faint uppercase mt-1">
              odometer · one constant
            </p>
          </div>
        </div>

        {/* the rig card */}
        <div
          className="relative overflow-hidden rounded-[14px] border mt-4"
          style={{
            background: "linear-gradient(180deg, #0e1420, #0b101a)",
            borderColor: "var(--color-hairline)",
            boxShadow: "0 14px 34px rgba(0,0,0,.45)",
          }}
        >
          <div
            className="flex items-center gap-[14px] px-[18px] py-[14px] border-b ds2-cell-rule"
            style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
          >
            <div className="min-w-0">
              <div className="font-forge font-bold text-[22px] leading-none" style={{ letterSpacing: "1.5px" }}>
                {(m.title ?? "THE RIG").toUpperCase()}
              </div>
              <div className="font-condensed text-[11px] text-faint tracking-[.1em] uppercase mt-[3px]">
                the rig card · forged
              </div>
            </div>
            {m.label && (
              <span
                className="ml-auto font-display text-[12.5px] tracking-[.12em] rounded-[4px] px-[9px] pt-[3px] pb-[2px] rotate-[-1.2deg] whitespace-nowrap"
                style={{
                  color: "#f0c24a",
                  border: "1.5px solid rgba(240,194,74,.55)",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,.15), 0 1px 2px rgba(0,0,0,.5)",
                }}
              >
                {m.label} CLUB
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 border-b ds2-cell-rule">
            <div className="px-[18px] py-3 border-r ds2-cell-rule">
              <p className="font-condensed font-semibold text-[23px] tabular-nums">{money(revenue)}</p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
                Earned · full net
              </p>
            </div>
            <div className="px-[18px] py-3 border-r ds2-cell-rule">
              <p className="font-condensed font-semibold text-[23px] tabular-nums">
                {deliveredLoads.length}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
                Hauls delivered
              </p>
            </div>
            <div className="px-[18px] py-3">
              <p className="font-condensed font-semibold text-[23px] tabular-nums">
                {metrics.avgMpg != null ? metrics.avgMpg.toFixed(1) : "—"}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
                Avg MPG
              </p>
            </div>
          </div>

          {/* the payoff */}
          <div className="px-[18px] py-[13px] border-b ds2-cell-rule">
            <div className="flex justify-between items-baseline gap-3 mb-[8px]">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
                The payoff — owning the iron
              </span>
              {payoff && (
                <span className="font-condensed font-semibold text-[12.5px] text-dim tabular-nums">
                  {payoff.paidPct != null ? `${Math.round(payoff.paidPct * 100)}% yours · ` : ""}
                  {money(payoff.owed)} to go
                </span>
              )}
            </div>
            {payoff ? (
              <>
                <div className="flex gap-[3px]">
                  {Array.from({ length: 14 }, (_, ci) => (
                    <i
                      key={ci}
                      className="flex-1 h-[11px] rounded-[2.5px]"
                      style={
                        payoff.paidPct != null && (ci + 1) / 14 <= payoff.paidPct + 1e-6
                          ? {
                              background:
                                "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                              border: "1px solid rgba(245,176,58,.55)",
                              boxShadow: "0 0 6px rgba(232,148,10,.3)",
                            }
                          : {
                              background: "var(--color-well)",
                              border: "1px solid var(--color-hairline-lo)",
                              boxShadow: "inset 0 2px 3px rgba(0,0,0,.55)",
                            }
                      }
                    />
                  ))}
                </div>
                <p className="font-condensed text-[10.5px] text-faint mt-[6px]">
                  {payoff.original != null ? `${money(payoff.original)} note · ` : ""}
                  {money(payoff.monthlyPayment)}/mo — paid off, that payment comes home
                  every month
                  {payoff.payoffDate
                    ? ` · ${payoff.exact ? "payoff" : "on pace for"} ${formatDate(payoff.payoffDate)}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[7px] px-3 py-[7px]">
                No tracked note against this truck — free and clear, or add balances on
                Expenses → obligations to arm the meter.
              </p>
            )}
          </div>

          {/* next service */}
          <div className="px-[18px] py-[13px] border-b ds2-cell-rule">
            <div className="flex justify-between items-baseline gap-3 mb-[8px]">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
                Next service — the clocks
              </span>
              {nextClock && (
                <span
                  className={`font-condensed font-semibold text-[12.5px] tabular-nums ${
                    nextClock.d.level === "overdue"
                      ? "text-[#e05252]"
                      : nextClock.d.level === "soon"
                        ? "text-amber-hi"
                        : "text-dim"
                  }`}
                >
                  {nextClock.it.name.toLowerCase()}
                  {nextClock.d.milesRemaining != null
                    ? ` · ${
                        nextClock.d.milesRemaining >= 0
                          ? `${Math.round(nextClock.d.milesRemaining).toLocaleString("en-US")} mi out`
                          : `${Math.abs(Math.round(nextClock.d.milesRemaining)).toLocaleString("en-US")} mi over`
                      }`
                    : nextClock.d.daysRemaining != null
                      ? ` · ${nextClock.d.daysRemaining} days`
                      : ""}
                </span>
              )}
            </div>
            {nextClock ? (
              <>
                <div className="flex gap-[3px]">
                  {Array.from({ length: 14 }, (_, ci) => {
                    const on = (ci + 1) / 14 <= clockFill(nextClock.d.progress) + 1e-6;
                    const hot = nextClock.d.level !== "ok";
                    return (
                      <i
                        key={ci}
                        className="flex-1 h-[11px] rounded-[2.5px]"
                        style={
                          on
                            ? hot
                              ? {
                                  background: "linear-gradient(180deg, #ff8a8a, #e05252)",
                                  border: "1px solid rgba(224,82,82,.6)",
                                  boxShadow: "0 0 7px rgba(224,82,82,.4)",
                                }
                              : {
                                  background:
                                    "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                                  border: "1px solid rgba(245,176,58,.55)",
                                  boxShadow: "0 0 6px rgba(232,148,10,.3)",
                                }
                            : {
                                background: "var(--color-well)",
                                border: "1px solid var(--color-hairline-lo)",
                                boxShadow: "inset 0 2px 3px rgba(0,0,0,.55)",
                              }
                        }
                      />
                    );
                  })}
                </div>
                <p className="font-condensed text-[10.5px] text-faint mt-[6px]">
                  {clocks[1]
                    ? `${clocks[1].it.name.toLowerCase()}${
                        clocks[1].d.milesRemaining != null
                          ? ` in ${Math.round(clocks[1].d.milesRemaining).toLocaleString("en-US")} mi`
                          : ""
                      } · `
                    : ""}
                  {closeCount} clock{closeCount === 1 ? "" : "s"} running close · full
                  schedule on{" "}
                  <Link to="/maintenance" className="text-amber-hi hover:text-hot">
                    Maintenance →
                  </Link>
                </p>
              </>
            ) : (
              <p className="font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[7px] px-3 py-[7px]">
                No service clocks with a baseline yet — log services on Maintenance and
                the clocks arm.
              </p>
            )}
          </div>

          {/* mile club */}
          <div className="px-[18px] py-[13px]">
            <div className="flex justify-between items-baseline gap-3 mb-[8px]">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
                Mile club — next plate at {m.next.toLocaleString("en-US")}
              </span>
              <span className="font-condensed font-semibold text-[12.5px] text-dim tabular-nums">
                {odometer.toLocaleString("en-US")} / {m.next.toLocaleString("en-US")}
              </span>
            </div>
            <div className="flex gap-[3px]">
              {Array.from({ length: 10 }, (_, ci) => (
                <i
                  key={ci}
                  className="flex-1 h-[11px] rounded-[2.5px]"
                  style={
                    (ci + 1) / 10 <= m.pct + 1e-6
                      ? {
                          background:
                            "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                          border: "1px solid rgba(245,176,58,.55)",
                          boxShadow: "0 0 6px rgba(232,148,10,.3)",
                        }
                      : {
                          background: "var(--color-well)",
                          border: "1px solid var(--color-hairline-lo)",
                          boxShadow: "inset 0 2px 3px rgba(0,0,0,.55)",
                        }
                  }
                />
              ))}
            </div>
            {m.label && (
              <p className="font-condensed text-[10.5px] text-faint mt-[6px]">
                {m.label} plate punched · the million-mile coin is the platinum strike
              </p>
            )}
          </div>
        </div>

        {/* the hardware */}
        <HardwareBoard medals={allTruckMedals} patches={patches} records={recordChips} />

        {/* the numbers — the full running-cost strip, relocated deliberately */}
        <div className="ds2-board p-4 mt-4">
          <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
            The numbers — what it costs to run
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-3">
            {[
              {
                v: metrics.utilization != null ? `${Math.round(metrics.utilization * 100)}%` : "—",
                l: "Utilization",
                pos: true,
              },
              { v: metrics.avgMpg != null ? metrics.avgMpg.toFixed(1) : "—", l: "Avg MPG" },
              { v: metrics.bestTank != null ? metrics.bestTank.toFixed(1) : "—", l: "Best tank" },
              {
                v: metrics.fuelPerMile != null ? `$${metrics.fuelPerMile.toFixed(2)}` : "—",
                l: "Fuel / mi (90d)",
              },
              {
                v: metrics.revPerMile != null ? `$${metrics.revPerMile.toFixed(2)}` : "—",
                l: "Revenue / mi",
                pos: true,
              },
              {
                v:
                  metrics.costToRunPerMile != null
                    ? `$${metrics.costToRunPerMile.toFixed(2)}`
                    : "—",
                l: "Cost to run / mi",
              },
              {
                v: metrics.milesPerMonth != null ? num(metrics.milesPerMonth) : "—",
                l: "Mi / month",
              },
            ].map((k) => (
              <div
                key={k.l}
                className="rounded-[10px] px-3 py-2"
                style={{
                  background: "var(--color-well)",
                  border: "1px solid var(--color-hairline-lo)",
                }}
              >
                <p
                  className="font-condensed font-semibold text-[19px] tabular-nums"
                  style={k.pos ? { color: "#4ade80" } : undefined}
                >
                  {k.v}
                </p>
                <p className="font-condensed text-[10px] tracking-[.1em] uppercase text-faint mt-[2px]">
                  {k.l}
                </p>
              </div>
            ))}
          </div>
          {metrics.windowDays > 0 && (
            <p className="font-condensed text-[11.5px] text-faint mt-2">
              {metrics.windowDays.toLocaleString("en-US")} days ·{" "}
              <span style={{ color: "#4ade80" }}>{metrics.underLoadDays} under load</span> ·{" "}
              <span style={{ color: "#7ab0e8" }}>{metrics.homeDays} home</span> ·{" "}
              <span style={{ color: "#e05252" }}>{metrics.idleDays} idle</span>
            </p>
          )}
        </div>

        {/* papers */}
        <div className="ds2-board p-4 mt-4">
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
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                  Papers
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="ml-auto h-8 px-[13px] rounded-[9px] font-condensed font-semibold text-[13px] text-dim bg-well border border-hairline"
                  style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.5)" }}
                >
                  EDIT
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
                <Spec label="VIN" value={truck.vin} />
                <Spec
                  label="Plate"
                  value={
                    truck.plate_number
                      ? `${truck.plate_number} ${truck.plate_state || ""}`
                      : null
                  }
                />
                <Spec label="In service" value={formatDate(truck.in_service_date)} />
                <Spec label="Status" value={truck.status.replace(/_/g, " ")} />
              </div>
              <p className="font-condensed text-[12px] text-faint mt-3">
                Service history lives on the{" "}
                <Link to="/maintenance" className="text-amber-hi hover:text-hot">
                  Maintenance page
                </Link>
                .
              </p>
            </>
          )}
        </div>

        {/* recent hauls */}
        <div className="ds2-board p-4 mt-4">
          <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
            Recent hauls — every row links to its load
          </p>
          {earnedLoads.length === 0 ? (
            <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-[10px]">
              None for this truck yet.
            </p>
          ) : (
            <div className="mt-[6px]">
              {earnedLoads.slice(0, 6).map((l) => (
                <div
                  key={l.load_id}
                  className="grid grid-cols-[92px_1fr_90px] gap-[10px] items-baseline py-[9px] border-t ds2-cell-rule first:border-t-0 font-condensed text-[13.5px] text-dim"
                >
                  <Link
                    to={`/loads/${l.load_id}`}
                    className="font-display text-[15px] tracking-[.05em] text-amber-hi hover:text-hot"
                  >
                    {l.load_number}
                  </Link>
                  <span className="min-w-0 truncate">
                    {l.origin_market} → {l.delivery_market}
                  </span>
                  <span className="text-right font-semibold text-ink tabular-nums">
                    {money(loadRevenue(l))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TruckDetailPage;
