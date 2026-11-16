import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { DieselMonth } from "@/lib/metrics/fuelEconomy";
import { dieselPrice } from "@/lib/format";

const label = (key: string) => (key === "you" ? "you" : "EIA national");

// You vs. national retail diesel, monthly. Your line is gallon-weighted from the
// fuel log; the national line is the EIA U.S. retail average for that month.
// The frame belongs to the part it sits in (where you buy, beside the table).
export const DieselPriceChart = ({ data }: { data: DieselMonth[] }) =>
  data.length === 0 ? (
    <p className="text-sm text-faint py-8 text-center">No fill-ups logged yet.</p>
  ) : (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-hairline-lo)" vertical={false} />
        <XAxis dataKey="label" stroke="var(--color-faint)" fontSize={11} tickLine={false} axisLine={{ stroke: "var(--color-hairline)" }} />
        <YAxis
          stroke="var(--color-faint)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          domain={["auto", "auto"]}
          tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
          width={46}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-iron)",
            border: "1px solid var(--color-hairline)",
            borderRadius: 8,
            color: "var(--color-ink)",
            fontSize: 12,
          }}
          formatter={(v, name) => [v == null ? "—" : dieselPrice(Number(v)), label(String(name))]}
        />
        <Legend formatter={(val) => label(String(val))} wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="national" stroke="var(--color-chart-blue)" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
        <Line type="monotone" dataKey="you" stroke="var(--color-amber-hi)" strokeWidth={2.5} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
