import type { ReactNode } from "react";
import { Headset } from "lucide-react";
import type { DispatcherCard as CardData } from "@/lib/metrics/dispatcherCard";
import { RANK_TIERS } from "@/lib/metrics/dispatcherCard";
import type { Grade } from "@/lib/metrics/playerCard";
import type { Medal } from "@/lib/awards/medals";
import { MedalBadge } from "@/components/awards/MedalBadge";
import { rpm } from "@/lib/format";

interface Props {
  name: string;
  business?: string;
  avatar: ReactNode;
  card: CardData;
  medals?: Medal[]; // earned rare-feat medals, worn by the name
}

// Compact gross: "$0", "$840", "$12.4k", "$487k".
const gross = (n: number): string => {
  if (n < 1000) return `$${Math.round(n)}`;
  const k = n / 1000;
  return `$${k < 100 ? k.toFixed(1) : Math.round(k)}k`;
};
const hrs = (min: number): string => `${(min / 60).toFixed(1)}h`;
const pct = (r: number | null): string => (r == null ? "—" : `${Math.round(r * 100)}%`);

const GRADE_META: Record<Grade, { label: string; bg: string; border: string; fg: string }> = {
  strong: { label: "STRONG", bg: "#10241a", border: "#1d6e50", fg: "#4ade80" },
  target: { label: "ON TARGET", bg: "#10241a", border: "#1d6e50", fg: "#4ade80" },
  minimum: { label: "COVERING", bg: "#2a1f0a", border: "#85500b", fg: "#f5b03a" },
  below: { label: "BELOW FLOOR", bg: "#2a1414", border: "#7a2d2d", fg: "#f87171" },
};

const Stat = ({
  label,
  value,
  sub,
  span,
  accent,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  span?: boolean;
  accent?: boolean;
}) => (
  <div
    className="rounded-lg px-3 py-2.5"
    style={{
      background: "#1c2333",
      gridColumn: span ? "span 2" : undefined,
      border: accent ? "1px solid #85500b" : undefined,
    }}
  >
    <div className="text-[9px] tracking-wide" style={{ color: accent ? "#f5b03a" : "#7d8ba3" }}>
      {label}
    </div>
    <div className="font-forge font-bold text-2xl" style={{ color: accent ? "#f5b03a" : "#f4f7fb" }}>
      {value}
    </div>
    {sub && <div className="text-[10px]" style={{ color: "#7d8ba3" }}>{sub}</div>}
  </div>
);

export const DispatcherCard = ({ name, business, avatar, card, medals }: Props) => {
  const grade = card.seasonGrade ? GRADE_META[card.seasonGrade] : null;
  const stars =
    "★".repeat(card.rank.index + 1) +
    "☆".repeat(RANK_TIERS.length - card.rank.index - 1);
  const over = card.overBreakEven;
  const overNode =
    over == null ? (
      <span style={{ color: "#7d8ba3" }}>no rated loads yet</span>
    ) : (
      <span style={{ color: over >= 0 ? "#4ade80" : "#f87171" }}>
        {over >= 0 ? "▲" : "▼"} ${Math.abs(over).toFixed(2)}{" "}
        {over >= 0 ? "over" : "under"} break-even
      </span>
    );

  return (
    <div
      className="relative overflow-hidden rounded-2xl border-2 p-4"
      style={{ background: "linear-gradient(160deg,#161d2b,#10151f)", borderColor: "#e8940a" }}
    >
      <div
        className="absolute top-0 right-0 w-40 h-40 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#e8940a 1.3px, transparent 1.4px)",
          backgroundSize: "8px 8px",
          opacity: 0.1,
        }}
      />

      {/* header: avatar left, identity + rank right */}
      <div className="relative flex gap-4 items-start">
        <div className="shrink-0">{avatar}</div>
        <div className="flex-1 min-w-0">
          <div className="font-forge font-bold text-4xl leading-none" style={{ color: "#f5b03a" }}>
            {name}
          </div>
          {business && (
            <div className="text-[11px] mt-1" style={{ color: "#9daabb" }}>
              {business}
            </div>
          )}

          {medals && medals.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2">
              {medals.map((m) => (
                <MedalBadge key={m.key} medal={m} />
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 mt-3">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "#3a2a0a", border: "2px solid #e8940a", color: "#f5b03a" }}
            >
              <Headset size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="font-forge font-bold text-xl leading-none"
                style={{ color: "#f5e6c8", letterSpacing: "1px" }}
              >
                {card.rank.name}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "#7d8ba3" }}>
                <span style={{ color: "#f5b03a", letterSpacing: "1px" }}>{stars}</span> · Career rank
              </div>
              <div className="h-1.5 rounded mt-1 overflow-hidden" style={{ background: "#1c2333" }}>
                <div className="h-full" style={{ width: `${card.rank.pct * 100}%`, background: "#e8940a" }} />
              </div>
              {card.rank.next && (
                <div className="text-[9.5px] mt-0.5" style={{ color: "#7d8ba3" }}>
                  {card.rank.toNext} {card.rank.toNext === 1 ? "load" : "loads"} to{" "}
                  {card.rank.next.name}
                </div>
              )}
            </div>
            {grade && (
              <span
                className="font-forge font-bold text-sm tracking-wide rounded px-2.5 py-1 self-center"
                style={{ background: grade.bg, border: `1px solid ${grade.border}`, color: grade.fg }}
              >
                {grade.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* wide stat row */}
      <div
        className="relative grid grid-cols-2 sm:grid-cols-6 gap-2 mt-4 pt-4 border-t"
        style={{ borderColor: "#2a3347" }}
      >
        <Stat
          label="LOADS BOOKED"
          value={String(card.loadsBookedLifetime)}
          sub={`${card.loadsBookedMonth} this month`}
        />
        <Stat label="GROSS BOOKED" value={gross(card.grossBooked)} sub="lifetime" />
        <Stat
          label="AVG BOOKED RATE · $/MI"
          value={rpm(card.avgBookedRate)}
          sub={overNode}
          span
          accent
        />
        <Stat label="DETENTION" value={hrs(card.detentionCollectedMin)} sub="collected" />
        <Stat label="ON-TIME" value={pct(card.onTimePct)} />
      </div>
    </div>
  );
};
