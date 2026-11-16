import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { MpgWindow } from "@/lib/metrics/fuelEconomy";

const fmtDate = (d: string) =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

// One point per closed tank, the lifetime MPG drawn across them. A line, not
// bars (Jason, 2026-11-15: "I do like the line charts to represent time or a
// period over time"). The frame and the twelve/all fold belong to the part.
export const MpgChart = ({ windows, avgMpg }: { windows: MpgWindow[]; avgMpg: number | null }) => {
  if (windows.length === 0)
    return <p className="text-sm text-faint py-8 text-center">Log two full tanks to chart your MPG.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
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
        {avgMpg != null && (
          <ReferenceLine
            y={avgMpg}
            stroke="var(--color-dim)"
            strokeDasharray="4 4"
            label={{ value: `${avgMpg.toFixed(2)} lifetime`, position: "insideTopRight", fill: "var(--color-dim)", fontSize: 11 }}
          />
        )}
        <Line
          type="monotone"
          dataKey="mpg"
          stroke="var(--color-amber-hi)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: "var(--color-amber)" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
