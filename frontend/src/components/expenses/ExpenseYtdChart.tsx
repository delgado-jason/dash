import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import type { ExpensePeriod } from "@/types/expense";
import { money } from "@/lib/format";

interface Datum {
  month: string;
  income: number;
  cost: number;
  profit: number;
}

// Two clean lines (income + cost); the gap is the margin, spelled out on hover.
const ChartTooltip = ({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  const margin = d.income > 0 ? (d.profit / d.income) * 100 : 0;
  return (
    <div
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "#ebedf5", fontWeight: 600, marginBottom: 4 }}>
        {d.month}
      </div>
      <div style={{ color: "#f5b03a" }}>Income {money(d.income)}</div>
      <div style={{ color: "#4f8cd6" }}>Cost {money(d.cost)}</div>
      <div style={{ color: "#e8940a" }}>
        Profit {money(d.profit)} · {margin.toFixed(0)}%
      </div>
    </div>
  );
};

export const ExpenseYtdChart = ({
  periods,
  obligationsTotal = 0,
}: {
  periods: ExpensePeriod[];
  obligationsTotal?: number;
}) => {
  // Obligations are a single current figure (not stored per month), so we add
  // the same monthly total to every month — the cost line is "true cash out."
  const data: Datum[] = [...periods].reverse().map((p) => {
    const income = p.income_total ?? 0;
    const cost = (p.cogs_total ?? 0) + (p.expense_total ?? 0) + obligationsTotal;
    return {
      month: p.period_label ?? p.period_month,
      income,
      cost,
      profit: income - cost,
    };
  });

  if (data.length === 0) return null;

  return (
    <div className="ds2-board p-4 mt-4" style={{ height: 280 }}>
      <p className="text-xs text-faint mb-2">
        Revenue vs {obligationsTotal > 0 ? "true cost" : "cost"} · by month
      </p>
      <ResponsiveContainer width="100%" height="88%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#141c2a" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "#5a6880", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "#1c2637" }}
          />
          <YAxis
            tick={{ fill: "#5a6880", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
          />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="income"
            name="Income"
            stroke="#f5b03a"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#f5b03a" }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="cost"
            name="Cost"
            stroke="#4f8cd6"
            strokeWidth={2.5}
            dot={{ r: 3, fill: "#4f8cd6" }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
