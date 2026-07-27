import { useMemo } from "react";
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
const money2 = (n: number) => `$${n.toFixed(2)}`;
const shortMonth = (ym: string) =>
  new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });

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
  const W = 680;
  const H = 320;
  const L = 40;
  const R = 12;
  const T = 14;
  const B = 40;
  const t = (d: string) => new Date(d + "T00:00:00Z").getTime();
  const tMin = t(points[0].date);
  const tMax = Math.max(t(points[points.length - 1].date), tMin + 86400000);
  // Scale to the LOADS, not the tier lines — so tiers that sit far above every
  // load (a very soft market, or a high break-even) never squash the points.
  // Overlay lines above the range clamp to the top edge (see `line`).
  const yMax = Math.ceil(Math.max(...points.map((p) => p.rate), 1) + 0.5);
  const x = (d: string) => L + ((t(d) - tMin) / (tMax - tMin)) * (W - L - R);
  const y = (r: number) => T + (1 - r / yMax) * (H - T - B);
  const yClamp = (r: number) => Math.max(T, Math.min(H - B, y(r)));

  // month gridline dates spanning the range
  const months: string[] = [];
  const cur = new Date(tMin);
  cur.setUTCDate(1);
  while (cur.getTime() <= tMax) {
    months.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }

  const yTicks = Array.from({ length: yMax / 2 + 1 }, (_, i) => i * 2);
  // `slot` staggers the label when a line is pinned to the top (above every
  // load) so break-even + both tier lines don't collide in a deep-downturn view.
  const line = (
    v: number | null,
    color: string,
    dash: string,
    label: string,
    slot: number,
  ) => {
    if (v == null) return null;
    const yy = yClamp(v);
    const above = v > yMax;
    return (
      <g key={label}>
        <line x1={L} y1={yy} x2={W - R} y2={yy} stroke={color} strokeWidth={1.4} strokeDasharray={dash} />
        <text x={W - R} y={above ? T + 9 + slot * 11 : yy - 3} textAnchor="end" fontSize={9} fill={color}>
          {label} {money2(v)}
          {above ? " ↑" : ""}
        </text>
      </g>
    );
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Scatter of every delivered load's gross rate per driven mile over time, colored by load type, with break-even and tier overlays">
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#5f6b80">
            ${v}
          </text>
        </g>
      ))}
      {months.map((m) => (
        <text key={m} x={x(m + "-01")} y={H - 24} textAnchor="middle" fontSize={9} fill="#5f6b80">
          {shortMonth(m)}
        </text>
      ))}
      {line(ladder.walkAway, BE, "0", "break-even", 0)}
      {line(ladder.target, "#7fb2e6", "4 3", "std target", 1)}
      {line(specLadder.target, "#e05a3a", "4 3", "spec target", 2)}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={x(p.date).toFixed(1)}
          cy={y(p.rate).toFixed(1)}
          r={5}
          fill={COLOR[p.bucket]}
          fillOpacity={0.78}
          stroke={COLOR[p.bucket]}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
};

// ---- Barometer: monthly median rate over time vs break-even ----
const Barometer = ({
  monthly,
  breakEven,
}: {
  monthly: { month: string; median: number; n: number }[];
  breakEven: number | null;
}) => {
  const W = 680;
  const H = 200;
  const L = 40;
  const R = 12;
  const T = 14;
  const B = 34;
  const yMax = Math.ceil(
    Math.max(...monthly.map((m) => m.median), breakEven ?? 0, 1) + 0.5,
  );
  const x = (i: number) =>
    L + (monthly.length <= 1 ? 0.5 : i / (monthly.length - 1)) * (W - L - R);
  const y = (r: number) => T + (1 - r / yMax) * (H - T - B);
  const path = monthly
    .map((m, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(m.median).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Line of your monthly median rate per driven mile against your break-even">
      {[0, yMax / 2, yMax].map((v) => (
        <g key={v}>
          <line x1={L} y1={y(v)} x2={W - R} y2={y(v)} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5} />
          <text x={L - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#5f6b80">
            ${v}
          </text>
        </g>
      ))}
      {breakEven != null && (
        <g>
          <line x1={L} y1={y(breakEven)} x2={W - R} y2={y(breakEven)} stroke={BE} strokeWidth={1.4} strokeDasharray="4 3" />
          <text x={W - R} y={y(breakEven) - 3} textAnchor="end" fontSize={9} fill={BE}>
            break-even {money2(breakEven)}
          </text>
        </g>
      )}
      <path d={path} fill="none" stroke="#4ade80" strokeWidth={2.5} />
      {monthly.map((m, i) => (
        <g key={m.month}>
          <circle cx={x(i)} cy={y(m.median)} r={3.5} fill="#4ade80" />
          <text x={x(i)} y={H - 18} textAnchor="middle" fontSize={9} fill="#5f6b80">
            {shortMonth(m.month)}
          </text>
        </g>
      ))}
    </svg>
  );
};

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
        <Panel className="mt-6 max-w-[720px] p-6">
          <p className="text-muted-text">
            No delivered loads with rate + mileage yet. Once you've run some
            freight, your rate history shows up here.
          </p>
        </Panel>
      ) : (
        <>
          <Panel className="mt-6 max-w-[720px] p-5">
            <div className="flex justify-between items-baseline flex-wrap gap-2">
              <h2 className="text-lg font-medium text-light">Every load · rate vs the year</h2>
              <span className="text-xs text-muted-text">gross $/driven mile</span>
            </div>
            <div className="flex gap-4 text-[11px] text-muted-text mt-1 mb-1">
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

          <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mt-4 max-w-[720px]">
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
