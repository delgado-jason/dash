import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { WeekCost } from "@/lib/metrics/fuelEconomy";
import { Panel } from "@/components/ui/Panel";

const fmtWeek = (d: string) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const WeeklyCostChart = ({
  data,
  avg,
}: {
  data: WeekCost[];
  avg: number | null;
}) => (
  <Panel className="p-4">
    <h3 className="text-sm font-medium mb-1 text-light">Weekly fuel cost</h3>
    <p className="text-xs text-muted-text mb-4">
      Spend per week{avg != null ? " · dashed = 90-day avg" : ""}
    </p>
    {data.length === 0 ? (
      <p className="text-sm text-muted-text py-8 text-center">
        No fill-ups logged yet.
      </p>
    ) : (
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3347" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={fmtWeek}
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
            tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
            width={38}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{
              background: "#1c2333",
              border: "1px solid #2a3347",
              borderRadius: 8,
              color: "#ebedf5",
              fontSize: 12,
            }}
            labelFormatter={(l) => `Week of ${fmtWeek(l as string)}`}
            formatter={(v) => [money0(Number(v)), "Cost"]}
          />
          {avg != null && (
            <ReferenceLine
              y={avg}
              stroke="#9daabb"
              strokeDasharray="4 4"
              label={{
                value: `avg ${money0(avg)}`,
                fill: "#9daabb",
                fontSize: 10,
                position: "right",
              }}
            />
          )}
          <Bar dataKey="cost" fill="#e8940a" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    )}
  </Panel>
);
