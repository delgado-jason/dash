import { useMemo } from "react";
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
import { Panel } from "@/components/ui/Panel";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import {
  ratePoints,
  monthlyMedianRate,
  tierGauge,
  type RatePoint,
} from "@/lib/metrics/marketAnalytics";

const COLOR: Record<RatePoint["bucket"], string> = {
  standard: "#4a90d9",
  hazmat: "#e0a020",
  specialized: "#e05a3a",
};
const BE = "#e0533a";
const GRID = "#2a3347";
const MUTED = "#9daabb";
const money2 = (n: number) => `$${n.toFixed(2)}`;
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
        label={{ value: `${label} ${money2(v)}`, position: "right", fill: color, fontSize: 10 }}
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
          formatter={(value, name) => [money2(Number(value)), name === "y" ? "rate/mi" : String(name)]}
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

// ---- Barometer: monthly median rate over time vs break-even ----
const Barometer = ({
  monthly,
  breakEven,
}: {
  monthly: { month: string; median: number; n: number }[];
  breakEven: number | null;
}) => (
  <ResponsiveContainer width="100%" height={240}>
    <LineChart data={monthly} margin={{ top: 10, right: 84, bottom: 0, left: 4 }}>
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
        domain={[0, "auto"]}
        tickFormatter={(v) => `$${v}`}
        stroke={MUTED}
        fontSize={11}
        tickLine={false}
        axisLine={false}
      />
      <Tooltip
        contentStyle={{ background: "#1c2333", border: "1px solid #2a3347", borderRadius: 8, fontSize: 12 }}
        labelFormatter={(m) => monthTick(m as string)}
        formatter={(v) => [money2(Number(v)), "median"]}
      />
      {breakEven != null && (
        <ReferenceLine
          y={breakEven}
          stroke={BE}
          strokeWidth={1.4}
          strokeDasharray="4 3"
          ifOverflow="extendDomain"
          label={{ value: `break-even ${money2(breakEven)}`, position: "right", fill: BE, fontSize: 10 }}
        />
      )}
      <Line type="monotone" dataKey="median" stroke="#4ade80" strokeWidth={2.5} dot={{ fill: "#4ade80", r: 3 }} />
    </LineChart>
  </ResponsiveContainer>
);

const MarketPage = () => {
  const { loads } = useLoads(0);
  const targets = useRateTargets(loads);
  const now = useMemo(() => new Date(), []);

  const points = useMemo(() => ratePoints(loads), [loads]);
  const monthly = useMemo(() => monthlyMedianRate(points), [points]);
  const gauge = useMemo(
    () => tierGauge(points, targets.bookingLadder, targets.specLadder, now),
    [points, targets.bookingLadder, targets.specLadder, now],
  );

  const toneColor =
    gauge.tone === "hot" ? "#4ade80" : gauge.tone === "soft" ? "#f87171" : "#e0a020";

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
          <Panel className="mt-6 p-5">
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
            <Panel className="p-5">
              <h2 className="text-lg font-medium text-light">Market barometer</h2>
              <p className="text-xs text-muted-text mt-0.5 mb-2">
                your median rate per driven mile, by month
              </p>
              {monthly.length > 0 ? (
                <Barometer monthly={monthly} breakEven={targets.bookingLadder.walkAway} />
              ) : (
                <p className="text-xs text-muted-text py-6 text-center">No data yet.</p>
              )}
            </Panel>

            <Panel className="p-5">
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
                            <span className="text-muted-text">{money2(r.value)}</span>
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
