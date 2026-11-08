import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Agent } from "@/types/agent";
import type { AgentScorecard } from "@/lib/metrics/agentScorecard";
import { MIN_SCORE_LOADS } from "@/lib/metrics/agentScorecard";
import { median } from "@/lib/metrics/stats";
import { nameOf } from "@/lib/relationships/nameOf";

export interface ScatterPoint {
  agent: Agent;
  card: AgentScorecard;
}

const SPEC_FILL: Record<string, { fill: string; stroke: string; text: string }> = {
  oversize: { fill: "color-mix(in srgb, var(--color-amber) 32%, transparent)", stroke: "var(--color-amber-hi)", text: "var(--color-hot)" },
  specialty: { fill: "color-mix(in srgb, var(--color-cat2) 26%, transparent)", stroke: "var(--color-cat2)", text: "var(--color-ink)" },
  standard: { fill: "color-mix(in srgb, var(--color-muted-text) 22%, transparent)", stroke: "var(--color-muted-text)", text: "var(--color-ink)" },
};

const W = 1000;
const H = 380;
const PAD = { l: 66, t: 26, r: 28, b: 46 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

// Rate (↑) × volume (→), bubble = revenue, color = specialty. The "who to call"
// quadrant: top-right (high rate AND high volume) is where you want an agent.
export const AgentScatter = ({ points }: { points: ScatterPoint[] }) => {
  const navigate = useNavigate();
  const scored = useMemo(
    () =>
      points.filter(
        (p) => p.card.loadCount >= MIN_SCORE_LOADS && p.card.medianRpm != null,
      ),
    [points],
  );

  const geom = useMemo(() => {
    if (scored.length < 2) return null;
    const loads = scored.map((p) => p.card.loadCount);
    const rpms = scored.map((p) => p.card.medianRpm as number);
    const xMax = Math.max(...loads) * 1.25 || 1;
    const yMax = Math.max(...rpms) * 1.14 || 1;
    const xs = (v: number) => PAD.l + (v / xMax) * plotW;
    const ys = (v: number) => PAD.t + plotH - (v / yMax) * plotH;
    const rOf = (rev: number) => Math.max(9, Math.min(26, 9 + Math.sqrt(rev / 1000) * 1.5));
    return {
      xMax,
      yMax,
      xs,
      ys,
      rOf,
      xMed: xs(median(loads) ?? 0),
      yMed: ys(median(rpms) ?? 0),
      yTicks: [0.25, 0.5, 0.75].map((f) => yMax * f),
    };
  }, [scored]);

  if (!geom)
    return (
      <div className="text-sm text-muted-text py-12 text-center">
        Not enough scored agents yet — an agent needs 2+ delivered loads to plot.
      </div>
    );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* gridlines */}
      {geom.yTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD.l} y1={geom.ys(t)} x2={W - PAD.r} y2={geom.ys(t)} stroke="var(--color-hairline-lo)" strokeWidth={1} />
          <text x={PAD.l - 8} y={geom.ys(t) + 3} textAnchor="end" fontSize={10} fill="var(--color-muted-text)">
            ${t < 10 ? t.toFixed(1) : Math.round(t)}
          </text>
        </g>
      ))}
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="var(--color-hairline-lo)" strokeWidth={1} />
      <text x={PAD.l - 40} y={PAD.t + 4} fontSize={10} fill="var(--color-muted-text)">$/mi</text>

      {/* median quadrant split + sweet-spot */}
      <line x1={geom.xMed} y1={PAD.t} x2={geom.xMed} y2={H - PAD.b} stroke="var(--color-hairline)" strokeWidth={1} strokeDasharray="4 4" />
      <line x1={PAD.l} y1={geom.yMed} x2={W - PAD.r} y2={geom.yMed} stroke="var(--color-hairline)" strokeWidth={1} strokeDasharray="4 4" />
      <text x={W - PAD.r} y={PAD.t + 12} textAnchor="end" fontSize={11} fill="var(--color-status-positive-text)" fontWeight={700}>
        money agents ↗
      </text>
      <text x={W - PAD.r} y={H - PAD.b - 6} textAnchor="end" fontSize={10} fill="var(--color-faint)">volume →</text>

      {/* bubbles */}
      {scored.map(({ agent, card }) => {
        const spec = SPEC_FILL[card.specialty.tag] ?? SPEC_FILL.standard;
        const cold = card.tier === "cold";
        const cx = geom.xs(card.loadCount);
        const cy = geom.ys(card.medianRpm as number);
        const r = geom.rOf(card.revenue);
        const initials = `${agent.first_name.charAt(0)}${agent.last_name.charAt(0)}`;
        return (
          <g
            key={agent.agent_id}
            style={{ cursor: "pointer" }}
            onClick={() => navigate(`/agents/${agent.agent_id}`)}
          >
            <title>
              {nameOf(agent)} · {card.loadCount} loads · $
              {(card.medianRpm as number).toFixed(2)}/mi · {Math.round(card.revenue / 100) / 10}k
            </title>
            <circle
              cx={cx}
              cy={cy}
              r={r}
              fill={cold ? "color-mix(in srgb, var(--color-amber-dark) 14%, transparent)" : spec.fill}
              stroke={cold ? "var(--color-amber-dark)" : spec.stroke}
              strokeWidth={1.6}
              strokeDasharray={cold ? "3 3" : undefined}
            />
            <text x={cx} y={cy + 3.5} textAnchor="middle" fontSize={r >= 13 ? 10 : 8.5} fill={cold ? "var(--color-amber-hi)" : spec.text} fontWeight={700}>
              {initials}
            </text>
            <text x={cx} y={cy - r - 4} textAnchor="middle" fontSize={9.5} fill="var(--color-muted-text)">
              {agent.first_name}
              {card.ratingFlag ? " ⚠" : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
