import { Panel } from "@/components/ui/Panel";
import { Sparkline } from "@/components/ui/Sparkline";

type Status = "good" | "bad" | "neutral";

interface Delta {
  percent: number;
  direction: "up" | "down";
}

interface Props {
  label: string;
  value: string; // pre-formatted display string (currency, %, etc.)
  status?: Status; // colors the value (good=green, bad=red, neutral=default)
  delta?: Delta | null; // optional "▲12% vs last month"
  subtext?: string; // optional small line under value
  trend?: number[]; // optional sparkline series
}

const statusColor: Record<Status, string> = {
  good: "text-status-positive-text",
  bad: "text-status-negative-text",
  neutral: "text-light",
};

const sparkColor: Record<Status, string> = {
  good: "#4ade80",
  bad: "#f87171",
  neutral: "#60a5fa",
};

export const KpiCard = ({
  label,
  value,
  status = "neutral",
  delta,
  subtext,
  trend,
}: Props) => (
  <Panel variant="default" interactive className="p-4 flex flex-col gap-1">
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs uppercase tracking-wider text-muted-text">{label}</p>
      {trend && trend.length >= 2 && (
        <Sparkline data={trend} color={sparkColor[status]} />
      )}
    </div>
    <p className={`text-2xl font-condensed ${statusColor[status]}`}>{value}</p>

    {delta && (
      <p
        className={`text-xs ${
          delta.direction === "up"
            ? "text-status-positive-text"
            : "text-status-negative-text"
        }`}
      >
        {delta.direction === "up" ? "▲" : "▼"}{" "}
        {Math.abs(delta.percent).toFixed(0)}% vs last month
      </p>
    )}

    {subtext && <p className="text-xs text-muted-text">{subtext}</p>}
  </Panel>
);
