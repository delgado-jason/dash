import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Driver } from "@/types/driver";
import type { ExpensePeriod } from "@/types/expense";
import type { Obligation } from "@/types/obligation";
import { getDriver, patchDriver } from "@/services/driversService";
import { getExpensePeriods } from "@/services/expensesService";
import { getObligations } from "@/services/obligationsService";
import { getPerDiemDays } from "@/services/perDiemService";
import type { PerDiemDay } from "@/types/perDiem";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { useSplitToday } from "@/hooks/useSplitToday";
import type { SettlementSchedule } from "@/types/settlementSchedule";
import { getMonthlyFinancials } from "@/services/cashflowService";
import type { MonthlyFinancialRow } from "@/services/cashflowService";
import { useLocalToday } from "@/hooks/useLocalToday";
import { localToday } from "@/lib/metrics/today";
import { hometimeStatus, homeTripDays, lastHomeSignal } from "@/lib/metrics/hometime";
import { lastHomeDay } from "@/lib/metrics/fleet";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockSkeleton } from "@/components/ui/PageSkeletons";
import { Panel } from "@/components/ui/Panel";
import { GRADE_META } from "@/components/agents/gradeMeta";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { DRIVER_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate, money } from "@/lib/format";
import {
  computeRateTargets,
  loadNetRevenue,
  monthlyObligationCost,
} from "@/lib/metrics/rateTargets";
import { MARGIN_GOAL, marginGoalFrom } from "@/lib/constants/targets";
import {
  getSeasonStats,
  gradedMargin,
  rpmGrade,
  utilizationGrade,
  bottleneckLevers,
  allLeversOnTarget,
  type Grade,
  type Lever,
} from "@/lib/metrics/playerCard";
import { firstDeliveredPickup } from "@/lib/metrics/underLoad";
import { utilizationWindow, lifetimeSinceLabel } from "@/lib/metrics/truckMetrics";
import { isDelivered } from "@/lib/metrics/status";

const Spec = ({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) => (
  <div className="min-w-0">
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-sm break-words">{value ? value : "—"}</p>
  </div>
);

// The grade word as a small chip — GRADE_META's colours, one place.
const GradeChip = ({ grade }: { grade: Grade | null }) =>
  grade ? (
    <span
      className="inline-flex items-center font-condensed font-bold text-[11px] tracking-[.06em] px-[5px] h-[17px] rounded"
      style={{ color: GRADE_META[grade].fg, background: GRADE_META[grade].bg }}
    >
      {GRADE_META[grade].label}
    </span>
  ) : null;

// A plain nudge for whichever lever is the bottleneck.
const LEVER_HINTS: Record<string, string> = {
  rate: "booking below target — hold out for better-paying freight.",
  util: "the truck sitting is what's capping the season — keep it rolling.",
  margin: "costs are eating the margin — watch deadhead and fuel.",
};

const LeverFigure = ({
  label,
  value,
  grade,
  basis,
}: {
  label: string;
  value: string;
  grade: Grade | null;
  basis: string | null;
}) => (
  <div className="min-w-0">
    <p className="ds2-label">{label}</p>
    <div className="flex items-center gap-2 mt-1">
      <span className="font-condensed font-semibold text-[26px] tabular-nums leading-none">{value}</span>
      <GradeChip grade={grade} />
    </div>
    {basis && <p className="text-[12px] text-faint mt-1">{basis}</p>}
  </div>
);

const DriverDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { loads } = useLoads(0);
  const { trips } = useTrips(0);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [perDiemDays, setPerDiemDays] = useState<PerDiemDay[]>([]);
  const [financials, setFinancials] = useState<MonthlyFinancialRow[]>([]);
  const [hometimeThreshold, setHometimeThreshold] = useState<number | null>(null); // null until Settings loads — the chip waits (GL-140)
  // The schedule itself rides along: the one basis (computeRateTargets) reads
  // the tiers, the keep and the margin goal off it (2026-11-04).
  const [schedule, setSchedule] = useState<SettlementSchedule | null>(null);
  const split = useSplitToday(); // the pay split in force today (NET-01)
  const [marginGoal, setMarginGoal] = useState(MARGIN_GOAL);
  // The operator's local day, anchored, rolling at midnight (call 13).
  const now = useLocalToday();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getDriver(id)
      .then(setDriver)
      .catch(() => {});
  }, [id]);

  // Business-level inputs for the card (P&L, obligations, schedule).
  useEffect(() => {
    getExpensePeriods().then(setPeriods).catch(() => {});
    getObligations().then(setObligations).catch(() => {});
    // The QBO archive drives the margin lever; empty on failure → labeled app fallback.
    getMonthlyFinancials().then(setFinancials).catch(() => {});
    // This + last year of marks — same window the Fleet tab reads, so both
    // hometime chips run the identical (post-flip) lastHomeDay math.
    const yr = localToday().getUTCFullYear();
    Promise.all([getPerDiemDays(yr), getPerDiemDays(yr - 1).catch(() => [])])
      .then(([a, b]) => setPerDiemDays([...a, ...b]))
      .catch(() => {});
    getSettlementSchedule()
      .then((s) => {
        setHometimeThreshold(s.hometime_threshold_days);
        setSchedule(s);
        setMarginGoal(marginGoalFrom(s));
      })
      .catch(() => {});
  }, []);

  const driverLoads = useMemo(
    () => loads.filter((l) => l.driver_id === id),
    [loads, id],
  );
  // This driver's non-revenue trips — 100% empty miles, so they belong in the
  // same deadhead math the dashboard KPI uses.
  const driverTrips = useMemo(
    () => trips.filter((t) => t.driver_id === id),
    [trips, id],
  );
  // Revenue/count use only earned freight — delivered AND paid — matching the
  // dashboard. Cancelled/booked/in-transit loads haven't earned anything yet.
  const earnedLoads = useMemo(
    () =>
      driverLoads.filter(
        (l) => isDelivered(l) && l.payment_status === "paid",
      ),
    [driverLoads],
  );

  // The per-diem marks, split the way utilization reads them: explicit home
  // days, and travel (full/half) days.
  const marks = useMemo(
    () => ({
      homeDays: perDiemDays.filter((d) => d.status === "home").map((d) => d.day),
      travelDays: perDiemDays.filter((d) => d.status === "full" || d.status === "half").map((d) => d.day),
    }),
    [perDiemDays],
  );

  // The career and levers panels only make sense for a driver who actually hauls; a
  // dispatch-only driver (e.g. Brandie) keeps the plain page.
  const card = useMemo(() => {
    if (driverLoads.length === 0) return null;
    // Active DEBT obligations (owner draws and on-P&L bills excluded) drive
    // break-even/rate and subtract from True Net — one rule, one helper.
    const obligationsDebt = monthlyObligationCost(obligations);
    // ONE basis (2026-11-04, §5 / call 12): the same computeRateTargets the
    // Dashboard, the Market and Score a Load stand on — six months, the keep
    // measured from the window's own loads. The card used to blend three
    // months of its own.
    const t = computeRateTargets(driverLoads, periods, obligationsDebt, schedule, now, driverTrips, split);
    const basis = t.basis;
    const season = getSeasonStats(periods, driverLoads, driverTrips, now, obligationsDebt);
    // The RATE lever grades what you BOOK — gross $/driven mile against the
    // booking ladder — the same number and ladder as the Dashboard's "Rate vs
    // your floor" (gross $/driven mile for pricing; net $/loaded only where
    // labelled). It used to grade net $/loaded against a net ladder.
    const rpmG = rpmGrade(t.grossRate, t.bookingLadder);
    // ONE margin on this page: the margin lever reads the
    // same graded margin (QBO pretax when the archive has closed months, else
    // the app's season estimate, labelled).
    const margin = gradedMargin(financials, season, now, marginGoal);
    // Utilization — ONE function with the Fleet tab (truckMetrics.utilizationWindow):
    // under-load days ÷ the window since the first load, a home mark winning
    // over a load span (2026-11-04, §5). The card used to run its own loop
    // without the home marks — the same 72% today by two different formulas.
    const nowKey = now.toISOString().slice(0, 10);
    const winStart = firstDeliveredPickup(driverLoads);
    const utilization = utilizationWindow(driverLoads, winStart, nowKey, marks.homeDays, marks.travelDays).utilization;
    const del = driverLoads.filter((l) => isDelivered(l));
    return {
      season,
      rpmGrade: rpmG,
      marginGrade: margin.grade,
      marginValue: margin.value,
      marginLabel: margin.label,
      marginBasis: margin.basis,
      rateBasis: basis.windowLabel ? `gross $/driven mi · ${basis.windowLabel}` : null,
      utilization,
      utilBasis: lifetimeSinceLabel(winStart),
      utilGrade: utilizationGrade(utilization),
      windowRpm: t.grossRate,
      career: {
        hauls: del.length,
        miles: del.reduce((s2, l) => s2 + (Number(l.loaded_miles) || 0), 0),
        linehaul: del.reduce((s2, l) => s2 + (Number(l.linehaul) || 0), 0),
      },
    };
  }, [driverLoads, driverTrips, periods, obligations, schedule, split, marginGoal, financials, now, marks]);

  // Hometime status for the (owner-op) driver — computed CLIENT-side with the
  // same flipped lastHomeDay the Fleet tab uses (post-2026-08-18 an unmarked
  // day is OUT), so the two chips can never disagree. The old backend
  // last-home endpoint only knew explicit marks.
  const hometime = useMemo(() => {
    if (hometimeThreshold == null) return null; // never grade against a default
    const homeDays = perDiemDays.filter((d) => d.status === "home").map((d) => d.day);
    const travelDays = perDiemDays
      .filter((d) => d.status === "full" || d.status === "half")
      .map((d) => d.day);
    // A home-purpose trip resets the counter too (GL-141) — the per-diem
    // deduction still reads the marks alone.
    const lastHome = lastHomeSignal(
      lastHomeDay(loads ?? [], homeDays, travelDays, now),
      homeTripDays(driverTrips),
      now,
    );
    return hometimeStatus(lastHome, hometimeThreshold, now);
  }, [perDiemDays, loads, driverTrips, hometimeThreshold, now]);

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
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-32 mb-6" />
        <BlockSkeleton className="h-72" />
      </div>
    );

  const revenue = earnedLoads.reduce((s, l) => s + loadNetRevenue(l), 0);
  const milesHauled = driverLoads.reduce(
    (s, l) =>
      isDelivered(l) ? s + (Number(l.loaded_miles) || 0) : s,
    0,
  );
  const name = `${driver.first_name} ${driver.last_name}`;

  const avatar = (
    <EntityAvatar
      kind="driver"
      id={driver.driver_id}
      avatarUrl={driver.avatar_url}
      size={84}
      allowVariant
      onUpdated={(u) => setDriver({ ...driver, avatar_url: u })}
    />
  );

  // CDL clock — local calendar days until expiration; hot inside 60.
  const todayKey = now.toISOString().slice(0, 10); // anchored → the local day
  const cdlDays = driver.cdl_expiration
    ? Math.round(
        (Date.parse(`${driver.cdl_expiration}T00:00:00Z`) -
          Date.parse(`${todayKey}T00:00:00Z`)) /
          86_400_000,
      )
    : null;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[28px] tracking-[.06em] leading-none">DRIVERS</h1>
          <Link
            to="/drivers"
            className="font-condensed font-medium text-[16px] text-faint hover:text-ink"
          >
            ← back to the roster
          </Link>
        </div>

        <div className="flex items-center gap-4 flex-wrap mt-[18px]">
          <div className="shrink-0">{avatar}</div>
          <div className="min-w-0">
            <h2 className="font-display text-[36.5px] tracking-[.04em] leading-none">
              {name.toUpperCase()}
            </h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              {driver.active ? (
                <span className="font-condensed font-bold text-[11.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-status-positive-text border border-status-positive-text/35 bg-status-positive-text/8">
                  ACTIVE
                </span>
              ) : (
                <span className="font-condensed font-medium text-[11.5px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline">
                  INACTIVE
                </span>
              )}
              {hometime?.state === "over" && (
                <span className="font-condensed font-bold text-[11.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-status-negative-text border border-status-negative-text/45 bg-status-negative-text/10">
                  OUT {hometime.daysOut} DAYS · PAST YOUR {hometime.threshold}-DAY LINE
                </span>
              )}
              {hometime?.state === "ok" && (
                <span className="font-condensed font-semibold text-[11.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-dim border border-hairline">
                  OUT {hometime.daysOut} DAY{hometime.daysOut === 1 ? "" : "S"} ·{" "}
                  {hometime.toTarget} TO YOUR LINE
                </span>
              )}
              {hometime?.state === "home" && (
                <span className="font-condensed font-bold text-[11.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-status-positive-text border border-status-positive-text/35 bg-status-positive-text/8">
                  HOME
                </span>
              )}
            </div>
          </div>
        </div>

        {card && (
          <>
            <Panel className="p-4 mt-4">
              <p className="ds2-label">Career · delivered loads</p>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div>
                  <p className="font-condensed font-semibold text-[26px] tabular-nums leading-none">
                    {card.career.hauls.toLocaleString("en-US")}
                  </p>
                  <p className="text-[12px] text-faint mt-1">Hauls delivered</p>
                </div>
                <div>
                  <p className="font-condensed font-semibold text-[26px] tabular-nums leading-none">
                    {Math.round(card.career.miles).toLocaleString("en-US")}
                  </p>
                  <p className="text-[12px] text-faint mt-1">Loaded miles</p>
                </div>
                <div>
                  <p className="font-condensed font-semibold text-[26px] tabular-nums leading-none">
                    {money(card.career.linehaul)}
                  </p>
                  <p className="text-[12px] text-faint mt-1">Linehaul · gross</p>
                </div>
              </div>
            </Panel>
            <Panel className="p-4 mt-4">
              <p className="ds2-label">The levers · season {card.season.label}</p>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <LeverFigure
                  label="Rate"
                  value={card.windowRpm != null ? `$${card.windowRpm.toFixed(2)}/mi` : "—"}
                  grade={card.rpmGrade}
                  basis={card.rateBasis}
                />
                <LeverFigure
                  label="Utilization"
                  value={card.utilization != null ? `${Math.round(card.utilization * 100)}%` : "—"}
                  grade={card.utilGrade}
                  basis={card.utilBasis}
                />
                <LeverFigure
                  label={card.marginLabel}
                  value={card.marginValue != null ? `${(card.marginValue * 100).toFixed(1)}%` : "—"}
                  grade={card.marginGrade}
                  basis={card.marginBasis}
                />
              </div>
              {(() => {
                const levers: Lever[] = [
                  { key: "rate", label: "Rate", grade: card.rpmGrade },
                  { key: "util", label: "Utilization", grade: card.utilGrade },
                  { key: "margin", label: card.marginLabel, grade: card.marginGrade },
                ];
                const bottleneck = bottleneckLevers(levers);
                if (bottleneck.length > 0)
                  return (
                    <p className="text-[13px] text-dim mt-3">
                      <span className="text-amber-hi">Bottleneck</span> ·{" "}
                      {bottleneck.map((l) => l.label).join(" & ")}:{" "}
                      {bottleneck.length === 1
                        ? LEVER_HINTS[bottleneck[0].key]
                        : "two levers are lagging — tackle the weakest first."}
                    </p>
                  );
                return (
                  <p className="text-[13px] text-dim mt-3">
                    {allLeversOnTarget(levers)
                      ? "Every lever at target or better."
                      : "Grades build over a full month of data."}
                  </p>
                );
              })()}
            </Panel>
            <div className="flex gap-4 mt-3">
              <Link
                to="/recap"
                className="font-condensed font-semibold text-[13.5px] tracking-[.06em] text-dim hover:text-ink"
              >
                FULL RECAP →
              </Link>
            </div>
          </>
        )}

        {/* papers — the CDL clock runs hot inside 60 days */}
        <div className="ds2-board p-4 mt-4">
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
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
                  Papers
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="ml-auto h-8 px-[13px] rounded-[9px] font-condensed font-semibold text-[14px] text-dim bg-well border border-hairline"
                  style={{ boxShadow: "var(--shadow-inset)" }}
                >
                  EDIT
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
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
                <div className="min-w-0">
                  <p className="font-condensed text-[12px] tracking-[.12em] uppercase text-faint">
                    CDL expires
                  </p>
                  <p className="font-condensed text-[15px] break-words flex items-center gap-2 flex-wrap">
                    {formatDate(driver.cdl_expiration) ?? "—"}
                    {cdlDays != null &&
                      (cdlDays <= 60 ? (
                        <span className="font-bold text-[11.5px] tracking-[.1em] px-[6px] py-[1px] rounded-[4px] text-status-negative-text border border-status-negative-text/45 bg-status-negative-text/10">
                          {cdlDays <= 0 ? "EXPIRED" : `${cdlDays} DAYS`}
                        </span>
                      ) : (
                        <span className="font-semibold text-[11.5px] tracking-[.08em] px-[6px] py-[1px] rounded-[4px] text-faint border border-hairline">
                          {cdlDays} days
                        </span>
                      ))}
                  </p>
                </div>
                <Spec label="Endorsements" value={driver.endorsements} />
                <Spec label="Hired" value={formatDate(driver.hire_date)} />
              </div>
              <p className="font-condensed text-[13px] text-faint mt-3">
                CDL is managed on the{" "}
                <Link to="/compliance" className="text-amber-hi hover:text-hot">
                  Compliance page
                </Link>
                .
              </p>
            </>
          )}
        </div>

        {/* plain stats for a non-hauling driver (hauling stats live in the card) */}
        {!card && (
          <div className="ds2-board grid grid-cols-2 md:grid-cols-3 overflow-hidden mt-4">
            <div className="px-4 py-3 md:border-r border-b md:border-b-0 ds2-cell-rule">
              <p className="font-condensed font-semibold text-[12px] tracking-[.14em] uppercase text-faint">
                Loads hauled
              </p>
              <p className="font-condensed font-semibold text-[26px] mt-1 tabular-nums">
                {earnedLoads.length}
              </p>
            </div>
            <div className="px-4 py-3 md:border-r border-b md:border-b-0 ds2-cell-rule">
              <p className="font-condensed font-semibold text-[12px] tracking-[.14em] uppercase text-faint">
                Net revenue · all time
              </p>
              <p className="font-condensed font-semibold text-[26px] mt-1 tabular-nums">
                {money(revenue)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="font-condensed font-semibold text-[12px] tracking-[.14em] uppercase text-faint">
                Miles hauled
              </p>
              <p className="font-condensed font-semibold text-[26px] mt-1 tabular-nums">
                {milesHauled.toLocaleString("en-US")}
              </p>
            </div>
          </div>
        )}

        {/* recent hauls — every row links to its load */}
        <div className="ds2-board p-4 mt-4">
          <p className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
            Recent hauls — every row links to its load
          </p>
          {earnedLoads.length === 0 ? (
            <p className="font-condensed text-[14px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-[10px]">
              None for this driver yet.
            </p>
          ) : (
            <div className="mt-[6px]">
              {earnedLoads.slice(0, 6).map((l) => (
                <div
                  key={l.load_id}
                  className="grid grid-cols-[92px_1fr_90px] gap-[10px] items-baseline py-[9px] border-t ds2-cell-rule first:border-t-0 font-condensed text-[14.5px] text-dim"
                >
                  <Link
                    to={`/loads/${l.load_id}`}
                    className="font-display text-[16px] tracking-[.05em] text-amber-hi hover:text-hot"
                  >
                    {l.load_number}
                  </Link>
                  <span className="min-w-0 truncate">
                    {l.origin_market} → {l.delivery_market}
                  </span>
                  <span className="text-right font-semibold text-ink tabular-nums">
                    {money(loadNetRevenue(l))}
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

export default DriverDetailPage;
