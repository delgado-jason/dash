import { useMemo, useState } from "react";
import { useTrips } from "@/hooks/useTrips";
import { useLoads } from "@/hooks/useLoads";
import TripForm from "@/components/TripForm";
import { odometerGaps, type OdometerGap } from "@/lib/metrics/odometerGaps";
import { tripTotals, EMPTY_PURPOSE } from "@/lib/metrics/tripTotals";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { RowsSkeleton } from "@/components/ui/PageSkeletons";
import { formatDate } from "@/lib/format";
import type { Trip } from "@/types/trip";

// The non-revenue-miles ledger — every mile the loads don't cover gets logged
// here so the odometer tiles, and the gap detector surfaces the miles nobody
// accounted for. Quiet game: none (ledger page).

type Purpose = Trip["trip_purpose"];
const PURPOSE: Record<Purpose, { label: string; color: string }> = {
  repositioning: { label: "Repositioning", color: "var(--color-amber-hi)" },
  home: { label: "Home", color: "#7ab0e8" },
  shop: { label: "Shop", color: "#c9a86a" },
  personal: { label: "Personal", color: "var(--color-dim)" },
};
const PURPOSES = Object.keys(PURPOSE) as Purpose[];

// "Irving, TX" from a city/state pair; falls back to whichever is present.
const place = (city: string | null, state: string | null): string | null => {
  if (city && state) return `${city}, ${state}`;
  return state || city || null;
};
const tripRoute = (trip: Trip): string => {
  const from = place(trip.start_city, trip.start_state);
  const to = place(trip.end_city, trip.end_state);
  if (!from && !to) return "—";
  return `${from ?? "?"} → ${to ?? "?"}`;
};

const miles = (t: Trip): number | null =>
  t.odometer_start != null && t.odometer_end != null && t.odometer_end > t.odometer_start
    ? Number(t.odometer_end) - Number(t.odometer_start)
    : null;

const num = (n: number) => n.toLocaleString("en-US");

// Board header labels — the local calendar, matching tripTotals' windows.
const YEAR = new Date().getFullYear();
const MONTH = new Date().toLocaleString("en-US", { month: "short" });

const PurposeChip = ({ p }: { p: Purpose }) => (
  <span
    className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[.1em] uppercase"
    style={{ color: PURPOSE[p].color }}
  >
    <span className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} />
    {PURPOSE[p].label}
  </span>
);

const TripsPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editTrip, setEditTrip] = useState<Trip | null>(null);
  const [gapOdo, setGapOdo] = useState<number | null>(null);
  const [filter, setFilter] = useState<Purpose | "all">("all");
  const { trips, isLoading, error } = useTrips(refreshKey);
  const { loads } = useLoads(0);

  // The integrity gauge — holes between the odometer windows of loads + trips.
  const gaps = useMemo(() => odometerGaps(loads ?? [], trips ?? []), [loads, trips]);
  const gapMiles = gaps.reduce((s, g) => s + g.miles, 0);

  // The year ledger, by purpose — YTD is the number these miles exist for
  // (home/shop/personal at tax time); the current month is answered once in
  // the board header and inside any cell with miles this month.
  const totals = useMemo(() => tripTotals(trips ?? []), [trips]);

  const visible = useMemo(
    () => (trips ?? []).filter((t) => filter === "all" || t.trip_purpose === filter),
    [trips, filter],
  );
  const visibleMiles = visible.reduce((s, t) => s + (miles(t) ?? 0), 0);

  // The ledger interleaves gap callouts where they fall on the odometer:
  // everything sorts descending by where its window begins, so a gap sits
  // directly beneath the row where coverage resumes.
  const ledger = useMemo(() => {
    type Item =
      | { kind: "trip"; trip: Trip; sort: number }
      | { kind: "gap"; gap: OdometerGap; sort: number };
    const items: Item[] = visible.map((t) => ({
      kind: "trip",
      trip: t,
      sort: t.odometer_start != null ? Number(t.odometer_start) : -Infinity,
    }));
    if (filter === "all")
      for (const g of gaps) items.push({ kind: "gap", gap: g, sort: g.toOdo });
    return items.sort(
      (a, b) => b.sort - a.sort || (a.kind === "gap" ? 1 : -1),
    );
  }, [visible, gaps, filter]);

  const openCreate = (prefill: number | null = null) => {
    setEditTrip(null);
    setGapOdo(prefill);
    setShowForm(true);
  };
  const openEdit = (t: Trip) => {
    setEditTrip(t);
    setGapOdo(null);
    setShowForm(true);
  };
  const closeForm = () => {
    setShowForm(false);
    setEditTrip(null);
    setGapOdo(null);
  };

  if (isLoading)
    return (
      <div className="p-6 text-ink font-body min-h-screen">
        <Skeleton className="h-8 w-24 mb-6" />
        <RowsSkeleton rows={8} />
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">TRIPS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the miles the loads don't cover
          </span>
          <span className="flex-1" />
          {!showForm && (
            <button
              onClick={() => openCreate()}
              className="h-9 px-4 rounded-[10px] font-condensed font-semibold text-[14px] tracking-[.05em] text-canvas"
              style={{
                background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
                boxShadow:
                  "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
              }}
            >
              + LOG TRIP
            </button>
          )}
        </div>

        {/* the year ledger, by purpose */}
        <div className="ds2-board overflow-hidden mt-4">
          <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
            <span className="font-display text-[17px] tracking-[.08em] text-amber-hi">{YEAR}</span>
            <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
              trip miles by purpose
            </span>
            <span className="ml-auto font-condensed font-medium text-[12.5px] text-dim">
              {MONTH} so far · <b className="font-semibold text-ink tabular-nums">{num(totals.monthMi)} mi</b>
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4">
            {PURPOSES.map((p, i) => {
              const pt = totals.byPurpose[p] ?? EMPTY_PURPOSE;
              return (
                <div
                  key={p}
                  className={`px-4 py-3 ${i < 3 ? "md:border-r" : ""} ${i < 2 ? "border-b md:border-b-0" : ""} ds2-cell-rule`}
                >
                  <PurposeChip p={p} />
                  <p
                    className={`font-condensed font-semibold text-[24px] mt-1 tabular-nums ${pt.ytdTrips === 0 ? "text-faint" : ""}`}
                  >
                    {num(pt.ytdMi)}{" "}
                    <span className="text-[13px] text-faint font-medium">
                      mi{pt.ytdTrips > 0 ? ` · ${pt.ytdTrips} trip${pt.ytdTrips === 1 ? "" : "s"}` : ""}
                    </span>
                  </p>
                  {pt.monthMi > 0 && (
                    <p className="font-condensed font-medium text-[12.5px] text-dim mt-[3px] tabular-nums">
                      {MONTH} · <b className="font-semibold text-amber-hi">{num(pt.monthMi)} mi</b>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* answering line + filters */}
        <div className="flex items-center gap-3 flex-wrap mt-4">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[21px] tracking-[.03em] tabular-nums">
              {visible.length} trip{visible.length === 1 ? "" : "s"}
            </span>
            <span className="text-[12px] text-faint">in this view ·</span>
            <b className="font-condensed font-semibold tabular-nums">{num(visibleMiles)} miles</b>
          </div>
          {gaps.length > 0 && (
            <span className="inline-flex items-center gap-1.5 h-[26px] px-3 rounded-full font-condensed font-semibold text-[12px] text-amber-hi border border-amber/30 bg-amber/10">
              ⚠ {gaps.length} gap{gaps.length === 1 ? "" : "s"} · {num(gapMiles)} mi unaccounted
            </span>
          )}
          <div
            className="ml-auto inline-flex h-8 p-[3px] rounded-[9px] bg-well gap-[2px]"
            style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
          >
            {(["all", ...PURPOSES] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 rounded-md font-condensed font-semibold text-[12.5px] ${
                  filter === f ? "bg-amber text-canvas" : "text-dim hover:text-ink"
                }`}
              >
                {f === "all" ? "All" : PURPOSE[f].label}
              </button>
            ))}
          </div>
        </div>

        {showForm && (
          <div className="mt-4">
            <TripForm
              trip={editTrip}
              prefillOdometerStart={gapOdo}
              onSuccess={() => setRefreshKey((k) => k + 1)}
              onClose={closeForm}
            />
          </div>
        )}

        {/* the ledger */}
        <div className="ds2-board mt-4 overflow-hidden">
          {(trips ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="No trips logged yet"
                hint="Log a trip to track odometer miles, routes, and deadhead."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[720px]">
                <thead>
                  <tr>
                    {["Trip", "Date", "Purpose", "Route", "Odometer", "Miles", ""].map(
                      (h, i) => (
                        <th
                          key={i}
                          className={`text-[9.5px] font-semibold tracking-[.14em] uppercase text-faint px-4 py-2.5 border-b border-hairline whitespace-nowrap ${h === "Miles" ? "text-right" : "text-left"}`}
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((item) =>
                    item.kind === "gap" ? (
                      <tr key={`gap-${item.gap.fromOdo}`}>
                        <td colSpan={7} className="border-b ds2-cell-rule p-0">
                          <div className="flex items-center gap-3 m-2 px-3.5 py-2 rounded-[9px] border border-dashed border-amber/45 bg-amber/5">
                            <span className="text-[9.5px] font-semibold tracking-[.13em] uppercase text-amber-hi shrink-0">
                              ⚠ Unaccounted
                            </span>
                            <span className="text-[12.5px] text-dim min-w-0 truncate">
                              <b className="text-ink font-condensed tabular-nums">
                                {num(item.gap.miles)} mi
                              </b>{" "}
                              with no load or trip
                              {item.gap.fromDate
                                ? ` · ${formatDate(item.gap.fromDate)} → ${item.gap.toDate ? formatDate(item.gap.toDate) : "?"}`
                                : ""}{" "}
                              · odometer {num(item.gap.fromOdo)} → {num(item.gap.toOdo)}
                            </span>
                            <button
                              onClick={() => openCreate(item.gap.fromOdo)}
                              className="ml-auto shrink-0 h-7 px-3 rounded-lg border border-amber/50 text-amber-hi font-condensed font-semibold text-[12px] hover:bg-amber/10"
                            >
                              LOG THIS GAP
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={item.trip.trip_id}
                        onClick={() => openEdit(item.trip)}
                        className="cursor-pointer transition-colors hover:bg-[#0e1420] group"
                      >
                        <td className="px-4 py-2.5 border-b ds2-cell-rule font-condensed font-semibold text-amber-hi text-[14px] whitespace-nowrap group-hover:shadow-[inset_3px_0_0_var(--color-amber)]">
                          {item.trip.trip_number}
                        </td>
                        <td className="px-4 py-2.5 border-b ds2-cell-rule text-dim text-[13px] whitespace-nowrap">
                          {formatDate(item.trip.trip_date)}
                        </td>
                        <td className="px-4 py-2.5 border-b ds2-cell-rule whitespace-nowrap">
                          <PurposeChip p={item.trip.trip_purpose} />
                        </td>
                        <td className="px-4 py-2.5 border-b ds2-cell-rule text-ink text-[13px] whitespace-nowrap">
                          {tripRoute(item.trip)}
                        </td>
                        <td className="px-4 py-2.5 border-b ds2-cell-rule text-[12.5px] whitespace-nowrap font-condensed text-dim tabular-nums">
                          {item.trip.odometer_start != null && item.trip.odometer_end != null
                            ? `${num(Number(item.trip.odometer_start))} → ${num(Number(item.trip.odometer_end))}`
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 border-b ds2-cell-rule text-right font-condensed font-semibold text-ink text-[14.5px] tabular-nums whitespace-nowrap">
                          {miles(item.trip) != null ? num(miles(item.trip)!) : "—"}
                        </td>
                        <td className="px-4 py-2.5 border-b ds2-cell-rule text-right">
                          <span className="text-[10px] text-amber-hi opacity-0 group-hover:opacity-100 transition-opacity">
                            → edit
                          </span>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TripsPage;
