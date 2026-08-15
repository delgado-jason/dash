import type { MarketPlaybook, TierPlay } from "@/lib/metrics/marketPlaybook";
import { rpm as fmtRpm } from "@/lib/format";

const ACTION_COLOR: Record<TierPlay["action"], string> = {
  raise: "#5dcaa5",
  hold: "#f5b03a",
  protect: "#f5b03a",
  "under-floor": "#e8940a", // caution — below cost floor, but not a loss
  "cut-costs": "#e24b4a",
};

const RUNG_COLOR: Record<string, string> = {
  strong: "#5dcaa5",
  target: "#f5b03a",
  floor: "#8494ab",
  breakEven: "#e24b4a",
  you: "#f5b03a",
};

const RUNG_TAG: Record<string, string> = {
  floor: "don't chase below",
  breakEven: "lose money below",
};

// The ordered ladder for one tier: rungs + your-rate marker, sorted high → low,
// so you see where you sit rather than decode a floating percentage.
const TierColumn = ({ play }: { play: TierPlay }) => {
  // Degraded whenever there are no rungs — no rate read OR no cost basis. The
  // engine sets `why` to the honest cause; render it, not a lone marker row.
  if (play.rungs.length === 0 || play.yourRate == null) {
    return (
      <div className="p-4">
        <div className="text-[11px] uppercase tracking-[.10em] text-faint font-condensed mb-1">
          {play.label}
        </div>
        <p className="text-[13px] text-dim">{play.why}</p>
      </div>
    );
  }

  const rows = [
    ...play.rungs.map((r) => ({ key: r.key, label: r.label, rate: r.rate, you: false })),
    { key: "you", label: "You're booking", rate: play.yourRate, you: true },
  ].sort((a, b) => b.rate - a.rate);

  return (
    <div className="p-4">
      <div className="text-[11px] uppercase tracking-[.10em] text-faint font-condensed mb-2">
        {play.label}
      </div>

      <div className="font-condensed text-[19px] font-semibold leading-tight" style={{ color: ACTION_COLOR[play.action] }}>
        {play.headline}
      </div>
      <p className="text-[12.5px] text-dim mt-1 mb-3 leading-snug">{play.why}</p>

      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div
            key={r.key}
            className="flex items-center justify-between rounded-[7px] px-2.5 py-1.5"
            style={
              r.you
                ? { background: "rgba(232,148,10,.13)", border: "1px solid rgba(232,148,10,.36)" }
                : undefined
            }
          >
            <span className="text-[12.5px]" style={{ color: RUNG_COLOR[r.key], fontWeight: r.you ? 600 : 400 }}>
              {r.label}
              {RUNG_TAG[r.key] && (
                <span className="text-[9.5px] uppercase tracking-[.06em] text-faint ml-1.5">
                  {RUNG_TAG[r.key]}
                </span>
              )}
            </span>
            <span className="font-condensed text-[16px]" style={{ color: r.you ? "#f5b03a" : "#e6ecf7", fontWeight: r.you ? 600 : 400 }}>
              {fmtRpm(r.rate)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const TREND_META: Record<string, { arrow: string; word: string; color: string; bg: string; border: string }> = {
  firming: { arrow: "▲", word: "Firming", color: "#5dcaa5", bg: "rgba(93,202,165,.10)", border: "rgba(93,202,165,.32)" },
  softening: { arrow: "▼", word: "Softening", color: "#f5b03a", bg: "rgba(232,148,10,.10)", border: "rgba(232,148,10,.32)" },
  flat: { arrow: "▬", word: "Steady", color: "#8494ab", bg: "rgba(132,148,171,.10)", border: "rgba(132,148,171,.28)" },
};
// No FRED reading yet — a distinct, honest badge (never a definite "Steady").
const NO_INDEX_META = { arrow: "—", word: "No index read", color: "#5a6880", bg: "rgba(90,104,123,.10)", border: "rgba(90,104,123,.26)" };

const readLine = (pb: MarketPlaybook): string => {
  const pct = pb.pctChange != null ? `${Math.round(Math.abs(pb.pctChange) * 100)}% / 3 mo` : "";
  if (pb.direction === "firming")
    return `The freight index is firming (+${pct}) and your rates tend to lag it — here's how far to push per tier.`;
  if (pb.direction === "softening")
    return `The freight index has turned down (−${pct}) and your rates usually follow — here's the move per tier.`;
  if (pb.direction === "flat")
    return `The freight index is steady — here's where you sit against your rungs per tier.`;
  return `Not enough index history yet — showing where you sit against your rungs.`;
};

export const MarketPlaybookCard = ({ playbook }: { playbook: MarketPlaybook }) => {
  const t = playbook.direction ? (TREND_META[playbook.direction] ?? TREND_META.flat) : NO_INDEX_META;
  return (
    <div className="ds2-board overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
        <span className="font-condensed text-[18px] font-semibold text-ink">Market playbook</span>
        <span
          className="ml-auto flex items-center gap-1.5 text-[12.5px] rounded-lg px-2.5 py-1"
          style={{ color: t.color, background: t.bg, border: `1px solid ${t.border}` }}
        >
          <span>{t.arrow}</span> {t.word}
        </span>
      </div>
      <div className="px-4 py-3 border-b border-hairline text-[13.5px] text-dim">{readLine(playbook)}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-hairline">
        {playbook.tiers.map((play) => (
          <TierColumn key={play.key} play={play} />
        ))}
      </div>
    </div>
  );
};
