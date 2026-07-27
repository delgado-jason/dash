import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getFreightIndex } from "@/services/marketService";
import { marketTrend } from "@/lib/metrics/marketSignal";

// A glanceable freight-market indicator for the dashboard header, from the FRED
// specialized-freight trend. Renders nothing when FRED isn't configured or there
// isn't enough history — so it never shows a hollow/misleading state.
const CFG = {
  firming: { label: "firming", color: "#4ade80", bg: "#0f2018", border: "#1a5c3a", Icon: TrendingUp },
  softening: { label: "softening", color: "#f87171", bg: "#241012", border: "#5a2424", Icon: TrendingDown },
  flat: { label: "steady", color: "#9daabb", bg: "#161d2b", border: "#2a3347", Icon: Minus },
} as const;

export const MarketChip = () => {
  const [trend, setTrend] = useState<ReturnType<typeof marketTrend>>(null);

  useEffect(() => {
    getFreightIndex()
      .then((s) => setTrend(marketTrend(s)))
      .catch(() => {});
  }, []);

  if (!trend) return null;
  const { label, color, bg, border, Icon } = CFG[trend.direction];

  return (
    <Link
      to="/market"
      title="Freight market trend (national) — open Market & Rates"
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <Icon size={14} />
      Freight market {label}
    </Link>
  );
};
