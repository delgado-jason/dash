import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Panel } from "@/components/ui/Panel";

interface MonthlyRpm {
  month: string; // "2026-06"
  rpm: number | null;
}

interface Props {
  data: MonthlyRpm[];
  breakEven: number;
}

// "2026-06" -> "Jun"
const formatMonthLabel = (month: string): string => {
  const [year, m] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
};

const formatRpm = (n: number): string => `$${n.toFixed(2)}`;

const GREEN = "#1d9e75";
const RED = "#e24b4a";
const MUTED = "#9daabb";
const GRID = "#2a3347";

export const RpmChart = ({ data, breakEven }: Props) => {
  return (
    <Panel noir className="p-4">
      <h3 className="text-sm font-medium mb-1 text-light">RPM vs break-even</h3>
      <p className="text-xs text-muted-text mb-4">
        Blended monthly rate · red line = ${breakEven.toFixed(2)} break-even
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthLabel}
            stroke={MUTED}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: GRID }}
          />
          <YAxis
            stroke={MUTED}
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
            domain={[0, "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#1c2333",
              border: "1px solid #2a3347",
              borderRadius: 8,
              color: "#ebedf5",
              fontSize: 12,
            }}
            labelFormatter={(label) => formatMonthLabel(label as string)}
            formatter={(value) => [
              value === null ? "No data" : formatRpm(Number(value)),
              "RPM",
            ]}
          />
          <ReferenceLine
            y={breakEven}
            stroke={RED}
            strokeWidth={1.5}
            label={{
              value: `Break-even $${breakEven.toFixed(2)}`,
              fill: RED,
              fontSize: 10,
              position: "insideTopRight",
            }}
          />
          <Line
            type="monotone"
            dataKey="rpm"
            stroke={GREEN}
            strokeWidth={2}
            dot={{ fill: GREEN, r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Panel>
  );
};
