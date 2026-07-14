import { Truck } from "lucide-react";
import { fleetHealth } from "@/lib/metrics/maintenance";
import { Panel } from "@/components/ui/Panel";

const rad = (deg: number) => (deg * Math.PI) / 180;
// Score 0–100 maps across the 180° dial (180° left → 0° right).
const needle = (score: number) => {
  const theta = 180 - 1.8 * score;
  return { x: 100 + 62 * Math.cos(rad(theta)), y: 100 - 62 * Math.sin(rad(theta)) };
};

const chip = (n: number, label: string, color: string) => (
  <span
    className="text-xs px-2.5 py-1 rounded"
    style={{ background: "#1c2333", color }}
  >
    {n} {label}
  </span>
);

interface Counts {
  overdue: number;
  soon: number;
  ok: number;
  unknown: number;
}

export const HealthGauge = ({ counts }: { counts: Counts }) => {
  const h = fleetHealth(counts);
  const n = needle(h.score ?? 0);

  return (
    <Panel className="p-4 flex gap-5 items-center flex-wrap mb-4">
      <svg viewBox="0 0 200 116" width={180} height={104} className="shrink-0">
        <path
          d="M20,100 A80,80 0 0 1 124.7,23.9"
          fill="none"
          stroke="#e24b4a"
          strokeWidth={13}
        />
        <path
          d="M124.7,23.9 A80,80 0 0 1 171.3,63.7"
          fill="none"
          stroke="#e8940a"
          strokeWidth={13}
        />
        <path
          d="M171.3,63.7 A80,80 0 0 1 180,100"
          fill="none"
          stroke="#1d9e75"
          strokeWidth={13}
        />
        {h.score != null && (
          <>
            <line
              x1={100}
              y1={100}
              x2={n.x}
              y2={n.y}
              stroke="#ebedf5"
              strokeWidth={3}
              strokeLinecap="round"
            />
            <circle cx={100} cy={100} r={6} fill="#ebedf5" />
          </>
        )}
        <text
          x={100}
          y={90}
          textAnchor="middle"
          className="font-condensed"
          fontSize={30}
          fill="#ebedf5"
        >
          {h.score == null ? "—" : `${h.score}%`}
        </text>
      </svg>

      <div className="flex-1 min-w-[180px]">
        <p className="text-xs text-muted-text flex items-center gap-1.5">
          <Truck size={15} style={{ color: "#e8940a" }} /> Fleet health
        </p>
        <p className="text-xl font-condensed mt-0.5" style={{ color: h.color }}>
          {h.label}
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          {chip(counts.overdue, "overdue", "#e24b4a")}
          {chip(counts.soon, "due soon", "#e8940a")}
          {chip(counts.ok, "ok", "#1d9e75")}
          {counts.unknown > 0 && chip(counts.unknown, "no baseline", "#9daabb")}
        </div>
      </div>
    </Panel>
  );
};
