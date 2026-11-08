import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getFreightSignals } from "@/services/marketService";
import { marketSignal, indexSentence, type MarketSignal } from "@/lib/metrics/marketSignal";

// A glanceable freight-market indicator for the dashboard header, from the same
// signal the Market page's call reads: firming or softening only when the
// read has HELD two prints and isn't a fuel move — otherwise steady, with the
// reason in the title. Renders nothing when FRED isn't configured or there
// isn't enough history, so it never shows a hollow state.
const CFG = {
  firming: { label: "firming", color: "var(--color-status-positive-text)", bg: "var(--color-status-positive-bg)", border: "color-mix(in srgb, var(--color-status-positive-text) 35%, transparent)", Icon: TrendingUp },
  softening: { label: "softening", color: "var(--color-status-negative-text)", bg: "var(--color-status-negative-bg)", border: "color-mix(in srgb, var(--color-status-negative-text) 35%, transparent)", Icon: TrendingDown },
  flat: { label: "steady", color: "var(--color-muted-text)", bg: "var(--color-status-neutral-bg)", border: "var(--color-hairline)", Icon: Minus },
} as const;

export const MarketChip = () => {
  const [signal, setSignal] = useState<MarketSignal | null>(null);

  useEffect(() => {
    getFreightSignals()
      .then(({ index, diesel }) => setSignal(marketSignal(index, diesel)))
      .catch(() => {});
  }, []);

  if (!signal) return null;
  const { label, color, bg, border, Icon } = CFG[signal.direction];

  return (
    <Link
      to="/market"
      title={`${indexSentence(signal)} — open Market & Rates`}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap"
      style={{ background: bg, border: `1px solid ${border}`, color }}
    >
      <Icon size={14} />
      Freight market {label}
      {signal.direction !== "flat" && <span style={{ opacity: 0.75 }}>· {signal.prints} prints</span>}
    </Link>
  );
};
