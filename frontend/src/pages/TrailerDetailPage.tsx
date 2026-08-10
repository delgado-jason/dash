import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { Trailer } from "@/types/trailer";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";
import { getTrailer, patchTrailer } from "@/services/trailersService";
import {
  getMaintenanceItems,
  getMaintenanceServices,
} from "@/services/maintenanceService";
import { useLoads } from "@/hooks/useLoads";
import {
  computeDue,
  recentMilesPerMonth,
  maxOdometer,
} from "@/lib/metrics/maintenance";
import { loadTrailerNet } from "@/lib/metrics/rateTargets";
import { computeTrailerMetrics } from "@/lib/metrics/trailerMetrics";
import {
  computeTrailerPatches,
  computeTrailerMedals,
  trailerRecords,
} from "@/lib/awards/trailerAwards";
import { earnedMedals } from "@/lib/awards/medals";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { type RecordChip } from "@/components/awards/RecordBook";
import { HardwareBoard } from "@/components/awards/HardwareBoard";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getObligations } from "@/services/obligationsService";
import type { Obligation } from "@/types/obligation";
import { isPayoffTracked, assetLoanStatus, computePayoff } from "@/lib/metrics/payoff";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { TRAILER_FIELDS, toFormValues } from "@/lib/fleetFields";
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
  <div>
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-sm">
      {value === null || value === undefined || value === "" ? "—" : value}
    </p>
  </div>
);

const TrailerDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { loads } = useLoads(0);
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [items, setItems] = useState<MaintenanceItem[]>([]);
  const [services, setServices] = useState<MaintenanceService[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getTrailer(id)
      .then(setTrailer)
      .catch(() => {});
    getMaintenanceItems()
      .then(setItems)
      .catch(() => {});
    getMaintenanceServices()
      .then(setServices)
      .catch(() => {});
    getObligations()
      .then(setObligations)
      .catch(() => {});
  }, [id]);

  // The loan tracked against this trailer, if any.
  const trailerLoan = obligations.find(
    (o) =>
      o.asset_type === "trailer" &&
      (o.asset_id === id || o.asset_id == null) &&
      isPayoffTracked(o),
  );

  // The trailer's monthly note — folded into cost-to-run (all-in). Active, non-draw,
  // trailer-scoped, mirroring the truck page.
  const trailerNote = obligations
    .filter(
      (o) =>
        o.active &&
        !o.is_draw &&
        o.asset_type === "trailer" &&
        (o.asset_id === id || o.asset_id == null),
    )
    .reduce((s, o) => s + (Number(o.amount) || 0), 0);

  // Latest hub reading, derived from the app: stored + newest trailer service.
  const hub = useMemo(() => {
    if (!trailer) return 0;
    const svcHubs = services
      .filter((s) => s.unit === "trailer" || s.unit === "both")
      .map((s) => s.trailer_hub);
    return maxOdometer(trailer.current_hub, ...svcHubs) ?? trailer.current_hub;
  }, [trailer, services]);

  const mpm = useMemo(() => recentMilesPerMonth(loads, new Date()), [loads]);
  const trailerLoads = useMemo(
    () => loads.filter((l) => l.trailer_id === id),
    [loads, id],
  );
  // Only earned freight — delivered AND paid. The trailer earns its share of
  // each load (loadTrailerNet: its % of linehaul + base-rate accessorials), not
  // the full net — the tractor earns the rest.
  const earnedLoads = useMemo(
    () =>
      trailerLoads.filter(
        (l) => l.load_status === "delivered" && l.payment_status === "paid",
      ),
    [trailerLoads],
  );
  const revenue = useMemo(
    () => earnedLoads.reduce((s, l) => s + loadTrailerNet(l), 0),
    [earnedLoads],
  );
  const deliveredLoads = useMemo(
    () => trailerLoads.filter((l) => l.load_status === "delivered"),
    [trailerLoads],
  );
  // Every clock on this trailer, most urgent first — runs on the hub scale.
  const clocks = useMemo(
    () =>
      items
        .filter(
          (i) =>
            i.active &&
            i.unit === "trailer" &&
            (i.trailer_id === id || i.trailer_id == null),
        )
        .map((it) => ({ it, d: computeDue(it, hub, new Date(), mpm) }))
        .filter(({ d }) => d.progress != null)
        .sort((a, b) => (b.d.progress ?? 0) - (a.d.progress ?? 0)),
    [items, id, hub, mpm],
  );

  const saveEdit = async (data: Record<string, unknown>) => {
    if (!trailer) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await patchTrailer(trailer.trailer_id, data);
      setTrailer(updated);
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

  if (!trailer)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-56 mb-2" />
        <Skeleton className="h-4 w-32 mb-6" />
        <BlockSkeleton className="h-72" />
      </div>
    );

  const now = new Date();
  const metrics = computeTrailerMetrics(trailer, trailerLoads, services, now, trailerNote);
  const allTrailerMedals = computeTrailerMedals({
    hubMiles: hub,
    earnings: revenue,
    deliveredCount: earnedLoads.length,
    loanPaidPct: assetLoanStatus(obligations, "trailer", now)?.ownedPct ?? null,
  });
  const trailerMedals = earnedMedals(allTrailerMedals);
  const payoff = trailerLoan ? computePayoff(trailerLoan, now) : null;
  const nextClock = clocks[0] ?? null;
  const closeCount = clocks.filter(
    ({ d }) => d.level === "soon" || d.level === "overdue",
  ).length;
  const m = mileMilestone(metrics.totalMiles);
  const patches = computeTrailerPatches(trailerLoads);
  const recs = trailerRecords(trailerLoads);
  const recordChips: RecordChip[] = [
    { icon: "cash", color: "#4ade80", value: recs.bestPayday != null ? money(recs.bestPayday) : "—", label: "BEST PAYDAY (MO)" },
    { icon: "flag", color: "#f5b03a", value: recs.longestHaul != null ? num(recs.longestHaul) : "—", label: "LONGEST HAUL" },
    { icon: "weight", color: "#60a5fa", value: recs.heaviestLoad != null ? num(recs.heaviestLoad) : "—", label: "HEAVIEST LOAD (LB)" },
    { icon: "road", color: "#f5b03a", value: recs.bigMonthMiles != null ? num(recs.bigMonthMiles) : "—", label: "BIG MONTH (MI)" },
  ];

  const meterCell = (
    on: boolean,
    hot = false,
  ): React.CSSProperties =>
    on
      ? hot
        ? {
            background: "linear-gradient(180deg, #ff8a8a, #e05252)",
            border: "1px solid rgba(224,82,82,.6)",
            boxShadow: "0 0 7px rgba(224,82,82,.4)",
          }
        : {
            background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
            border: "1px solid rgba(245,176,58,.55)",
            boxShadow: "0 0 6px rgba(232,148,10,.3)",
          }
      : {
          background: "var(--color-well)",
          border: "1px solid var(--color-hairline-lo)",
          boxShadow: "inset 0 2px 3px rgba(0,0,0,.55)",
        };

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">TRAILERS</h1>
          <Link
            to="/trailers"
            className="font-condensed font-medium text-[15px] text-faint hover:text-ink"
          >
            ← back to the trailers
          </Link>
        </div>

        <div className="flex items-center gap-4 flex-wrap mt-[18px]">
          <EntityAvatar
            kind="trailer"
            id={trailer.trailer_id}
            avatarUrl={trailer.avatar_url}
            size={84}
            onUpdated={(u) => setTrailer({ ...trailer, avatar_url: u })}
          />
          <div className="min-w-0">
            <h2 className="font-display text-[34px] tracking-[.04em] leading-none">
              UNIT {trailer.unit_number}
            </h2>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="font-condensed font-medium text-[10.5px] tracking-[.1em] px-[7px] py-[2px] rounded-[4px] text-faint border border-hairline uppercase">
                {[trailer.year, trailer.make, trailer.model].filter(Boolean).join(" ")}
                {trailer.trailer_type
                  ? ` · ${trailer.length_ft ? `${trailer.length_ft}′ ` : ""}${trailer.trailer_type}`
                  : ""}
              </span>
              <span className="font-condensed font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-[#6fd08c] border border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)] uppercase">
                {trailer.status.replace(/_/g, " ")}
              </span>
            </div>
            {trailerMedals.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {trailerMedals.map((md) => (
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
              {Math.round(metrics.totalMiles).toLocaleString("en-US")}
            </span>
            <p className="font-condensed text-[10.5px] tracking-[.14em] text-faint uppercase mt-1">
              miles carried · its own miles, not the tractor's
            </p>
          </div>
        </div>

        {/* the trailer card */}
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
                {(m.title ?? "THE FLATBED").toUpperCase()}
              </div>
              <div className="font-condensed text-[11px] text-faint tracking-[.1em] uppercase mt-[3px]">
                the trailer card · forged
              </div>
            </div>
            {m.crossed != null ? (
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
            ) : (
              <span className="ml-auto font-display text-[12.5px] tracking-[.12em] rounded-[4px] px-[9px] pt-[3px] pb-[2px] text-faint border border-dashed border-hairline whitespace-nowrap">
                EARNING ITS KEEP
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 border-b ds2-cell-rule">
            <div className="px-[18px] py-3 border-r ds2-cell-rule">
              <p className="font-condensed font-semibold text-[23px] tabular-nums">{money(revenue)}</p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
                Its share · 8% basis
              </p>
            </div>
            <div className="px-[18px] py-3 border-r ds2-cell-rule">
              <p className="font-condensed font-semibold text-[23px] tabular-nums">
                {deliveredLoads.length}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
                Hauls carried
              </p>
            </div>
            <div className="px-[18px] py-3">
              <p className="font-condensed font-semibold text-[23px] tabular-nums">
                {Math.round(metrics.totalMiles).toLocaleString("en-US")}
              </p>
              <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
                Miles carried
              </p>
            </div>
          </div>

          {/* the payoff — the long road */}
          <div className="px-[18px] py-[13px] border-b ds2-cell-rule">
            <div className="flex justify-between items-baseline gap-3 mb-[8px]">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
                The payoff — the long road
              </span>
              {payoff && (
                <span className="font-condensed font-semibold text-[12.5px] text-dim tabular-nums">
                  {payoff.paidPct != null ? `${(payoff.paidPct * 100).toFixed(1)}% yours · ` : ""}
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
                      style={meterCell(
                        payoff.paidPct != null && (ci + 1) / 14 <= payoff.paidPct + 1e-6,
                      )}
                    />
                  ))}
                </div>
                <p className="font-condensed text-[10.5px] text-faint mt-[6px]">
                  {payoff.original != null ? `${money(payoff.original)} note · ` : ""}
                  {money(payoff.monthlyPayment)}/mo — the TRAILER PAID OFF trophy waits at
                  the end of this road
                  {payoff.payoffDate
                    ? ` · ${payoff.exact ? "payoff" : "on pace for"} ${formatDate(payoff.payoffDate)}`
                    : ""}
                </p>
              </>
            ) : (
              <p className="font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[7px] px-3 py-[7px]">
                No tracked note against this trailer — free and clear, or add balances on
                Expenses → obligations to arm the meter.
              </p>
            )}
          </div>

          {/* next service */}
          <div className="px-[18px] py-[13px] border-b ds2-cell-rule">
            <div className="flex justify-between items-baseline gap-3 mb-[8px]">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
                Next service — the clocks · hub scale
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
                    : nextClock.d.dueDate
                      ? ` · due ${formatDate(nextClock.d.dueDate)}`
                      : ""}
                </span>
              )}
            </div>
            {nextClock ? (
              <>
                <div className="flex gap-[3px]">
                  {Array.from({ length: 14 }, (_, ci) => (
                    <i
                      key={ci}
                      className="flex-1 h-[11px] rounded-[2.5px]"
                      style={meterCell(
                        (ci + 1) / 14 <=
                          Math.min(1, Math.max(0, nextClock.d.progress ?? 0)) + 1e-6,
                        nextClock.d.level !== "ok",
                      )}
                    />
                  ))}
                </div>
                <p className="font-condensed text-[10.5px] text-faint mt-[6px]">
                  {clocks[1]
                    ? `${clocks[1].it.name.toLowerCase()}${
                        clocks[1].d.milesRemaining != null
                          ? ` in ${Math.round(clocks[1].d.milesRemaining).toLocaleString("en-US")} mi`
                          : clocks[1].d.dueDate
                            ? ` due ${formatDate(clocks[1].d.dueDate)}`
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
                No trailer clocks with a baseline yet — log services on Maintenance and
                the clocks arm.
              </p>
            )}
          </div>

          {/* mile club */}
          <div className="px-[18px] py-[13px]">
            <div className="flex justify-between items-baseline gap-3 mb-[8px]">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
                Mile club — first plate at {m.next.toLocaleString("en-US")}
              </span>
              <span className="font-condensed font-semibold text-[12.5px] text-dim tabular-nums">
                {Math.round(metrics.totalMiles).toLocaleString("en-US")} /{" "}
                {m.next.toLocaleString("en-US")}
              </span>
            </div>
            <div className="flex gap-[3px]">
              {Array.from({ length: 10 }, (_, ci) => (
                <i
                  key={ci}
                  className="flex-1 h-[11px] rounded-[2.5px]"
                  style={meterCell((ci + 1) / 10 <= m.pct + 1e-6)}
                />
              ))}
            </div>
            <p className="font-condensed text-[10.5px] text-faint mt-[6px]">
              every mile it carries counts — the 100K bronze punches first
            </p>
          </div>
        </div>

        {/* the hardware */}
        <HardwareBoard medals={allTrailerMedals} patches={patches} records={recordChips} />

        {/* the numbers */}
        <div className="ds2-board p-4 mt-4">
          <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
            The numbers — what the deck costs and earns
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {[
              {
                v:
                  metrics.utilization != null
                    ? `${Math.round(metrics.utilization * 100)}%`
                    : "—",
                l: "Utilization",
                pos: true,
              },
              {
                v:
                  metrics.earningsPerMile != null
                    ? `$${metrics.earningsPerMile.toFixed(2)}`
                    : "—",
                l: "Earnings / mi",
                pos: true,
              },
              {
                v:
                  metrics.costToRunPerMile != null
                    ? `$${metrics.costToRunPerMile.toFixed(2)}`
                    : "—",
                l: "Cost to run / mi",
                sub: "maint + note — no fuel in a trailer's basis",
              },
              {
                v:
                  metrics.milesPerMonth != null
                    ? Math.round(metrics.milesPerMonth).toLocaleString("en-US")
                    : "—",
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
                {k.sub && (
                  <p className="font-condensed text-[9.5px] text-faint">{k.sub}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* papers */}
        <div className="ds2-board p-4 mt-4">
          {editing ? (
            <EntityForm
              title="Edit trailer"
              fields={TRAILER_FIELDS}
              initial={toFormValues(
                trailer as unknown as Record<string, unknown>,
                TRAILER_FIELDS,
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
                <Spec label="VIN" value={trailer.vin} />
                <Spec
                  label="Plate"
                  value={
                    trailer.plate_number
                      ? `${trailer.plate_number} ${trailer.plate_state || ""}`
                      : null
                  }
                />
                <Spec label="In service" value={formatDate(trailer.in_service_date)} />
                <Spec
                  label="Type"
                  value={
                    trailer.trailer_type
                      ? `${trailer.trailer_type}${trailer.length_ft ? ` · ${trailer.length_ft}′` : ""}`
                      : null
                  }
                />
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

        {/* recent hauls — its share on every row */}
        <div className="ds2-board p-4 mt-4">
          <p className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
            Recent hauls — its share on every row · links to the load
          </p>
          {earnedLoads.length === 0 ? (
            <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-[10px]">
              None for this trailer yet.
            </p>
          ) : (
            <div className="mt-[6px]">
              {earnedLoads.slice(0, 6).map((l) => (
                <div
                  key={l.load_id}
                  className="grid grid-cols-[92px_1fr_110px] gap-[10px] items-baseline py-[9px] border-t ds2-cell-rule first:border-t-0 font-condensed text-[13.5px] text-dim"
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
                    {money(loadTrailerNet(l))} share
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

export default TrailerDetailPage;
