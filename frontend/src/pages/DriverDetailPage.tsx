import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
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
import { getPerDiemDays } from "@/services/perDiemService";
import type { PerDiemDay } from "@/types/perDiem";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import { getMonthlyFinancials } from "@/services/cashflowService";
import type { MonthlyFinancialRow } from "@/services/cashflowService";
import { qboPretaxMargin } from "@/lib/metrics/cashflow";
import { hometimeStatus } from "@/lib/metrics/hometime";
import { lastHomeDay } from "@/lib/metrics/fleet";
import { useLoads } from "@/hooks/useLoads";
import { useTrips } from "@/hooks/useTrips";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockSkeleton } from "@/components/ui/PageSkeletons";
import { HardwareBoard } from "@/components/awards/HardwareBoard";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { DRIVER_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate, money } from "@/lib/format";
import {
  getCostBasis,
  getRateLadder,
  loadRevenue,
  monthlyObligationCost,
} from "@/lib/metrics/rateTargets";
import {
  RATE_TIERS,
  MARGIN_GOAL,
  tiersFrom,
  marginGoalFrom,
  type RateTiers,
} from "@/lib/constants/targets";
import { maxFuelOdometer } from "@/lib/metrics/fuelEconomy";
import {
  careerRank,
  getSeasonStats,
  marginGrade,
  rpmGrade,
  utilizationGrade,
  personalBests,
} from "@/lib/metrics/playerCard";
import { getQuarterPace } from "@/lib/metrics/quarterPace";
import { computeGrind } from "@/lib/metrics/grind";
import { loadTypeMix } from "@/lib/metrics/loadMix";
import { underLoadDaySet, firstDeliveredPickup } from "@/lib/metrics/underLoad";
import { computePatches } from "@/lib/awards/patches";
import { computeMedals, earnedMedals } from "@/lib/awards/medals";
import { assetLoanStatus } from "@/lib/metrics/payoff";
import { PlayerCard } from "@/components/playercard/PlayerCard";
import { driverRecordChips } from "@/components/awards/RecordBook";
import { LeversBoard } from "@/components/playercard/LeversBoard";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { monthCoverage } from "@/lib/metrics/monthCoverage";

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

const DriverDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { loads } = useLoads(0);
  const { trips } = useTrips(0);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [periods, setPeriods] = useState<ExpensePeriod[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [perDiemDays, setPerDiemDays] = useState<PerDiemDay[]>([]);
  const [financials, setFinancials] = useState<MonthlyFinancialRow[]>([]);
  const [hometimeThreshold, setHometimeThreshold] = useState(21);
  const [operation, setOperation] = useState("flatbed");
  const [tiers, setTiers] = useState<RateTiers>(RATE_TIERS);
  const [marginGoal, setMarginGoal] = useState(MARGIN_GOAL);
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
    // The QBO archive drives the margin lever; empty on failure → labeled app fallback.
    getMonthlyFinancials().then(setFinancials).catch(() => {});
    // This + last year of marks — same window the Fleet tab reads, so both
    // hometime chips run the identical (post-flip) lastHomeDay math.
    const yr = new Date().getUTCFullYear();
    Promise.all([getPerDiemDays(yr), getPerDiemDays(yr - 1).catch(() => [])])
      .then(([a, b]) => setPerDiemDays([...a, ...b]))
      .catch(() => {});
    getSettlementSchedule()
      .then((s) => {
        setHometimeThreshold(s.hometime_threshold_days);
        setOperation(s.operation);
        setTiers(tiersFrom(s));
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
        (l) => l.load_status === "delivered" && l.payment_status === "paid",
      ),
    [driverLoads],
  );

  // The player card only makes sense for a driver who actually hauls; a
  // dispatch-only driver (e.g. Brandie) keeps the plain page.
  const card = useMemo(() => {
    if (driverLoads.length === 0) return null;
    const now = new Date();
    // Active DEBT obligations (owner draws and on-P&L bills excluded) drive
    // break-even/rate and subtract from True Net — one rule, one helper.
    const obligationsDebt = monthlyObligationCost(obligations);
    const lifetimeMiles = Math.max(
      0,
      ...trucks.map((t) => Number(t.current_odometer) || 0),
      maxFuelOdometer(fuel) ?? 0,
      ...driverLoads.map((l) => Number(l.odometer_end) || 0),
    );
    const basis = getCostBasis(periods, obligationsDebt, driverLoads, now);
    const ladder = getRateLadder(basis.breakEvenRpm, tiers);
    const season = getSeasonStats(periods, driverLoads, driverTrips, now, obligationsDebt);
    const rpmG = rpmGrade(basis.windowRpm, ladder);
    // The margin LEVER grades the QBO pretax margin (last ≤3 closed months —
    // accountant-grade books, depreciation included) when the archive has
    // data; the app's season estimate is only a labeled fallback. Award
    // criteria (seasonStrong below) stay on the app's own season math — every
    // other award grades app data, and a QBO import must not re-fire medals.
    const appMarginG = marginGrade(season.netMargin, marginGoal);
    const qbo = qboPretaxMargin(financials, now);
    const leverMarginValue = qbo?.margin ?? season.netMargin;
    const marginG = qbo ? marginGrade(qbo.margin, marginGoal) : appMarginG;
    const marginLabel = qbo ? "Pretax margin" : "Op margin";
    const marginBasis = qbo ? `QBO · ${qbo.label}` : "app est. · this season";
    // Driver utilization (days-based) — under-load days ÷ days since first load.
    const nowKey = now.toISOString().slice(0, 10);
    const winStart = firstDeliveredPickup(driverLoads);
    const winDays = winStart
      ? Math.max(
          1,
          Math.round(
            (Date.parse(`${nowKey}T00:00:00Z`) -
              Date.parse(`${winStart}T00:00:00Z`)) /
              86_400_000,
          ),
        )
      : 0;
    const utilization =
      winDays > 0
        ? Math.min(1, underLoadDaySet(driverLoads, winStart, nowKey).size / winDays)
        : null;
    const grind = computeGrind(driverLoads, periods, obligationsDebt, now, marginGoal);
    // Medals (fixed tiers), records (improving bests), patches (hard stackable feats).
    const del = driverLoads.filter((l) => l.load_status === "delivered");
    const paidPcts = [
      assetLoanStatus(obligations, "truck", now),
      assetLoanStatus(obligations, "trailer", now),
    ]
      .map((s) => s?.ownedPct)
      .filter((x): x is number => x != null);
    const medals = computeMedals({
      lifetimeMiles,
      deliveredCount: del.length,
      cumulativeNet: del.reduce((s, l) => s + loadRevenue(l), 0),
      streak: grind.currentStreak,
      loanPaidPct: paidPcts.length ? Math.max(...paidPcts) : null,
      seasonStrong: appMarginG === "strong", // award criterion — app math, always
    });
    return {
      rank: careerRank(lifetimeMiles),
      season,
      pace: getQuarterPace(driverLoads, now),
      rpmGrade: rpmG,
      marginGrade: marginG,
      marginValue: leverMarginValue,
      marginLabel,
      marginBasis,
      rateBasis: basis.windowLabel ? `cash · ${basis.windowLabel}` : null,
      utilization,
      utilGrade: utilizationGrade(utilization),
      windowRpm: basis.windowRpm,
      medals: earnedMedals(medals),
      allMedals: medals,
      coverage: monthCoverage(periods, obligationsDebt, driverLoads, now),
      career: {
        hauls: del.length,
        miles: del.reduce((s2, l) => s2 + (Number(l.loaded_miles) || 0), 0),
        linehaul: del.reduce((s2, l) => s2 + (Number(l.linehaul) || 0), 0),
      },
      mixRows: [
        ...del
          .reduce((m, l) => {
            m.set(l.load_type, (m.get(l.load_type) ?? 0) + 1);
            return m;
          }, new Map<string, number>())
          .entries(),
      ]
        .map(([label, count]) => ({
          label,
          count,
          pct: del.length > 0 ? count / del.length : 0,
        }))
        .sort((a, b) => b.count - a.count),
      bests: personalBests(driverLoads, fuel, now),
      patches: computePatches(driverLoads, fuel, operation),
      // Equipment identity — oversize and heavy haul kept as separate disciplines.
      oversize: loadTypeMix(driverLoads, "oversize"),
      heavyHaul: loadTypeMix(driverLoads, "heavy haul"),
    };
  }, [driverLoads, driverTrips, periods, obligations, fuel, trucks, operation, tiers, marginGoal, financials]);

  // Hometime status for the (owner-op) driver — computed CLIENT-side with the
  // same flipped lastHomeDay the Fleet tab uses (post-2026-08-18 an unmarked
  // day is OUT), so the two chips can never disagree. The old backend
  // last-home endpoint only knew explicit marks.
  const hometime = useMemo(() => {
    const homeDays = perDiemDays.filter((d) => d.status === "home").map((d) => d.day);
    const travelDays = perDiemDays
      .filter((d) => d.status === "full" || d.status === "half")
      .map((d) => d.day);
    const lastHome = lastHomeDay(loads ?? [], homeDays, travelDays, new Date());
    return hometimeStatus(lastHome, hometimeThreshold, new Date());
  }, [perDiemDays, loads, hometimeThreshold]);

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
      size={84}
      allowVariant
      onUpdated={(u) => setDriver({ ...driver, avatar_url: u })}
    />
  );

  // CDL clock — local calendar days until expiration; hot inside 60.
  const todayKey = new Date().toLocaleDateString("en-CA");
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
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">DRIVERS</h1>
          <Link
            to="/drivers"
            className="font-condensed font-medium text-[15px] text-faint hover:text-ink"
          >
            ← back to the roster
          </Link>
        </div>

        <div className="flex items-center gap-4 flex-wrap mt-[18px]">
          <div className="shrink-0">{avatar}</div>
          <div className="min-w-0">
            <h2 className="font-display text-[34px] tracking-[.04em] leading-none">
              {name.toUpperCase()}
            </h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              {driver.active ? (
                <span className="font-condensed font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#6fd08c] border border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)]">
                  ACTIVE
                </span>
              ) : (
                <span className="font-condensed font-medium text-[10.5px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline">
                  INACTIVE
                </span>
              )}
              {hometime.state === "over" && (
                <span className="font-condensed font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#e05252] border border-[rgba(224,82,82,.45)] bg-[rgba(224,82,82,.1)]">
                  OUT {hometime.daysOut} DAYS · PAST YOUR {hometime.threshold}-DAY LINE
                </span>
              )}
              {hometime.state === "ok" && (
                <span className="font-condensed font-semibold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-dim border border-hairline">
                  OUT {hometime.daysOut} DAY{hometime.daysOut === 1 ? "" : "S"} ·{" "}
                  {hometime.toTarget} TO YOUR LINE
                </span>
              )}
              {hometime.state === "home" && (
                <span className="font-condensed font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#6fd08c] border border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)]">
                  HOME
                </span>
              )}
            </div>
          </div>
          {card && card.medals.length > 0 && (
            <span className="ml-auto flex gap-1.5 flex-wrap justify-end">
              {card.medals.map((m) => (
                <MedalBadge key={m.key} medal={m} />
              ))}
            </span>
          )}
        </div>

        {card && (
          <>
            <div className="mt-4">
              <PlayerCard
                rank={card.rank}
                seasonLabel={card.season.label}
                career={card.career}
                coverage={card.coverage}
                pace={card.pace}
                mix={card.mixRows}
                oversize={card.oversize}
                heavyHaul={card.heavyHaul}
              />
            </div>
            <HardwareBoard
              medals={card.allMedals}
              patches={card.patches}
              records={driverRecordChips(card.bests)}
            />
            <LeversBoard
              season={card.season}
              rpmGrade={card.rpmGrade}
              marginGrade={card.marginGrade}
              marginValue={card.marginValue}
              marginLabel={card.marginLabel}
              marginBasis={card.marginBasis}
              rateBasis={card.rateBasis}
              utilization={card.utilization}
              utilGrade={card.utilGrade}
              windowRpm={card.windowRpm}
              pace={card.pace}
            />
            <div className="flex gap-4 mt-3">
              <Link
                to="/recap"
                className="font-condensed font-semibold text-[12.5px] tracking-[.06em] text-dim hover:text-ink"
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
                  <p className="font-condensed text-[11px] tracking-[.12em] uppercase text-faint">
                    CDL expires
                  </p>
                  <p className="font-condensed text-[14px] break-words flex items-center gap-2 flex-wrap">
                    {formatDate(driver.cdl_expiration) ?? "—"}
                    {cdlDays != null &&
                      (cdlDays <= 60 ? (
                        <span className="font-bold text-[10.5px] tracking-[.1em] px-[6px] py-[1px] rounded-[4px] text-[#e05252] border border-[rgba(224,82,82,.45)] bg-[rgba(224,82,82,.1)]">
                          {cdlDays <= 0 ? "EXPIRED" : `${cdlDays} DAYS`}
                        </span>
                      ) : (
                        <span className="font-semibold text-[10.5px] tracking-[.08em] px-[6px] py-[1px] rounded-[4px] text-faint border border-hairline">
                          {cdlDays} days
                        </span>
                      ))}
                  </p>
                </div>
                <Spec label="Endorsements" value={driver.endorsements} />
                <Spec label="Hired" value={formatDate(driver.hire_date)} />
              </div>
              <p className="font-condensed text-[12px] text-faint mt-3">
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
              <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint">
                Loads hauled
              </p>
              <p className="font-condensed font-semibold text-[24px] mt-1 tabular-nums">
                {earnedLoads.length}
              </p>
            </div>
            <div className="px-4 py-3 md:border-r border-b md:border-b-0 ds2-cell-rule">
              <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint">
                Net revenue · all time
              </p>
              <p className="font-condensed font-semibold text-[24px] mt-1 tabular-nums">
                {money(revenue)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint">
                Miles hauled
              </p>
              <p className="font-condensed font-semibold text-[24px] mt-1 tabular-nums">
                {milesHauled.toLocaleString("en-US")}
              </p>
            </div>
          </div>
        )}

        {/* recent hauls — every row links to its load */}
        <div className="ds2-board p-4 mt-4">
          <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
            Recent hauls — every row links to its load
          </p>
          {earnedLoads.length === 0 ? (
            <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-[10px]">
              None for this driver yet.
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

export default DriverDetailPage;
