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
  windowPoints,
  type RatePoint,
} from "@/lib/metrics/marketAnalytics";
import { marketSignal, youVsMarket, indexSentence } from "@/lib/metrics/marketSignal";
import { buildMarketCall } from "@/lib/metrics/marketCall";
import { buildCutPlan, toCutCategories } from "@/lib/metrics/cutPlanner";
import { MarketCallCard } from "@/components/market/MarketCallCard";
import { CutPanel } from "@/components/market/CutPanel";
import { getCutTierData, type CutTierRow } from "@/services/expensesService";
import { rpm, money } from "@/lib/format";
import { DEADHEAD_TARGET } from "@/lib/constants/targets";
import {
  bookStanding,
  carryingTheRate,
  deadheadLever,
  RUNG_LABEL,
  rebaseBarometer,
} from "@/lib/metrics/bookStanding";
import { VERDICT_META, VERDICT_ORDER } from "@/lib/metrics/loadScore";

const MACRO = "var(--color-chart-blue)"; // FRED PPI overlay line — the house chart blue

// The app's one load-type palette (hazmat moved to violet — it was too close
// to standard's amber to tell apart).
const COLOR: Record<RatePoint["bucket"], string> = {
  standard: "var(--color-amber-hi)",
  hazmat: "var(--color-cat3)",
  specialized: "var(--color-chart-blue)",
};
const BE = "var(--color-status-negative-text)";
const GRID = "var(--color-hairline-lo)";
const MUTED = "var(--color-faint)";
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
          contentStyle={{ background: "var(--color-iron)", border: "1px solid var(--color-plate)", borderRadius: 8, fontSize: 12 }}
          formatter={(value, name) => [rpm(Number(value)), name === "y" ? "rate/mi" : String(name)]}
          labelFormatter={(v) => new Date(v as number).toLocaleDateString("en-US", { timeZone: "UTC" })}
        />
        {refLine(ladder.breakEven, BE, "break-even")}
        {refLine(ladder.target, "var(--color-status-info-text)", "std target")}
        {refLine(specLadder.target, "var(--color-cat4)", "spec target")}
        <Scatter name="standard" data={series("standard")} fill={COLOR.standard} fillOpacity={0.8} />
        <Scatter name="hazmat" data={series("hazmat")} fill={COLOR.hazmat} fillOpacity={0.85} />
        <Scatter name="specialized" data={series("specialized")} fill={COLOR.specialized} fillOpacity={0.85} />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

// ---- Barometer: your monthly median against the index — BOTH IN DOLLARS.
//
// It used to draw the FRED index on a second axis in points. An index is a
// number whose only meaning is relative to its own base year, so points beside
// dollars let the eye read a crossing or a gap that means nothing at all, and
// the only honest read was "do the two wiggles have the same shape". Jason:
// "it's a little tough to read because it's measuring two different metrics."
//
// Rebased through his own rate (see rebaseBarometer), the index becomes the
// path HIS rate would have taken had it moved with the industry — one axis,
// one unit, and the distance between the lines is a number he can say out
// loud. It is NOT a market price for his freight; the caption says so, because
// the moment it reads as an external benchmark it stops being true.
interface BaroPoint {
  month: string;
  median: number | null;
  indexPath: number | null;
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
    <LineChart data={data} margin={{ top: 10, right: 84, bottom: 0, left: 4 }}>
      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
      <XAxis
        dataKey="month"
        tickFormatter={monthTick}
        stroke={MUTED}
        fontSize={11}
        tickLine={false}
        axisLine={{ stroke: GRID }}
      />
      {/* ONE axis. Both series are now $/driven mile. */}
      <YAxis
        yAxisId="rate"
        domain={[0, "auto"]}
        tickFormatter={(v) => `$${v}`}
        stroke={MUTED}
        fontSize={11}
        tickLine={false}
        axisLine={false}
      />
      <Tooltip
        contentStyle={{ background: "var(--color-iron)", border: "1px solid var(--color-plate)", borderRadius: 8, fontSize: 12 }}
        labelFormatter={(m) => monthTick(m as string)}
        formatter={(v, name) =>
          name === "indexPath"
            ? [rpm(Number(v)), "if you'd tracked the index"]
            : [rpm(Number(v)), "your median"]
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
          yAxisId="rate"
          type="monotone"
          dataKey="indexPath"
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
        stroke="var(--color-amber-hi)"
        strokeWidth={2.5}
        dot={{ fill: "var(--color-status-positive-text)", r: 3 }}
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

  // Merge the owner's monthly median with the FRED index on a shared month
  // axis, then REBASE so both are $/driven mile. Either line can still gap
  // where the other has no value; the gap sentence only reads where both do.
  const baro = useMemo(() => {
    const map = new Map<string, { month: string; median: number | null; ppi: number | null }>();
    for (const m of monthly) map.set(m.month, { month: m.month, median: m.median, ppi: null });
    for (const f of freightIndex) {
      const e = map.get(f.month) ?? { month: f.month, median: null, ppi: null };
      e.ppi = f.value;
      map.set(f.month, e);
    }
    return rebaseBarometer([...map.values()]);
  }, [monthly, freightIndex]);
  // Without an index there is nothing to rebase against, so the chart falls
  // back to the owner's own line alone — the degraded state that was already
  // here and is still right.
  const baroData: BaroPoint[] = useMemo(
    () =>
      baro?.months ??
      monthly.map((m) => ({ month: m.month, median: m.median, indexPath: null })),
    [baro, monthly],
  );
  const hasPpi = freightIndex.length > 0;

  // Is the WHOLE operation under break-even? Blended gross/driven mile < the
  // break-even-to-book (breakEven). This — not a single cheap tier — is what
  // makes "cut costs" the right call. (grossPerTotalMile ≥ breakEven exactly when
  // booked gross covers cost after your Landstar take.)
  const businessUnderwater =
    targets.basis.grossPerTotalMile != null &&
    targets.bookingLadder.breakEven != null &&
    targets.basis.grossPerTotalMile < targets.bookingLadder.breakEven;
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
    if (!bl.breakEven || !bl.target || !sl.breakEven || !sl.target) return null; // 0 → NaN ratios
    const stdM = markupToMargin(bl.target / bl.breakEven - 1);
    const specM = markupToMargin(sl.target / sl.breakEven - 1);
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
  const yvmColor = ok?.verdict === "beating" ? "var(--color-status-positive-text)" : ok?.verdict === "lagging" ? "var(--color-amber-hi)" : "var(--color-dim)";

  // ---- Where your loads landed, and how each book is doing on its own rungs.
  //
  // FIVE bands, not four. It drew below / break-even→minimum / minimum→target
  // / "target and past", so PRIME was a rung the call card named and the chart
  // never counted — a month of three loads above prime looked identical to
  // three barely at target. These are the Scorer's own bands and colours, so a
  // load graded PRIME on Monday shows in the PRIME bar on Friday.
  //
  // Windowed to the same trailing 90 days as the rate and the gauge, so old
  // loads booked against an older ladder don't pile up under today's.
  const standing = (() => {
    const L = targets.bookingLadder;
    const S = targets.specLadder;
    if (L.breakEven == null || L.minimum == null || L.target == null || L.prime == null)
      return null;
    const wp = windowPoints(points, now, 90);
    const toBook = (pt: (typeof wp)[number]) => ({
      rpm: pt.rate,
      driven: pt.driven,
      gross: pt.gross,
      loadType: pt.bucket,
    });
    const std = bookStanding(wp.filter((pt) => pt.bucket === "standard").map(toBook), L);
    const spec = bookStanding(wp.filter((pt) => pt.bucket !== "standard").map(toBook), S);

    // Each load against ITS OWN ladder, so a $5.00 standard load reads
    // PROFITABLE while a $5.00 oversize load reads THIN. Pooling them against
    // one ladder is the same mistake as the sentence this panel replaces.
    const bands = { pass: 0, meh: 0, profit: 0, take: 0, steal: 0 };
    for (const pt of wp) {
      const d = pt.bucket === "standard" ? L : S;
      const be = d.breakEven ?? L.breakEven!;
      const mn = d.minimum ?? L.minimum!;
      const tg = d.target ?? L.target!;
      const pr = d.prime ?? L.prime!;
      if (pt.rate < be) bands.pass++;
      else if (pt.rate < mn) bands.meh++;
      else if (pt.rate < tg) bands.profit++;
      else if (pt.rate < pr) bands.take++;
      else bands.steal++;
    }

    // Hazmat and oversize run 93¢ apart on one rung; pooled they average to a
    // single mediocre number and neither case is visible. Split for DISPLAY
    // only — both are still graded on the specialized ladder, because
    // inventing a third tier set off seven loads would be worse than pooling.
    const haz = wp.filter((pt) => pt.bucket === "hazmat");
    const ovr = wp.filter((pt) => pt.bucket === "specialized");
    const split =
      haz.length > 0 && ovr.length > 0
        ? { hazmat: bookStanding(haz.map(toBook), S), oversize: bookStanding(ovr.map(toBook), S) }
        : null;

    return {
      bands,
      max: Math.max(1, ...Object.values(bands)),
      total: wp.length,
      std,
      spec,
      split,
      money:
        std.shortBy != null && spec.shortBy != null
          ? { std: std.shortBy, spec: spec.shortBy, total: std.shortBy + spec.shortBy }
          : null,
      carrier: carryingTheRate(std, spec),
      deadhead: deadheadLever(
        wp
          .filter((pt) => pt.loaded > 0)
          .map((pt) => ({ driven: pt.driven, loaded: pt.loaded, gross: pt.gross })),
        DEADHEAD_TARGET,
      ),
    };
  })();

  const lastMedian = monthly.length > 0 ? monthly[monthly.length - 1].median : null;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[28px] tracking-[.06em] leading-none">MARKET</h1>
          <span className="font-condensed font-medium text-[16px] text-dim">
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
              <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
                The index’s nudge
              </span>
              <span className="font-condensed text-[12px] text-faint">
                from the index alone · one step when it holds · {indexSentence(signal)}
              </span>
            </div>
            <p
              className="font-condensed font-bold text-[16px] tracking-[.02em] mt-2"
              style={{ color: dialAdv.hold ? "var(--color-ok)" : dialAdv.direction === "softening" ? "var(--color-amber-hi)" : "var(--color-ok)" }}
            >
              {dialAdv.headline}
            </p>
            {!dialAdv.hold && (
              <p className="font-condensed text-[14px] text-dim mt-1 tabular-nums">
                Standard → <b className="text-ink">{(dialAdv.std * 100).toFixed(0)}%</b> margin
                {" "}({dialAdv.stdDelta >= 0 ? "+" : "−"}{Math.abs(dialAdv.stdDelta * 100).toFixed(0)} pts from where you sit)
                {" "}· Specialized → <b className="text-ink">{(dialAdv.spec * 100).toFixed(0)}%</b>
                {" "}({dialAdv.specDelta >= 0 ? "+" : "−"}{Math.abs(dialAdv.specDelta * 100).toFixed(0)} pts)
              </p>
            )}
            <p className="font-condensed text-[13px] text-faint mt-1.5">
              {dialAdv.why}{" "}
              <Link to="/settings" className="text-amber-hi hover:text-hot">adjust the dials on Settings →</Link>
            </p>
          </div>
        )}

        {/* the verdict */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          {ok ? (
            <span
              className="font-condensed font-bold text-[19.5px] uppercase tracking-[.04em]"
              style={{ color: yvmColor }}
            >
              {ok.verdict === "beating"
                ? "▲ BEATING THE MARKET"
                : ok.verdict === "lagging"
                  ? "▼ LAGGING THE MARKET"
                  : "▪ MOVING WITH THE MARKET"}
            </span>
          ) : (
            <span className="font-condensed font-bold text-[19.5px] uppercase tracking-[.04em] text-faint">
              THE MARKET
            </span>
          )}
          <span className="text-[14.5px] text-faint">
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
          <p className="font-condensed text-[14px] text-faint border border-dashed border-hairline rounded-[8px] px-3 py-[10px] mt-4">
            No delivered loads with rate + mileage yet. Once you've run some freight,
            your rate history shows up here.
          </p>
        ) : (
          <>
            {/* scatter */}
            <div className="ds2-board overflow-hidden mt-4">
              <div className="flex items-baseline gap-2.5 px-4 pt-2 pb-[7px] border-b ds2-cell-rule">
                <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
                  Every load · rate vs the year
                </span>
                <span className="font-condensed text-[13px] text-faint">
                  · gross $/driven mile · break-even in red · today’s rungs drawn across every year
                  {targets.bookingLadder.breakEven != null && (
                    <>
                      {" "}· break-even{" "}
                      <b className="font-semibold text-ink tabular-nums">{rpm(targets.bookingLadder.breakEven)}</b>
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
                <div className="px-4 py-[6px] border-b ds2-cell-rule font-condensed text-[13.5px] text-amber-hi">
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
                  <p className="font-condensed text-[13.5px] text-faint py-6 text-center">
                    Upload a few months of P&L on the Expenses page to draw your
                    break-even and tier lines.
                  </p>
                )}
              </div>
              <div className="flex gap-4 flex-wrap font-condensed text-[12px] text-faint px-4 py-[9px]">
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
                  <span className="font-condensed font-semibold text-[12.5px] tracking-[.16em] uppercase text-faint">
                    Market barometer
                  </span>
                  <span className="font-condensed text-[13px] text-faint">
                    · your monthly median vs the index · months on the axis
                  </span>
                </div>
                <div className="px-3 pt-3">
                  {monthly.length > 0 ? (
                    <>
                      <Barometer
                        data={baroData}
                        breakEven={targets.bookingLadder.breakEven}
                        hasPpi={hasPpi}
                      />
                      <div className="flex gap-4 font-condensed text-[12px] text-faint mt-1 px-1">
                        <span>
                          <span style={{ color: "var(--color-amber-hi)" }}>▬</span> you (median $/mi)
                        </span>
                        {hasPpi && baro && (
                          <span>
                            <span style={{ color: MACRO }}>╌</span> if you'd tracked the index
                          </span>
                        )}
                      </div>
                      {/* THE CAPTION IS LOAD-BEARING. The dashed line is not a
                          market price for his freight — there is no oversize
                          spot feed, and that search was validated and killed
                          twice. It is his own rate moved by the industry's
                          percentage change, anchored on an average of the
                          first months both series share. Said plainly, it is
                          useful; read as an external benchmark, it is a number
                          he learns to ignore. */}
                      {baro && (
                        <p className="font-condensed text-[12px] text-faint mt-1.5 px-1 leading-snug">
                          Both lines are $/driven mile. The dashed one is{" "}
                          <span className="text-dim">
                            where your rate would sit if it had tracked the index
                          </span>{" "}
                          since {monthTick(baro.baseMonths[0])}
                          {baro.baseMonths.length > 1 && <>–{monthTick(baro.baseMonths.at(-1)!)}</>}{" "}
                          — your own rate moved by the industry's percentage change, not a
                          market price for your freight.
                          {baro.latest && (
                            <>
                              {" "}
                              You are{" "}
                              <b
                                style={{
                                  color:
                                    baro.latest.gap >= 0
                                      ? "var(--color-status-positive-text)"
                                      : "var(--color-amber-hi)",
                                }}
                              >
                                {rpm(Math.abs(baro.latest.gap))} {baro.latest.gap >= 0 ? "above" : "below"}
                              </b>{" "}
                              it as of {monthTick(baro.latest.month)}.
                            </>
                          )}
                        </p>
                      )}
                      {yvm && !yvm.ok && (
                        <p className="mt-3 pt-3 border-t ds2-cell-rule px-1 pb-3 font-condensed text-[12.5px] text-faint">
                          You vs the market · not enough standard loads to compare — {yvm.recent.n} in {yvm.recent.label}, {yvm.prior.n} in {yvm.prior.label}; {yvm.need} on each side needed.
                        </p>
                      )}
                      {ok && (
                        <div className="mt-3 pt-3 border-t ds2-cell-rule px-1 pb-3">
                          <p className="font-condensed text-[12.5px] tracking-[.12em] uppercase text-faint mb-2">
                            You vs the market · {ok.recent.label} vs {ok.prior.label} · standard loads, {ok.recent.n} and {ok.prior.n}
                          </p>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="font-condensed text-[12px] text-faint w-14">you</span>
                            <div
                              className="flex-1 h-2 rounded-[3px] overflow-hidden"
                              style={{ background: "var(--color-well)", boxShadow: "var(--shadow-inset)" }}
                            >
                              <div
                                className="h-2"
                                style={{
                                  width: `${yvmBar(ok.yourPct)}%`,
                                  background: "var(--color-amber)",
                                }}
                              />
                            </div>
                            <span
                              className="font-condensed text-xs w-14 text-right tabular-nums"
                              style={{ color: ok.yourPct >= 0 ? "var(--color-status-positive-text)" : "var(--color-status-negative-text)" }}
                            >
                              {pctLabel(ok.yourPct)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-condensed text-[12px] text-faint w-14">market</span>
                            <div
                              className="flex-1 h-2 rounded-[3px] overflow-hidden"
                              style={{ background: "var(--color-well)", boxShadow: "var(--shadow-inset)" }}
                            >
                              <div className="h-2" style={{ width: `${yvmBar(ok.marketPct)}%`, background: MACRO }} />
                            </div>
                            <span className="font-condensed text-xs w-14 text-right tabular-nums" style={{ color: MACRO }}>
                              {pctLabel(ok.marketPct)}
                            </span>
                          </div>
                          {yvmText && (
                            <p
                              className="mt-2.5 rounded-[8px] px-3 py-2 font-condensed text-[12.5px] leading-relaxed"
                              style={{ background: "var(--color-well)", color: yvmColor }}
                            >
                              {yvmText}
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="font-condensed text-[13.5px] text-faint py-6 text-center">No data yet.</p>
                  )}
                </div>
              </div>

            </div>

            {/* the ladder as a distribution, each book on its own rungs */}
            {standing && (
              <div className="ds2-board overflow-hidden mt-4">
                <div className="px-4 py-3 border-b ds2-cell-rule">
                  <p className="ds2-label">Where your loads land</p>
                  <p className="font-condensed text-[13px] text-faint mt-0.5">
                    · {standing.total} loads · last 90 days · each load against ITS OWN ladder,
                    in the Scorer's words
                  </p>
                </div>

                <div className="px-4 py-3 flex flex-col gap-2">
                  {VERDICT_ORDER.map((v) => {
                    const n = standing.bands[v];
                    const meta = VERDICT_META[v];
                    return (
                      <div key={v} className="grid grid-cols-[132px_1fr_104px] gap-3 items-center">
                        <span
                          className="font-condensed text-[12px] tracking-[.06em]"
                          style={{ color: meta.fg }}
                        >
                          {meta.label}
                        </span>
                        <span className="h-[16px] rounded-[4px] bg-hairline/40 relative overflow-hidden">
                          <span
                            className="absolute inset-y-0 left-0 rounded-[4px]"
                            style={{
                              width: `${(n / standing.max) * 100}%`,
                              background: `color-mix(in srgb, ${meta.fg} 45%, transparent)`,
                            }}
                          />
                        </span>
                        <span className="font-condensed text-[12.5px] text-dim text-right tabular-nums">
                          {n} load{n === 1 ? "" : "s"} ·{" "}
                          {standing.total > 0 ? Math.round((n / standing.total) * 100) : 0}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* HOW OFTEN YOU GET IT — what replaced the percentile card. A
                    percentile of a rung is two abstractions stacked, and most
                    rows read "fewer than 8 to rank" anyway. This counts. */}
                <div className="px-4 py-3 border-t ds2-cell-rule">
                  <p className="ds2-label">How often you get it</p>
                  <table className="w-full mt-2 font-condensed text-[13.5px] tabular-nums">
                    <thead>
                      <tr className="text-faint text-[11px] tracking-[.1em] uppercase">
                        <th className="text-left font-semibold pb-1.5">Rung</th>
                        <th className="text-right font-semibold pb-1.5">
                          Standard · {standing.std.loads}
                        </th>
                        <th className="text-right font-semibold pb-1.5">
                          Specialized · {standing.spec.loads}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {standing.std.hits.map((h, i) => {
                        // EACH COLUMN CARRIES ITS OWN RATE. One rung price
                        // beside two columns reads as though both books were
                        // measured against it, and they are not — the whole
                        // point is that specialized is held higher.
                        const cell = (
                          x: { rate: number; hit: number; of: number; share: number | null } | undefined,
                        ) =>
                          x == null || x.share == null ? (
                            <span className="text-faint">—</span>
                          ) : (
                            <>
                              <span className="text-faint">{rpm(x.rate)}</span> {x.hit}/{x.of}{" "}
                              <span className="text-faint">· {Math.round(x.share * 100)}%</span>
                            </>
                          );
                        const isMin = h.rung === "minimum";
                        return (
                          <tr key={h.rung} className={isMin ? "text-ink" : "text-dim"}>
                            <td className={`py-1 ${isMin ? "font-semibold" : ""}`}>
                              {RUNG_LABEL[h.rung]}
                            </td>
                            <td className={`py-1 text-right ${isMin ? "font-semibold" : ""}`}>
                              {cell(h)}
                            </td>
                            <td className={`py-1 text-right ${isMin ? "font-semibold" : ""}`}>
                              {cell(standing.spec.hits[i])}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Each book against ITS OWN minimum. The sentence this
                      replaces counted loads below a SHARED break-even and so
                      named the weaker book the winner. */}
                  <p className="font-condensed text-[13.5px] text-dim mt-2.5">
                    <b className="text-ink">{standing.carrier.why}</b>
                  </p>

                  {standing.split && (
                    <p className="font-condensed text-[13px] text-faint mt-1.5">
                      Inside specialized:{" "}
                      <span className="text-dim">
                        hazmat {rpm(standing.split.hazmat.median)} on {standing.split.hazmat.loads},
                        oversize {rpm(standing.split.oversize.median)} on{" "}
                        {standing.split.oversize.loads}
                      </span>{" "}
                      — both held to the same {rpm(targets.specLadder.minimum)} rung.
                    </p>
                  )}
                </div>

                {/* THE MONEY. The cut planner ends by saying the last stretch
                    has to come from rate and then stops, because it has no
                    business saying where rate comes from. This page does. */}
                {standing.money && standing.money.total > 0 && (
                  <div className="px-4 py-3 border-t ds2-cell-rule">
                    <p className="ds2-label">What the gap is worth</p>
                    <p className="font-condensed text-[13.5px] text-dim mt-1.5">
                      Priced at each book's own minimum, the last 90 days would have paid{" "}
                      <b className="text-ink">{money(standing.money.total)}</b> more —{" "}
                      <b className="text-ink">{money(standing.money.spec)}</b> of it specialized,
                      or about <b className="text-amber-hi">{money(standing.money.spec / 3)}</b> a
                      month.
                    </p>
                  </div>
                )}

                {/* The one rate lever that isn't a negotiation. */}
                {standing.deadhead?.gainPerMile != null && (
                  <div className="px-4 py-3 border-t ds2-cell-rule">
                    <p className="ds2-label">Deadhead — the lever nobody has to agree to</p>
                    <p className="font-condensed text-[13.5px] text-dim mt-1.5">
                      <b className="text-ink">{Math.round(standing.deadhead.share * 1000) / 10}%</b>{" "}
                      of your driven miles were empty, against your{" "}
                      {Math.round(standing.deadhead.target * 100)}% target. The same freight at
                      target pays <b className="text-ink">{rpm(standing.deadhead.rateAtTarget)}</b>{" "}
                      instead of {rpm(standing.deadhead.rateNow)} —{" "}
                      <b className="text-amber-hi">{rpm(standing.deadhead.gainPerMile)} a driven mile</b>
                      , from the same agents, without anyone agreeing to anything.
                    </p>
                  </div>
                )}
              </div>
            )}          </>
        )}
      </div>
    </div>
  );
};

export default MarketPage;
