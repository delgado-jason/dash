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
import { computeDue, recentMilesPerMonth } from "@/lib/metrics/maintenance";
import { truckReadings, truckReadingOnOrBefore, trailerReadingToday, meterWords, shortDay } from "@/lib/metrics/trailerMeter";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { getFuelEntries } from "@/services/fuelService";
import { getTrips } from "@/services/tripsService";
import { getTrucks } from "@/services/trucksService";
import type { FuelEntry } from "@/types/fuelEntry";
import type { Trip } from "@/types/trip";
import type { Truck } from "@/types/truck";
import { loadTrailerNet } from "@/lib/metrics/rateTargets";
import { computeTrailerMetrics } from "@/lib/metrics/trailerMetrics";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { getObligations } from "@/services/obligationsService";
import type { Obligation } from "@/types/obligation";
import { isPayoffTracked, computePayoff } from "@/lib/metrics/payoff";
import { EntityAvatar } from "@/components/fleet/EntityAvatar";
import { EntityForm } from "@/components/fleet/EntityForm";
import { TRAILER_FIELDS, toFormValues } from "@/lib/fleetFields";
import { formatDate, money } from "@/lib/format";
import { useLocalToday } from "@/hooks/useLocalToday";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockSkeleton } from "@/components/ui/PageSkeletons";
import { isDelivered } from "@/lib/metrics/status";

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
  const [fuel, setFuel] = useState<FuelEntry[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [truck, setTruck] = useState<Truck | null>(null);
  // The truck's readings feed the meter; a failed fetch is named, never read as "no reading".
  const [readingsFailed, setReadingsFailed] = useState(false);
  const [readingsTick, setReadingsTick] = useState(0);
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

  // The meter's inputs, re-fetched on Retry (readingsTick bumps in the handler).
  useEffect(() => {
    if (!id) return;
    Promise.all([getFuelEntries(), getTrips(), getTrucks()])
      .then(([f, t, ts]) => {
        setFuel(f);
        setTrips(t);
        setTruck(ts[0] ?? null);
      })
      .catch(() => setReadingsFailed(true));
  }, [id, readingsTick]);

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

  // The trailer's meter is the truck's odometer, by rule (GL-07): its reading
  // today is the truck's latest reading, and it says which one it came from.
  const reading = useMemo(
    () => trailerReadingToday(truck, truckReadings(fuel, loads, trips, services)),
    [truck, fuel, loads, trips, services],
  );
  const hub = reading?.reading ?? null; // null = nobody read the truck yet, never 0
  // The trailer's own miles: today's reading less the truck's reading the day it
  // went into service. null when either end is unknown — no medal, never 0.
  const inServiceReading = useMemo(() => {
    if (!trailer?.in_service_date) return null;
    return truckReadingOnOrBefore(trailer.in_service_date.slice(0, 10), truckReadings(fuel, loads, trips, services));
  }, [trailer, fuel, loads, trips, services]);
  const trailerMiles =
    hub != null && inServiceReading != null && hub >= inServiceReading.reading ? hub - inServiceReading.reading : null;

  // The operator's local day, anchored (call 13): every metric on this page
  // reads its clock through UTC getters or epoch math, so the asset page, the
  // Fuel page and the driver card agree on what "today" is.
  const now = useLocalToday();
  const mpm = useMemo(() => recentMilesPerMonth(loads, now), [loads, now]);
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
        (l) => isDelivered(l) && l.payment_status === "paid",
      ),
    [trailerLoads],
  );
  const revenue = useMemo(
    () => earnedLoads.reduce((s, l) => s + loadTrailerNet(l), 0),
    [earnedLoads],
  );
  const deliveredLoads = useMemo(
    () => trailerLoads.filter((l) => isDelivered(l)),
    [trailerLoads],
  );
  // Every clock on this trailer, most urgent first — runs on the truck's odometer.
  const clocks = useMemo(
    () =>
      items
        .filter(
          (i) =>
            i.active &&
            i.unit === "trailer" &&
            (i.trailer_id === id || i.trailer_id == null),
        )
        .map((it) => {
          // The last service that closed this clock — "done Aug 21 at 594,801".
          const last = services
            .filter((s) => s.item_ids.includes(it.item_id) && s.service_date)
            .sort((a, b) => (a.service_date < b.service_date ? 1 : a.service_date > b.service_date ? -1 : 0))[0];
          const lastReading = last ? (last.trailer_hub ?? last.odometer) : null;
          return { it, d: computeDue(it, hub, new Date(), mpm), last: last ? { date: last.service_date, reading: lastReading } : null };
        })
        .filter(({ d }) => d.progress != null)
        .sort((a, b) => (b.d.progress ?? 0) - (a.d.progress ?? 0)),
    [items, id, hub, mpm, services],
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

  const metrics = computeTrailerMetrics(trailer, trailerLoads, services, now, trailerNote);
  const payoff = trailerLoan ? computePayoff(trailerLoan, now) : null;
  const nextClock = clocks[0] ?? null;
  const closeCount = clocks.filter(
    ({ d }) => d.level === "soon" || d.level === "overdue",
  ).length;

  const meterCell = (
    on: boolean,
    hot = false,
  ): React.CSSProperties =>
    on
      ? hot
        ? {
            background: "linear-gradient(180deg, color-mix(in srgb, var(--color-status-negative-text) 70%, transparent), var(--color-status-negative-text))",
            border: "1px solid color-mix(in srgb, var(--color-status-negative-text) 60%, transparent)",
            boxShadow: "0 0 7px color-mix(in srgb, var(--color-status-negative-text) 40%, transparent)",
          }
        : {
            background: "var(--color-amber)",
            border: "1px solid color-mix(in srgb, var(--color-amber-hi) 55%, transparent)",
            boxShadow: "0 0 6px color-mix(in srgb, var(--color-amber) 30%, transparent)",
          }
      : {
          background: "var(--color-well)",
          border: "1px solid var(--color-hairline-lo)",
          boxShadow: "var(--shadow-inset)",
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
              <span className="font-condensed font-bold text-[10.5px] tracking-[.12em] px-[7px] py-[2px] rounded-[4px] text-status-positive-text border border-status-positive-text/35 bg-status-positive-text/8 uppercase">
                {trailer.status.replace(/_/g, " ")}
              </span>
            </div>
          </div>
          <div className="ml-auto text-right">
            <span
              className="inline-block font-condensed font-semibold text-[38px] tracking-[.1em] tabular-nums px-3 py-[2px] rounded-[8px] bg-well border border-hairline"
              style={{ boxShadow: "var(--shadow-inset)" }}
            >
              {Math.round(metrics.totalMiles).toLocaleString("en-US")}
            </span>
            <p className="font-condensed text-[10.5px] tracking-[.14em] text-faint uppercase mt-1">
              miles carried · its own miles, not the tractor's
            </p>
          </div>
        </div>

        {/* the trailer card */}
        <div className="ds2-board relative overflow-hidden rounded-[14px] mt-4">
          <div className="px-[18px] py-[14px] border-b ds2-cell-rule">
            <p className="ds2-label">Trailer {trailer.unit_number} · the numbers</p>
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
                  {money(payoff.monthlyPayment)}/mo until paid off
                  {payoff.payoffDate
                    ? ` · ${payoff.exact ? "payoff" : "on pace for"} ${formatDate(payoff.payoffDate)}`
                    : ""}
                </p>
                {payoff.draftsSince > 0 && (
                  <p className="font-condensed text-[10.5px] text-faint mt-[3px] tabular-nums">
                    statement {money(payoff.statementOwed)} as of {formatDate(payoff.balanceAsOf)} ·{" "}
                    {payoff.draftsSince} {payoff.draftsSince === 1 ? "draft" : "drafts"} since
                  </p>
                )}
              </>
            ) : (
              <p className="font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[7px] px-3 py-[7px]">
                No tracked note against this trailer — free and clear, or add balances on
                Expenses → obligations to arm the meter.
              </p>
            )}
          </div>

          {/* the meter */}
          <div className="px-[18px] py-[13px] border-b ds2-cell-rule">
            <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
              The meter
            </span>
            <p className="font-condensed text-[10.5px] text-faint mt-[3px]">
              reads the truck&apos;s odometer · this trailer has no hubodometer
            </p>
            <div className="flex items-baseline gap-3 mt-[8px] flex-wrap">
              <span className="font-condensed text-[11.5px] text-faint">Reading today</span>
              <span className="font-condensed font-semibold text-[15px] text-dim tabular-nums">
                {hub != null ? num(hub) : "—"}
              </span>
            </div>
            <p className="font-condensed text-[10.5px] text-faint mt-[3px] tabular-nums">
              {meterWords(reading, truck?.unit_number)}
            </p>
            {trailerMiles != null && inServiceReading && trailer?.in_service_date && (
              <p className="font-condensed text-[10.5px] text-faint mt-[2px] tabular-nums">
                with this trailer since {shortDay(trailer.in_service_date)} · {num(trailerMiles)} mi (the truck read{" "}
                {num(inServiceReading.reading)} that day · {inServiceReading.source})
              </p>
            )}
            {readingsFailed && (
              <FetchFailed
                what="the truck's readings"
                className="mt-[6px]"
                onRetry={() => {
                  setReadingsFailed(false);
                  setReadingsTick((t) => t + 1);
                }}
              />
            )}
          </div>

          {/* next service */}
          <div className="px-[18px] py-[13px]">
            <div className="flex justify-between items-baseline gap-3 mb-[8px]">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
                Next service — the clocks · truck odometer
              </span>
              {nextClock && (
                <span
                  className={`font-condensed font-semibold text-[12.5px] tabular-nums ${
                    nextClock.d.level === "overdue"
                      ? "text-status-negative-text"
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
                {nextClock.last && (
                  <p className="font-condensed text-[10.5px] text-faint mt-[6px] tabular-nums">
                    done {shortDay(nextClock.last.date)}
                    {nextClock.last.reading != null ? ` at ${num(nextClock.last.reading)}` : " — no reading logged"}
                  </p>
                )}
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
        </div>

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
                l: "Shop + note / mi",
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
                  style={k.pos ? { color: "var(--color-status-positive-text)" } : undefined}
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
                  style={{ boxShadow: "var(--shadow-inset)" }}
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
