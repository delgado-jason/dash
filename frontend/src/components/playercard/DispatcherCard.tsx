import type { ReactNode } from "react";
import type { DispatcherCard as CardData } from "@/lib/metrics/dispatcherCard";
import type { Grade } from "@/lib/metrics/playerCard";

interface Props {
  name: string;
  business?: string;
  avatar: ReactNode;
  card: CardData;
}

// Compact gross: "$0", "$840", "$12.4k", "$487k".
const gross = (n: number): string => {
  if (n < 1000) return `$${Math.round(n)}`;
  const k = n / 1000;
  return `$${k < 100 ? k.toFixed(1) : Math.round(k)}k`;
};
const rpm = (n: number | null): string => (n == null ? "—" : `$${n.toFixed(2)}`);
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
    className="rounded-lg px-2.5 py-2"
    style={{
      background: "#1c2333",
      gridColumn: span ? "span 2" : undefined,
      border: accent ? "1px solid #85500b" : undefined,
    }}
  >
    <div
      className="text-[8px] tracking-wide"
      style={{ color: accent ? "#f5b03a" : "#7d8ba3" }}
    >
      {label}
    </div>
    <div className="font-comic text-[22px]" style={{ color: accent ? "#f5b03a" : "#f4f7fb" }}>
      {value}
    </div>
    {sub && <div className="text-[9px]" style={{ color: "#7d8ba3" }}>{sub}</div>}
  </div>
);

export const DispatcherCard = ({ name, business, avatar, card }: Props) => {
  const grade = card.seasonGrade ? GRADE_META[card.seasonGrade] : null;
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
        className="absolute top-0 right-0 w-32 h-32 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(#e8940a 1.3px, transparent 1.4px)",
          backgroundSize: "8px 8px",
          opacity: 0.1,
        }}
      />

      {/* header */}
      <div className="relative flex gap-3.5 items-center">
        <div className="shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="font-comic text-3xl leading-none" style={{ color: "#f5b03a" }}>
            {name}
          </div>
          {business && (
            <div className="text-[10px] mt-1" style={{ color: "#9daabb" }}>
              {business}
            </div>
          )}
          <div
            className="inline-flex items-center gap-1 mt-1.5 rounded-full px-2.5 py-0.5"
            style={{ background: "rgba(232,148,10,0.14)", border: "1px solid #7a4718" }}
          >
            <span className="text-[10px]">⭐</span>
            <span className="text-[10px] font-semibold tracking-wide" style={{ color: "#f5b03a" }}>
              {card.rank.name.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* rank progress */}
      <div className="relative mt-3">
        <div className="flex justify-between text-[8.5px] mb-1" style={{ color: "#7d8ba3" }}>
          <span>{card.rank.name.toUpperCase()}</span>
          <span>
            {card.rank.next
              ? `${card.rank.next.name.toUpperCase()} · ${card.rank.toNext} loads to go`
              : "TOP RANK"}
          </span>
        </div>
        <div className="h-1.5 rounded" style={{ background: "#232c3f" }}>
          <div
            className="h-1.5 rounded"
            style={{ width: `${Math.round(card.rank.pct * 100)}%`, background: "linear-gradient(90deg,#e8940a,#f5b03a)" }}
          />
        </div>
      </div>

      {/* season grade */}
      {grade && (
        <div className="relative flex items-center gap-1.5 mt-3">
          <span className="text-[9px] tracking-widest" style={{ color: "#7d8ba3" }}>
            THIS SEASON
          </span>
          <span
            className="font-comic text-[13px] tracking-wide rounded px-2 py-0.5"
            style={{ background: grade.bg, border: `1px solid ${grade.border}`, color: grade.fg }}
          >
            {grade.label}
          </span>
        </div>
      )}

      {/* stats */}
      <div className="relative grid grid-cols-2 gap-2 mt-3">
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
        <Stat label="DETENTION COLLECTED" value={hrs(card.detentionCollectedMin)} />
        <Stat label="ON-TIME" value={pct(card.onTimePct)} />
      </div>
    </div>
  );
};
