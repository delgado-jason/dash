import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MpgWindow } from "@/lib/metrics/fuelEconomy";
import { Panel } from "@/components/ui/Panel";

const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export const MpgChart = ({ windows }: { windows: MpgWindow[] }) => (
  <Panel className="p-4">
    <h3 className="text-sm font-medium mb-1 text-light">MPG per tank</h3>
    <p className="text-xs text-muted-text mb-4">One point per full tank</p>
    {windows.length === 0 ? (
      <p className="text-sm text-muted-text py-8 text-center">
        Log two full tanks to chart your MPG.
      </p>
    ) : (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={windows} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            stroke="#9daabb"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#2a3347" }}
          />
          <YAxis
            stroke="#9daabb"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={["dataMin - 0.5", "dataMax + 0.5"]}
            tickFormatter={(v) => Number(v).toFixed(1)}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "#1c2333",
              border: "1px solid #2a3347",
              borderRadius: 8,
              color: "#ebedf5",
              fontSize: 12,
            }}
            labelFormatter={(l) => fmtDate(l as string)}
            formatter={(v) => [`${Number(v).toFixed(2)} mpg`, "MPG"]}
          />
          <Line
            type="monotone"
            dataKey="mpg"
            stroke="#e8940a"
            strokeWidth={2}
            dot={{ r: 3, fill: "#e8940a" }}
          />
        </LineChart>
      </ResponsiveContainer>
    )}
  </Panel>
);
