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

const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

export const MpgChart = ({ windows }: { windows: MpgWindow[] }) => (
  <div className="ds2-board p-4">
    <h3 className="text-sm font-medium mb-1 text-light">MPG per tank</h3>
    <p className="text-xs text-faint mb-4">One point per full tank</p>
    {windows.length === 0 ? (
      <p className="text-sm text-faint py-8 text-center">
        Log two full tanks to chart your MPG.
      </p>
    ) : (
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={windows} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#141c2a" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            stroke="#5a6880"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "#1c2637" }}
          />
          <YAxis
            stroke="#5a6880"
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
            stroke="#f5b03a"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#e8940a" }}
          />
        </LineChart>
      </ResponsiveContainer>
    )}
  </div>
);
