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
import { getFreightIndex, type FreightIndexPoint } from "@/services/marketService";
import { Panel } from "@/components/ui/Panel";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import {
  ratePoints,
  monthlyMedianRate,
  tierGauge,
  type RatePoint,
} from "@/lib/metrics/marketAnalytics";
import { marketTrend, youVsMarket } from "@/lib/metrics/marketSignal";
import { rpm } from "@/lib/format";

const MACRO = "#7fb2e6"; // FRED PPI overlay line

const COLOR: Record<RatePoint["bucket"], string> = {
  standard: "#4a90d9",
  hazmat: "#e0a020",
  specialized: "#e05a3a",
};
const BE = "#e0533a";
const GRID = "#2a3347";
const MUTED = "#9daabb";
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
          domain={["auto", "auto"]}
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
        stroke="#4ade80"
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

  useEffect(() => {
    getFreightIndex().then(setFreightIndex).catch(() => {});
  }, []);

  const points = useMemo(() => ratePoints(loads), [loads]);
  const monthly = useMemo(() => monthlyMedianRate(points), [points]);
  const trend = useMemo(() => marketTrend(freightIndex), [freightIndex]);
  const yvm = useMemo(() => youVsMarket(monthly, freightIndex), [monthly, freightIndex]);

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
  const gauge = useMemo(
    () => tierGauge(points, targets.bookingLadder, targets.specLadder, now, 90, trend?.direction),
    [points, targets.bookingLadder, targets.specLadder, now, trend],
  );

  const toneColor =
    gauge.tone === "hot" ? "#4ade80" : gauge.tone === "soft" ? "#f87171" : "#e0a020";

  // #2 You-vs-market readout helpers.
  const pctLabel = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
  const yvmScale = yvm
    ? Math.max(Math.abs(yvm.yourPct), Math.abs(yvm.marketPct), 0.02)
    : 1;
  const yvmBar = (x: number) => Math.min(100, (Math.abs(x) / yvmScale) * 100);
  const gapPts = yvm ? Math.round(Math.abs(yvm.gap) * 100) : 0;
  const yvmText =
    yvm?.verdict === "beating"
      ? `You're beating the market by ${gapPts} pts — your rates are outrunning the freight index.`
      : yvm?.verdict === "lagging"
        ? `You're lagging the market by ${gapPts} pts — it's rising faster than your rates. Room to push on rate or lanes.`
        : yvm
          ? "You're moving with the market — this looks like the cycle, not your booking."
          : null;
  const yvmColor =
    yvm?.verdict === "beating" ? "#4ade80" : yvm?.verdict === "lagging" ? "#f0b86a" : "#c9d3e0";

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <h1 className="text-3xl font-condensed">Market &amp; Rates</h1>
      <p className="text-sm text-muted-text mt-1 max-w-[680px]">
        Every delivered load by what it paid per driven mile — against your
        break-even and rate tiers. Watch the market turn, and read whether your
        tiers still fit it.
      </p>

      {points.length === 0 ? (
        <Panel className="mt-6 p-6">
          <p className="text-muted-text">
            No delivered loads with rate + mileage yet. Once you've run some
            freight, your rate history shows up here.
          </p>
        </Panel>
      ) : (
        <>
          <Panel noir className="mt-6 p-5">
            <div className="flex justify-between items-baseline flex-wrap gap-2">
              <h2 className="text-lg font-medium text-light">Every load · rate vs the year</h2>
              <span className="text-xs text-muted-text">gross $/driven mile</span>
            </div>
            <div className="flex gap-4 text-[11px] text-muted-text mt-1 mb-2">
              <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: COLOR.standard }} />standard</span>
              <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: COLOR.hazmat }} />hazmat</span>
              <span><span className="inline-block w-2.5 h-2.5 rounded-full align-middle mr-1" style={{ background: COLOR.specialized }} />oversize/heavy</span>
            </div>
            {targets.ready ? (
              <RateScatter points={points} ladder={targets.bookingLadder} specLadder={targets.specLadder} />
            ) : (
              <p className="text-xs text-muted-text py-6 text-center">
                Upload a few months of P&amp;L on the Expenses page to draw your
                break-even and tier lines.
              </p>
            )}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
            <Panel noir className="p-5">
              <h2 className="text-lg font-medium text-light">Market barometer</h2>
              <p className="text-xs text-muted-text mt-0.5 mb-2">
                your median rate per driven mile, by month
              </p>
              {monthly.length > 0 ? (
                <>
                  <Barometer data={baroData} breakEven={targets.bookingLadder.walkAway} hasPpi={hasPpi} />
                  <div className="flex gap-4 text-[11px] text-muted-text mt-1">
                    <span><span style={{ color: "#4ade80" }}>▬</span> you (median $/mi)</span>
                    {hasPpi && (
                      <span><span style={{ color: MACRO }}>╌</span> PPI specialized freight (FRED)</span>
                    )}
                  </div>
                  {yvm && (
                    <div className="mt-3 pt-3 border-t" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs text-muted-text">You vs. the market · last 6 months</span>
                        <span
                          className="ds-sfx text-xl"
                          style={{
                            color: yvmColor,
                            padding: "1px 6px",
                            background:
                              "radial-gradient(ellipse at center, rgba(245,176,58,0.16), transparent 72%)",
                          }}
                        >
                          {yvm.verdict === "beating"
                            ? "BEATING"
                            : yvm.verdict === "lagging"
                              ? "LAGGING"
                              : "IN LINE"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] text-muted-text w-14">you</span>
                        <div className="flex-1 h-2 rounded" style={{ background: "#232c3f" }}>
                          <div className="h-2 rounded" style={{ width: `${yvmBar(yvm.yourPct)}%`, background: "#4ade80" }} />
                        </div>
                        <span className="text-xs w-12 text-right tabular-nums" style={{ color: yvm.yourPct >= 0 ? "#4ade80" : "#f87171" }}>{pctLabel(yvm.yourPct)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-text w-14">market</span>
                        <div className="flex-1 h-2 rounded" style={{ background: "#232c3f" }}>
                          <div className="h-2 rounded" style={{ width: `${yvmBar(yvm.marketPct)}%`, background: MACRO }} />
                        </div>
                        <span className="text-xs w-12 text-right tabular-nums" style={{ color: MACRO }}>{pctLabel(yvm.marketPct)}</span>
                      </div>
                      <div className="mt-2.5 rounded-lg p-2.5 text-[11px] leading-relaxed" style={{ background: "#0d1119", color: yvmColor }}>
                        {yvmText}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-text py-6 text-center">No data yet.</p>
              )}
            </Panel>

            <Panel noir className="p-5">
              <h2 className="text-lg font-medium text-light">Tier gauge</h2>
              <p className="text-xs text-muted-text mt-0.5 mb-3">
                where your tiers land · last 90 days
                {gauge.windowN > 0 ? ` · ${gauge.windowN} loads` : ""}
              </p>
              {gauge.rows.length > 0 ? (
                <>
                  <div className="space-y-2.5">
                    {gauge.rows.map((r) => (
                      <div key={r.label}>
                        <div className="flex justify-between text-xs">
                          <span className="text-light">
                            {r.label}{" "}
                            <span className="text-muted-text">{rpm(r.value)}</span>
                          </span>
                          <span className="tabular-nums" style={{ color: toneColor }}>
                            {Math.round(r.pctile * 100)}
                            <span className="text-muted-text text-[10px]">th pctile</span>
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded" style={{ background: "#232c3f" }}>
                          <div
                            className="h-1.5 rounded"
                            style={{ width: `${Math.round(r.pctile * 100)}%`, background: toneColor }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {gauge.suggestion && (
                    <div
                      className="mt-4 rounded-lg p-3 text-[11px] leading-relaxed"
                      style={{ background: "#0d1119", color: "#c9d3e0" }}
                    >
                      {gauge.suggestion}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-text py-6 text-center">
                  Needs your break-even (Expenses P&amp;L) to place the tiers.
                </p>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};

export default MarketPage;
