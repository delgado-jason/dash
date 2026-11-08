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
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline-lo)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            stroke="var(--color-faint)"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: "var(--color-hairline)" }}
          />
          <YAxis
            stroke="var(--color-faint)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            domain={["dataMin - 0.5", "dataMax + 0.5"]}
            tickFormatter={(v) => Number(v).toFixed(1)}
            width={32}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-iron)",
              border: "1px solid var(--color-hairline)",
              borderRadius: 8,
              color: "var(--color-ink)",
              fontSize: 12,
            }}
            labelFormatter={(l) => fmtDate(l as string)}
            formatter={(v) => [`${Number(v).toFixed(2)} mpg`, "MPG"]}
          />
          <Line
            type="monotone"
            dataKey="mpg"
            stroke="var(--color-amber-hi)"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "var(--color-amber)" }}
          />
        </LineChart>
      </ResponsiveContainer>
    )}
  </div>
);
