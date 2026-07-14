import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { Panel } from "@/components/ui/Panel";

interface MonthlyRevenue {
  month: string; // "2026-06"
  revenue: number;
}

interface Props {
  data: MonthlyRevenue[];
  target?: number; // optional revenue target line
}

// "2026-06" -> "Jun"
const formatMonthLabel = (month: string): string => {
  const [year, m] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(m) - 1, 1));
  return date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
};

const formatCurrency = (n: number): string =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

const AMBER = "#e8940a";
const AMBER_BRIGHT = "#f5b03a";
const MUTED = "#9daabb";
const GRID = "#2a3347";

export const RevenueChart = ({ data, target }: Props) => {
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-medium mb-1 text-light">Revenue over time</h3>
      <p className="text-xs text-muted-text mb-4">
        Monthly gross{target ? " · dashed line = target" : ""}
      </p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
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
            labelFormatter={(label) => formatMonthLabel(label as string)}
            formatter={(value) => [formatCurrency(Number(value)), "Revenue"]}
          />
          {target && (
            <ReferenceLine
              y={target}
              stroke={MUTED}
              strokeDasharray="4 4"
              label={{
                value: `Target ${formatCurrency(target)}`,
                fill: MUTED,
                fontSize: 10,
                position: "right",
              }}
            />
          )}
          <Bar dataKey="revenue" radius={[3, 3, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={target && entry.revenue >= target ? AMBER_BRIGHT : AMBER}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
};
