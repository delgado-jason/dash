import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { QuarterPace } from "@/lib/metrics/quarterPace";

const k = (n: number): string =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`;
const pct = (n: number): string =>
  `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n * 100))}%`;

const Cell = ({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) => (
  <div
    className="rounded-lg p-2.5"
    style={{ background: "#141b28", border: "1px solid #26304a" }}
  >
    <p className="text-[10px] uppercase tracking-wide text-muted-text">{label}</p>
    <p className="text-base font-semibold mt-0.5" style={color ? { color } : undefined}>
      {value}
    </p>
    {sub && <p className="text-[10.5px] text-muted-text mt-0.5">{sub}</p>}
  </div>
);

// "Am I on track to beat last quarter?" — the current quarter's running net,
// paced against the previous quarter's own same-point curve (see getQuarterPace).
export const QuarterPaceCard = ({ pace }: { pace: QuarterPace }) => {
  const {
    verdict,
    label,
    prevLabel,
    currentNet,
    currentLoads,
    prevSamePointNet,
    prevFinalNet,
    prevFinalLoads,
    projectedNet,
    projectedLoads,
    pacePct,
    daysElapsed,
    daysTotal,
  } = pace;
  const hasProjection =
    verdict === "beat" || verdict === "behind" || verdict === "even";

  const META: Record<QuarterPace["verdict"], { text: string; color: string }> = {
    beat: { text: `On track to beat ${prevLabel}`, color: "#4ade80" },
    behind: { text: `On track to finish under ${prevLabel}`, color: "#f87171" },
    even: { text: `On pace with ${prevLabel}`, color: "#f5a623" },
    early: { text: "Too early to call · building", color: "#9fb0c9" },
    "no-prior": { text: "No prior quarter to compare yet", color: "#9fb0c9" },
  };
  const meta = META[verdict];
  const Icon =
    verdict === "beat" ? TrendingUp : verdict === "behind" ? TrendingDown : Minus;

  const barMax = Math.max(projectedNet ?? 0, prevFinalNet, currentNet) * 1.08 || 1;
  const fillPct = (currentNet / barMax) * 100;
  const projPct = ((projectedNet ?? currentNet) / barMax) * 100;
  const goalPct = (prevFinalNet / barMax) * 100;

  return (
    <section
      className="rounded-xl border p-4 mt-5"
      style={{ background: "#0f1622", borderColor: "#26304a" }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span className="text-[11px] tracking-[1.5px] text-muted-text uppercase">
          This quarter
        </span>
        <span className="text-xs text-muted-text">
          · {label} · day {daysElapsed} of {daysTotal}
        </span>
        <span
          className="ml-auto inline-flex items-center gap-1.5 font-comic text-sm rounded-md px-2.5 py-1 border-2"
          style={{ color: meta.color, borderColor: meta.color }}
        >
          {hasProjection && <Icon size={14} />} {meta.text}
        </span>
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <span className="text-[30px] font-condensed leading-none">{k(currentNet)}</span>
        <span className="text-sm text-muted-text mb-1">
          net so far · {currentLoads} delivered loads
        </span>
        {hasProjection && pacePct != null && (
          <span
            className="text-sm mb-1 ml-1"
            style={{ color: pacePct >= 0 ? "#4ade80" : "#f87171" }}
          >
            {pacePct >= 0 ? "▲" : "▼"} {pct(pacePct)} vs {prevLabel}'s pace
          </span>
        )}
      </div>

      {hasProjection ? (
        <>
          <div
            className="relative h-4 rounded-full mt-3 mb-1.5"
            style={{ background: "#0b111c", border: "1px solid #26304a" }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${Math.min(100, fillPct)}%`, background: "#4ade80" }}
            />
            {projPct > fillPct && (
              <div
                className="absolute inset-y-0 rounded-r-full"
                style={{
                  left: `${fillPct}%`,
                  width: `${Math.min(100 - fillPct, projPct - fillPct)}%`,
                  background: "#2f7d55",
                  opacity: 0.65,
                }}
              />
            )}
            <div
              className="absolute -top-1 -bottom-1"
              style={{ left: `${Math.min(100, goalPct)}%`, width: 2, background: "#f5a623" }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-muted-text gap-2">
            <span>◆ so far {k(currentNet)}</span>
            <span
              className="text-right"
              style={{
                color: (projectedNet ?? 0) >= prevFinalNet ? "#4ade80" : "#f87171",
              }}
            >
              projected {k(projectedNet ?? 0)} · {prevLabel} finished {k(prevFinalNet)}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2.5 mt-3">
            <Cell label={`By this day, ${prevLabel}`} value={k(prevSamePointNet)} />
            <Cell
              label="Loads"
              value={String(currentLoads)}
              sub={
                projectedLoads != null
                  ? `on pace for ~${projectedLoads} vs ${prevFinalLoads}`
                  : undefined
              }
            />
            <Cell
              label="Pace"
              value={pacePct != null ? pct(pacePct) : "—"}
              color={
                pacePct != null
                  ? pacePct >= 0
                    ? "#4ade80"
                    : "#f87171"
                  : undefined
              }
              sub={`vs ${prevLabel}`}
            />
          </div>
          <p className="text-[10.5px] text-muted-text mt-2.5 leading-snug">
            Counted from your delivered loads (each load's settlement net) so it
            can track day by day — which is why these figures won't always match
            the P&amp;L net revenue in Last Season below.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-text mt-2">
          {verdict === "early"
            ? "Pace needs more of the quarter before it means anything — the read switches on once you're a couple weeks and a few loads in."
            : "Once you've got a full quarter behind you, this shows whether you're on track to beat it."}
        </p>
      )}
    </section>
  );
};
