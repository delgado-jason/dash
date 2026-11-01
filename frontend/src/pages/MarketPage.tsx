import { useEffect, useMemo, useState } from "react";
import {
  ScatterChart,
  Scatter,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { Link } from "react-router";
import { markupToMargin, dialAdvice } from "@/lib/metrics/rateDial";
import { getFreightSignals, type FreightIndexPoint } from "@/services/marketService";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import {
  ratePoints,
  monthlyMedianRate,
  tierGauge,
  windowPoints,
  type RatePoint,
} from "@/lib/metrics/marketAnalytics";
import { marketSignal, youVsMarket, indexSentence } from "@/lib/metrics/marketSignal";
import { buildMarketCall } from "@/lib/metrics/marketCall";
import { buildCutPlan, toCutCategories } from "@/lib/metrics/cutPlanner";
import { MarketCallCard } from "@/components/market/MarketCallCard";
import { CutPanel } from "@/components/market/CutPanel";
import { getCutTierData, type CutTierRow } from "@/services/expensesService";
import { rpm } from "@/lib/format";

const MACRO = "#4f8cd6"; // FRED PPI overlay line — the house chart blue

// The app's one load-type palette (hazmat moved to violet — it was too close
// to standard's amber to tell apart).
const COLOR: Record<RatePoint["bucket"], string> = {
  standard: "#f5b03a",
  hazmat: "#8f7ad0",
  specialized: "#4f8cd6",
};
const BE = "#e05252";
const GRID = "#141c2a";
const MUTED = "#5a6880";
const monthTick = (ym: string) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
const tsMonth = (ms: number) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

const ts = (d: string) => new Date(d + "T00:00:00Z").getTime();

// ---- Scatter: every delivered load, rate/driven-mile over time, by type ----
const RateScatter = ({
  points,
  ladder,
  specLadder,
}: {
  points: RatePoint[];
  ladder: RateLadder;
  specLadder: RateLadder;
}) => {
  const series = (b: RatePoint["bucket"]) =>
    points.filter((p) => p.bucket === b).map((p) => ({ x: ts(p.date), y: p.rate }));

  // Monthly ticks across the data range.
  const t0 = ts(points[0].date);
  const t1 = ts(points[points.length - 1].date);
  const ticks: number[] = [];
  const cur = new Date(t0);
  cur.setUTCDate(1);
  while (cur.getTime() <= t1) {
    ticks.push(cur.getTime());
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  const refLine = (v: number | null, color: string, label: string) =>
    v == null ? null : (
      <ReferenceLine
        y={v}
        stroke={color}
        strokeWidth={label === "break-even" ? 1.6 : 1.2}
        strokeDasharray={label === "break-even" ? undefined : "5 3"}
        ifOverflow="extendDomain"
        label={{ value: `${label} ${rpm(v)}`, position: "right", fill: color, fontSize: 10 }}
      />
    );

  return (
    <ResponsiveContainer width="100%" height={360}>
      <ScatterChart margin={{ top: 10, right: 96, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          type="number"
          dataKey="x"
          domain={["dataMin", "dataMax"]}
          ticks={ticks}
          tickFormatter={tsMonth}
          stroke={MUTED}
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: GRID }}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[0, "auto"]}
          tickFormatter={(v) => `$${v}`}
          stroke={MUTED}
          fontSize={11}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          cursor={{ stroke: GRID }}
          contentStyle={{ background: "#1c2333", border: "1px solid #2a3347", borderRadius: 8, fontSize: 12 }}
          formatter={(value, name) => [rpm(Number(value)), name === "y" ? "rate/mi" : String(name)]}
          labelFormatter={(v) => new Date(v as number).toLocaleDateString("en-US", { timeZone: "UTC" })}
        />
        {refLine(ladder.walkAway, BE, "break-even")}
        {refLine(ladder.target, "#7fb2e6", "std target")}
        {refLine(specLadder.target, "#e05a3a", "spec target")}
        <Scatter name="standard" data={series("standard")} fill={COLOR.standard} fillOpacity={0.8} />
        <Scatter name="hazmat" data={series("hazmat")} fill={COLOR.hazmat} fillOpacity={0.85} />
        <Scatter name="specialized" data={series("specialized")} fill={COLOR.specialized} fillOpacity={0.85} />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

// ---- Barometer: your monthly median rate vs break-even, with the FRED macro
// index overlaid on a second axis (units differ — $/mile vs index points — so
// the read is "do the two trends move together", not absolute levels). ----
interface BaroPoint {
  month: string;
  median: number | null;
  ppi: number | null;
}
const Barometer = ({
  data,
  breakEven,
  hasPpi,
}: {
  data: BaroPoint[];
  breakEven: number | null;
  hasPpi: boolean;
}) => (
  <ResponsiveContainer width="100%" height={240}>
    <LineChart data={data} margin={{ top: 10, right: hasPpi ? 6 : 84, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="month"
        tickFormatter={monthTick}
        stroke={MUTED}
        fontSize={11}
        tickLine={false}
        axisLine={{ stroke: GRID }}
      />
      <YAxis
        yAxisId="rate"
        domain={[0, "auto"]}
        tickFormatter={(v) => `$${v}`}
        stroke={MUTED}
        fontSize={11}
        tickLine={false}
        axisLine={false}
      />
      {hasPpi && (
        <YAxis
          yAxisId="ppi"
          orientation="right"
          domain={[0, "auto"]} // from zero like the rate axis — an index that moved 3% reads as 3%, not as a cliff
          tickFormatter={(v) => `${Math.round(Number(v))}`}
          stroke={MACRO}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          width={40}
        />
      )}
      <Tooltip
        contentStyle={{ background: "#1c2333", border: "1px solid #2a3347", borderRadius: 8, fontSize: 12 }}
        labelFormatter={(m) => monthTick(m as string)}
        formatter={(v, name) =>
          name === "ppi" ? [`${Number(v).toFixed(1)} idx`, "FRED PPI"] : [rpm(Number(v)), "your median"]
        }
      />
      {breakEven != null && (
        <ReferenceLine
          yAxisId="rate"
          y={breakEven}
          stroke={BE}
          strokeWidth={1.4}
          strokeDasharray="4 3"
          ifOverflow="extendDomain"
          label={{ value: `break-even ${rpm(breakEven)}`, position: "insideTopLeft", fill: BE, fontSize: 10 }}
        />
      )}
      {hasPpi && (
        <Line
          yAxisId="ppi"
          type="monotone"
          dataKey="ppi"
          stroke={MACRO}
          strokeWidth={1.8}
          strokeDasharray="5 3"
          dot={false}
          connectNulls
        />
      )}
      <Line
        yAxisId="rate"
        type="monotone"
        dataKey="median"
        stroke="#f5b03a"
        strokeWidth={2.5}
        dot={{ fill: "#4ade80", r: 3 }}
        connectNulls
      />
    </LineChart>
  </ResponsiveContainer>
);

const MarketPage = () => {
  const { loads } = useLoads(0);
  const targets = useRateTargets(loads);
  const now = useMemo(() => new Date(), []);
  const [freightIndex, setFreightIndex] = useState<FreightIndexPoint[]>([]);
  const [diesel, setDiesel] = useState<FreightIndexPoint[]>([]);

  useEffect(() => {
    getFreightSignals()
      .then(({ index, diesel: d }) => {
        setFreightIndex(index);
        setDiesel(d);
      })
      .catch(() => {});
  }, []);

  const points = useMemo(() => ratePoints(loads), [loads]);
  const monthly = useMemo(() => monthlyMedianRate(points), [points]);
  // The signal: the index's three-month read, held two prints, diesel netted out.
  const signal = useMemo(() => marketSignal(freightIndex, diesel), [freightIndex, diesel]);
  // You vs the market: your standard loads over the index's last three months
  // against the three before — the same months on both sides, counts printed.
  const yvm = useMemo(() => youVsMarket(points, freightIndex), [points, freightIndex]);

  // Merge the owner's monthly median with the FRED macro index on a shared month
  // axis (union of months). Either line can gap where the other has no value.
  const baroData = useMemo(() => {
    const map = new Map<string, BaroPoint>();
    for (const m of monthly) map.set(m.month, { month: m.month, median: m.median, ppi: null });
    for (const f of freightIndex) {
      const e = map.get(f.month) ?? { month: f.month, median: null, ppi: null };
      e.ppi = f.value;
      map.set(f.month, e);
    }
    return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  }, [monthly, freightIndex]);
  const hasPpi = freightIndex.length > 0;
  // Where your rungs sit among your own accepted loads, per type — evidence
  // beside the call, never a call of its own.
  const gauge = useMemo(
    () => tierGauge(points, targets.bookingLadder, targets.specLadder, now, 90),
    [points, targets.bookingLadder, targets.specLadder, now],
  );

  // Is the WHOLE operation under break-even? Blended gross/driven mile < the
  // break-even-to-book (walkAway). This — not a single cheap tier — is what
  // makes "cut costs" the right call. (grossPerTotalMile ≥ walkAway exactly when
  // booked gross covers cost after your Landstar take.)
  const businessUnderwater =
    targets.basis.grossPerTotalMile != null &&
    targets.bookingLadder.walkAway != null &&
    targets.basis.grossPerTotalMile < targets.bookingLadder.walkAway;
  // The call — one engine, one move per tier, each on its own freight type.
  const call = useMemo(
    () => buildMarketCall(points, targets.bookingLadder, targets.specLadder, signal, now, businessUnderwater),
    [points, targets.bookingLadder, targets.specLadder, signal, now, businessUnderwater],
  );

  // The index's nudge for the rate dials (Jason, 2026-11-01): one step — two
  // points — from where the dial sits, only when the signal holds and isn't a
  // fuel move; otherwise hold, and say why. Current positions read back from
  // the ladders themselves, so the advice always compares against what's saved.
  const dialAdv = useMemo(() => {
    const bl = targets.bookingLadder;
    const sl = targets.specLadder;
    if (!bl.walkAway || !bl.target || !sl.walkAway || !sl.target) return null; // 0 → NaN ratios
    const stdM = markupToMargin(bl.target / bl.walkAway - 1);
    const specM = markupToMargin(sl.target / sl.walkAway - 1);
    return dialAdvice(signal, targets.marginGoal, stdM, specM);
  }, [signal, targets]);

  // Monthly dollars to cut to get the whole operation back to break-even:
  // cost minus what your booked gross actually leaves you — your blended keep,
  // not the linehaul take alone. > 0 exactly when businessUnderwater — the
  // same reconciled basis.
  const monthlyGap = useMemo(() => {
    const b = targets.basis;
    if (b.grossPerTotalMile == null || b.trueMonthlyCost == null || b.months <= 0) return null;
    const monthlyGross = (b.grossPerTotalMile * b.totalMiles) / b.months;
    return b.trueMonthlyCost - monthlyGross * targets.keep;
  }, [targets.basis, targets.keep]);

  // The spread the blend hides: each basis month's own rate to book (its cost
  // per driven mile ÷ the same keep), lowest to highest.
  const monthSpread = useMemo(() => {
    const rates = targets.basis.monthsDetail
      .filter((m) => m.costPerTotalMile != null)
      .map((m) => (m.costPerTotalMile as number) / targets.keep);
    if (rates.length < 2) return null;
    return { lo: Math.min(...rates), hi: Math.max(...rates) };
  }, [targets.basis.monthsDetail, targets.keep]);

  // Only fetch the cut-tier data when the plan will actually show.
  const [cutRows, setCutRows] = useState<CutTierRow[]>([]);
  useEffect(() => {
    if (!businessUnderwater) return;
    getCutTierData().then(setCutRows).catch(() => {});
  }, [businessUnderwater]);

  const cutPlan = useMemo(() => {
    if (!businessUnderwater || monthlyGap == null || monthlyGap <= 0 || cutRows.length === 0)
      return null;
    return buildCutPlan(toCutCategories(cutRows), monthlyGap);
  }, [businessUnderwater, monthlyGap, cutRows]);

  // You-vs-market readout helpers — only on a comparison that has enough loads.
  const ok = yvm?.ok ? yvm : null;
  const pctLabel = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
  const yvmScale = ok ? Math.max(Math.abs(ok.yourPct), Math.abs(ok.marketPct), 0.02) : 1;
  const yvmBar = (x: number) => Math.min(100, (Math.abs(x) / yvmScale) * 100);
  const gapPts = ok ? Math.round(Math.abs(ok.gap) * 100) : 0;
  const yvmText = ok
    ? ok.verdict === "beating"
      ? `Your standard median rose ${pctLabel(ok.yourPct)} from ${ok.prior.label} to ${ok.recent.label} while the index moved ${pctLabel(ok.marketPct)} — ahead of the cycle by ${gapPts} pts, on ${ok.recent.n} and ${ok.prior.n} loads.`
      : ok.verdict === "lagging"
        ? `Your standard median moved ${pctLabel(ok.yourPct)} from ${ok.prior.label} to ${ok.recent.label} while the index moved ${pctLabel(ok.marketPct)} — ${gapPts} pts behind, on ${ok.recent.n} and ${ok.prior.n} loads. Money on the table: lanes, agents, negotiation.`
        : `Your standard median moved ${pctLabel(ok.yourPct)} and the index ${pctLabel(ok.marketPct)} from ${ok.prior.label} to ${ok.recent.label} — moving with the cycle, on ${ok.recent.n} and ${ok.prior.n} loads.`
    : null;
  const yvmColor = ok?.verdict === "beating" ? "#4ade80" : ok?.verdict === "lagging" ? "#f0b86a" : "#c9d3e0";

  // The ladder as a distribution — where your RECENT loads landed, in the banded
  // ladder's zones. Windowed to the same trailing 90 days as the rate and gauge,
  // so old loads (booked against an older, lower ladder) don't pile into "below
  // the floor" against today's break-even. Same zone colors, same walk-away.
  const zones = (() => {
    const L = targets.bookingLadder;
    if (L.walkAway == null || L.minimum == null || L.target == null) return null;
    const wp = windowPoints(points, now, 90);
    const buckets = { below: 0, floor: 0, mid: 0, past: 0 };
    for (const pt of wp) {
      if (pt.rate < L.walkAway) buckets.below++;
      else if (pt.rate < L.minimum) buckets.floor++;
      else if (pt.rate < L.target) buckets.mid++;
      else buckets.past++;
    }
    const stdBelow = wp.filter(
      (pt) => pt.bucket === "standard" && pt.rate < (L.walkAway as number),
    ).length;
    const stdTotal = wp.filter((pt) => pt.bucket === "standard").length;
    const specBelow = wp.filter(
      (pt) => pt.bucket !== "standard" && pt.rate < (L.walkAway as number),
    ).length;
    const specTotal = wp.filter((pt) => pt.bucket !== "standard").length;
    const max = Math.max(1, buckets.below, buckets.floor, buckets.mid, buckets.past);
    // Which freight carries the rate — said only when the counts say it, never
    // as a fixed sentence (the audit found it printed regardless).
    const stdShare = stdTotal > 0 ? stdBelow / stdTotal : null;
    const specShare = specTotal > 0 ? specBelow / specTotal : null;
    const carrier =
      stdShare == null || specShare == null
        ? null
        : specShare < stdShare
          ? "The specialized freight carries the rate."
          : stdShare < specShare
            ? "The standard freight carries the rate."
            : null;
    return { ...buckets, max, stdBelow, stdTotal, specBelow, specTotal, total: wp.length, carrier };
  })();

  const lastMedian = monthly.length > 0 ? monthly[monthly.length - 1].median : null;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">MARKET</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">
            the freight market, and where you stand in it
          </span>
        </div>

        {/* the call — one move per tier, each on its own freight */}
        <div className="mt-4">
          <MarketCallCard call={call} />
          {cutPlan && <CutPanel plan={cutPlan} />}
        </div>

        {/* the index's nudge — what the held signal means for the rate dials */}
        {dialAdv && (
          <div className="ds2-board p-4 mt-4">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                The index’s nudge
              </span>
              <span className="font-condensed text-[11px] text-faint">
                from the index alone · one step when it holds · {indexSentence(signal)}
              </span>
            </div>
            <p
              className="font-condensed font-bold text-[15px] tracking-[.02em] mt-2"
              style={{ color: dialAdv.hold ? "var(--color-ok)" : dialAdv.direction === "softening" ? "var(--color-amber-hi)" : "var(--color-ok)" }}
            >
              {dialAdv.headline}
            </p>
            {!dialAdv.hold && (
              <p className="font-condensed text-[13px] text-dim mt-1 tabular-nums">
                Standard → <b className="text-ink">{(dialAdv.std * 100).toFixed(0)}%</b> margin
                {" "}({dialAdv.stdDelta >= 0 ? "+" : "−"}{Math.abs(dialAdv.stdDelta * 100).toFixed(0)} pts from where you sit)
                {" "}· Specialized → <b className="text-ink">{(dialAdv.spec * 100).toFixed(0)}%</b>
                {" "}({dialAdv.specDelta >= 0 ? "+" : "−"}{Math.abs(dialAdv.specDelta * 100).toFixed(0)} pts)
              </p>
            )}
            <p className="font-condensed text-[12px] text-faint mt-1.5">
              {dialAdv.why}{" "}
              <Link to="/settings" className="text-amber-hi hover:text-hot">adjust the dials on Settings →</Link>
            </p>
          </div>
        )}

        {/* the verdict */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          {ok ? (
            <span
              className="font-display text-[20px] tracking-[.06em] rounded-[8px] px-3 py-[3px] rotate-[-1deg] border-2"
              style={{ color: yvmColor, borderColor: yvmColor }}
            >
              {ok.verdict === "beating"
                ? "▲ BEATING THE MARKET"
                : ok.verdict === "lagging"
                  ? "▼ LAGGING THE MARKET"
                  : "▪ MOVING WITH THE MARKET"}
            </span>
          ) : (
            <span className="font-display text-[20px] tracking-[.06em] text-faint">
              THE MARKET
            </span>
          )}
          <span className="text-[13.5px] text-faint">
            {ok && (
              <>
                · <b className="font-semibold text-ink">{gapPts} pts</b> vs PPI specialized
                freight (FRED) · {ok.recent.label} vs {ok.prior.label} ·{" "}
                <b className="font-semibold text-ink">{ok.recent.n}</b> and{" "}
                <b className="font-semibold text-ink">{ok.prior.n}</b> standard loads
              </>
            )}
            {yvm && !yvm.ok && (
              <>
                · not enough standard loads to compare —{" "}
                <b className="font-semibold text-ink">{yvm.recent.n}</b> in {yvm.recent.label},{" "}
                <b className="font-semibold text-ink">{yvm.prior.n}</b> in {yvm.prior.label}; {yvm.need} on each side needed
              </>
            )}
            {lastMedian != null && (
              <>
                {" "}
                · your median <b className="font-semibold text-ink tabular-nums">{rpm(lastMedian)}</b>
                /mi driven this month
              </>
            )}
            {" "}· <b className="font-semibold text-ink">{points.length}</b> loads on the chart
          </span>
        </div>

        {points.length === 0 ? (
          <p className="font-condensed text-[13px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-4">
            No delivered loads with rate + mileage yet. Once you've run some freight,
            your rate history shows up here.
          </p>
        ) : (
          <>
            {/* scatter */}
            <div className="ds2-board overflow-hidden mt-4">
              <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                  Every load · rate vs the year
                </span>
                <span className="font-condensed text-[12px] text-faint">
                  · gross $/driven mile · break-even in red · today’s rungs drawn across every year
                  {targets.bookingLadder.walkAway != null && (
                    <>
                      {" "}· break-even{" "}
                      <b className="font-semibold text-ink tabular-nums">{rpm(targets.bookingLadder.walkAway)}</b>
                      {" "}· cost ÷ your {targets.keepSource === "blended" ? "blended keep" : "linehaul take"}{" "}
                      <b className="font-semibold text-ink tabular-nums">{Math.round(targets.keep * 100)}%</b>
                      {" "}· {targets.basis.windowLabel ?? "no P&L filed"} · {targets.basis.months} of{" "}
                      {targets.basis.monthsWanted} months filed
                      {monthSpread && (
                        <>
                          {" "}· months ran{" "}
                          <b className="font-semibold text-ink tabular-nums">{rpm(monthSpread.lo)}–{rpm(monthSpread.hi)}</b>
                        </>
                      )}
                    </>
                  )}
                </span>
              </div>
              {targets.basis.missingLabel && (
                <div className="px-4 py-[6px] border-b ds2-cell-rule font-condensed text-[12.5px] text-amber-hi">
                  ⚠ no P&L filed for {targets.basis.missingLabel} — the break-even stops short of it. File the month on{" "}
                  <Link to="/expenses" className="underline hover:text-hot">Expenses</Link> and every number on this page moves.
                </div>
              )}
              <div className="px-3 pt-3">
                {targets.ready ? (
                  <RateScatter
                    points={points}
                    ladder={targets.bookingLadder}
                    specLadder={targets.specLadder}
                  />
                ) : (
                  <p className="font-condensed text-[12.5px] text-faint py-6 text-center">
                    Upload a few months of P&L on the Expenses page to draw your
                    break-even and tier lines.
                  </p>
                )}
              </div>
              <div className="flex gap-4 flex-wrap font-condensed text-[11px] text-faint px-4 py-[9px]">
                <span>
                  <span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: COLOR.standard }} />
                  standard flatbed
                </span>
                <span>
                  <span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: COLOR.specialized }} />
                  oversize / heavy
                </span>
                <span>
                  <span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: COLOR.hazmat }} />
                  hazmat
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
              {/* barometer + you-vs-market */}
              <div className="ds2-board overflow-hidden">
                <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                  <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                    Market barometer
                  </span>
                  <span className="font-condensed text-[12px] text-faint">
                    · your monthly median vs the index · months on the axis
                  </span>
                </div>
                <div className="px-3 pt-3">
                  {monthly.length > 0 ? (
                    <>
                      <Barometer
                        data={baroData}
                        breakEven={targets.bookingLadder.walkAway}
                        hasPpi={hasPpi}
                      />
                      <div className="flex gap-4 font-condensed text-[11px] text-faint mt-1 px-1">
                        <span>
                          <span style={{ color: "#f5b03a" }}>▬</span> you (median $/mi)
                        </span>
                        {hasPpi && (
                          <span>
                            <span style={{ color: MACRO }}>╌</span> PPI specialized freight (FRED)
                          </span>
                        )}
                      </div>
                      {yvm && !yvm.ok && (
                        <p className="mt-3 pt-3 border-t ds2-cell-rule px-1 pb-3 font-condensed text-[11.5px] text-faint">
                          You vs the market · not enough standard loads to compare — {yvm.recent.n} in {yvm.recent.label}, {yvm.prior.n} in {yvm.prior.label}; {yvm.need} on each side needed.
                        </p>
                      )}
                      {ok && (
                        <div className="mt-3 pt-3 border-t ds2-cell-rule px-1 pb-3">
                          <p className="font-condensed text-[11.5px] tracking-[.12em] uppercase text-faint mb-2">
                            You vs the market · {ok.recent.label} vs {ok.prior.label} · standard loads, {ok.recent.n} and {ok.prior.n}
                          </p>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-condensed text-[11px] text-faint w-14">you</span>
                            <div
                              className="flex-1 h-2 rounded-[3px] overflow-hidden"
                              style={{ background: "var(--color-well)", boxShadow: "inset 0 2px 3px rgba(0,0,0,.5)" }}
                            >
                              <div
                                className="h-2"
                                style={{
                                  width: `${yvmBar(ok.yourPct)}%`,
                                  background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                                }}
                              />
                            </div>
                            <span
                              className="font-condensed text-xs w-14 text-right tabular-nums"
                              style={{ color: ok.yourPct >= 0 ? "#6fd08c" : "#e05252" }}
                            >
                              {pctLabel(ok.yourPct)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-condensed text-[11px] text-faint w-14">market</span>
                            <div
                              className="flex-1 h-2 rounded-[3px] overflow-hidden"
                              style={{ background: "var(--color-well)", boxShadow: "inset 0 2px 3px rgba(0,0,0,.5)" }}
                            >
                              <div className="h-2" style={{ width: `${yvmBar(ok.marketPct)}%`, background: MACRO }} />
                            </div>
                            <span className="font-condensed text-xs w-14 text-right tabular-nums" style={{ color: MACRO }}>
                              {pctLabel(ok.marketPct)}
                            </span>
                          </div>
                          {yvmText && (
                            <p
                              className="mt-2.5 rounded-[8px] px-3 py-2 font-condensed text-[11.5px] leading-relaxed"
                              style={{ background: "var(--color-well)", color: yvmColor }}
                            >
                              {yvmText}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="font-condensed text-[12.5px] text-faint py-6 text-center">No data yet.</p>
                  )}
                </div>
              </div>

              {/* tier gauge */}
              <div className="ds2-board overflow-hidden">
                <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                  <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                    Your accepted loads · where your rungs sit
                  </span>
                  <span className="font-condensed text-[12px] text-faint">
                    · last 90 days · {gauge.windowN} loads · a rung ranks among eight or more of its type · evidence for the call, not the market
                  </span>
                </div>
                <div className="px-4 py-3">
                  {gauge.rows.length > 0 ? (
                    <>
                      <div className="space-y-3">
                        {gauge.rows.map((r) => (
                          <div key={r.label}>
                            <div className="flex justify-between font-condensed text-xs">
                              <span className="text-ink">
                                {r.label} <span className="text-faint">{rpm(r.value)}</span>
                              </span>
                              <span className="tabular-nums text-dim">
                                {r.pctile == null ? (
                                  <span className="text-faint">{r.n} loads · fewer than 8 to rank</span>
                                ) : (
                                  <>
                                    {Math.round(r.pctile * 100)}
                                    <span className="text-faint text-[10px]">th pctile · {r.n} loads</span>
                                  </>
                                )}
                              </span>
                            </div>
                            <div
                              className="mt-1 h-[7px] rounded-[3px] overflow-hidden"
                              style={{ background: "var(--color-well)", boxShadow: "inset 0 2px 3px rgba(0,0,0,.5)" }}
                            >
                              <div
                                className="h-full"
                                style={{ width: `${Math.round((r.pctile ?? 0) * 100)}%`, background: "var(--color-amber-hi)" }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="font-condensed text-[12.5px] text-faint py-6 text-center">
                      Needs your break-even (Expenses P&L) to place the tiers.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* the ladder as a distribution */}
            {zones && (
              <div className="ds2-board overflow-hidden mt-4">
                <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                  <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
                    Where your loads land · the ladder as a distribution
                  </span>
                  <span className="font-condensed text-[12px] text-faint">
                    · {zones.total} loads · last 90 days · zone colors = the banded ladder's
                  </span>
                </div>
                {[
                  { n: "Below break-even", c: "#e05252", bg: "rgba(224,82,82,.45)", v: zones.below },
                  { n: "Break-even → floor", c: "var(--color-amber-hi)", bg: "rgba(232,148,10,.5)", v: zones.floor },
                  { n: "Floor → target", c: "#6fd08c", bg: "rgba(111,208,140,.45)", v: zones.mid },
                  {
                    n: "Target and past",
                    c: "var(--color-hot)",
                    bg: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                    v: zones.past,
                  },
                ].map((z) => (
                  <div
                    key={z.n}
                    className="flex items-center gap-3 px-4 py-[10px] border-t ds2-cell-rule first:border-t-0 font-condensed"
                  >
                    <span className="w-[150px] font-bold text-[11px] tracking-[.1em] uppercase" style={{ color: z.c }}>
                      {z.n}
                    </span>
                    <span
                      className="flex-1 h-[10px] rounded-[3px] overflow-hidden"
                      style={{ background: "var(--color-well)", boxShadow: "inset 0 2px 3px rgba(0,0,0,.5)" }}
                    >
                      <i className="block h-full" style={{ width: `${(z.v / zones.max) * 100}%`, background: z.bg }} />
                    </span>
                    <span className="w-[120px] text-right text-[13px] text-dim tabular-nums">
                      {z.v} load{z.v === 1 ? "" : "s"} · {Math.round((z.v / Math.max(1, zones.total)) * 100)}%
                    </span>
                  </div>
                ))}
                {zones.stdTotal > 0 && (
                  <div className="px-4 py-[10px] border-t ds2-cell-rule font-condensed text-[12.5px] text-faint">
                    <b className="text-dim">the straight read:</b> {zones.stdBelow} of your{" "}
                    {zones.stdTotal} standard-flatbed loads ran below break-even —{" "}
                    {zones.specBelow} of {zones.specTotal} specialized did.
                    {zones.carrier && <> {zones.carrier}</>} Same zones, same colors as RATE TO BOOK.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default MarketPage;
