import {
  RANK_TIERS,
  type DispatcherCard as DispatcherCardData,
} from "@/lib/metrics/dispatcherCard";
import { money } from "@/lib/format";

// The forged dispatcher card — same grammar as the driver's card, her metrics:
// stencil rank head, career strip, then the meter rows. The money row is
// BOOKING OVER THE FLOOR: the gross $/mi she books racing the walk-away floor,
// notch at 78%, overdrive past it — the margin she found. Identity (name,
// avatar, worn medals) lives in the page header.

const TARGET_AT = 0.78;

const fmtRate = (n: number) => `$${n.toFixed(2)}`;
const fmtHours = (min: number) =>
  min >= 60 ? `${Math.round(min / 60)}h` : min > 0 ? `${min}m` : "0h";

const Cells = ({
  fill,
  notch,
  notchLabel = "TARGET",
  count = 14,
}: {
  fill: number;
  notch?: number;
  notchLabel?: string;
  count?: number;
}) => (
  <div className="relative flex gap-[3px]">
    {Array.from({ length: count }, (_, i) => {
      const cellPos = (i + 1) / count;
      const on = cellPos <= fill + 1e-6;
      const overdrive = notch != null && on && cellPos > notch + 1e-6;
      return (
        <i
          key={i}
          className="flex-1 h-[11px] rounded-[2.5px]"
          style={
            on
              ? overdrive
                ? {
                    background: "linear-gradient(180deg, #ffffff, var(--color-hot))",
                    border: "1px solid rgba(255,255,255,.5)",
                    boxShadow: "0 0 7px rgba(255,207,122,.45)",
                  }
                : {
                    background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                    border: "1px solid rgba(245,176,58,.55)",
                    boxShadow: "0 0 6px rgba(232,148,10,.3)",
                  }
              : {
                  background: "var(--color-well)",
                  border: "1px solid var(--color-hairline-lo)",
                  boxShadow: "inset 0 2px 3px rgba(0,0,0,.55)",
                }
          }
        />
      );
    })}
    {notch != null && (
      <span
        className="absolute -top-[4px] -bottom-[4px] w-[2px] bg-ink opacity-70"
        style={{ left: `${notch * 100}%` }}
        aria-hidden
      >
        <span className="absolute -top-[13px] -left-[16px] font-condensed text-[9px] tracking-[.1em] text-faint">
          {notchLabel}
        </span>
      </span>
    )}
  </div>
);

const MeterRow = ({
  label,
  right,
  children,
  last = false,
}: {
  label: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) => (
  <div className={`px-[18px] py-[13px] ${last ? "" : "border-b"} ds2-cell-rule`}>
    <div className="flex justify-between items-baseline gap-3 mb-[8px]">
      <span className="font-condensed font-semibold text-[11.5px] tracking-[.14em] uppercase text-faint">
        {label}
      </span>
      {right && (
        <span className="font-condensed font-semibold text-[12.5px] text-dim tabular-nums text-right">
          {right}
        </span>
      )}
    </div>
    {children}
  </div>
);

const GhostLine = ({ children }: { children: React.ReactNode }) => (
  <p className="font-condensed text-[12.5px] text-faint border border-dashed border-hairline rounded-[7px] px-3 py-[7px]">
    {children}
  </p>
);

export const DispatcherCard = ({ card }: { card: DispatcherCardData }) => {
  const stars =
    "★".repeat(card.rank.index + 1) +
    "☆".repeat(RANK_TIERS.length - card.rank.index - 1);

  const floorReady = card.avgBookedRate != null && card.breakEven != null;
  const floorScale = floorReady ? (card.breakEven as number) / TARGET_AT : null;
  const floorFill =
    floorReady && floorScale
      ? Math.min(1, (card.avgBookedRate as number) / floorScale)
      : 0;

  const next = card.rank.next;
  const ladderFill = next
    ? Math.min(1, card.rank.count / next.min)
    : 1;

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border"
      style={{
        background: "linear-gradient(180deg, #0e1420, #0b101a)",
        borderColor: "var(--color-hairline)",
        boxShadow: "0 14px 34px rgba(0,0,0,.45)",
      }}
    >
      {/* head */}
      <div
        className="flex items-center gap-[14px] px-[18px] py-[14px] border-b ds2-cell-rule"
        style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
      >
        <div className="min-w-0">
          <div
            className="font-forge font-bold text-[22px] leading-none"
            style={{ letterSpacing: "1.5px" }}
          >
            {card.rank.name.toUpperCase()}
          </div>
          <div className="font-condensed text-[11px] text-faint tracking-[.1em] uppercase mt-[3px]">
            <span style={{ color: "var(--color-amber-hi)", letterSpacing: "1px" }}>{stars}</span>{" "}
            · the dispatcher card · forged
          </div>
        </div>
        <span className="ml-auto font-condensed font-bold text-[10.5px] tracking-[.12em] px-[8px] py-[3px] rounded-[4px] text-dim border border-hairline whitespace-nowrap">
          {card.seasonGrade ? `SEASON · ${card.seasonGrade.toUpperCase()}` : "SEASON"}
        </span>
      </div>

      {/* career strip */}
      <div className="grid grid-cols-3 border-b ds2-cell-rule">
        <div className="px-[18px] py-3 border-r ds2-cell-rule">
          <p className="font-condensed font-semibold text-[23px] tabular-nums">
            {card.loadsBookedLifetime}
          </p>
          <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
            Loads booked
          </p>
        </div>
        <div className="px-[18px] py-3 border-r ds2-cell-rule">
          <p className="font-condensed font-semibold text-[23px] tabular-nums">
            {money(card.grossBooked)}
          </p>
          <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
            Gross booked
          </p>
        </div>
        <div className="px-[18px] py-3">
          <p className="font-condensed font-semibold text-[23px] tabular-nums">
            {fmtHours(card.detentionCollectedMin)}
          </p>
          <p className="font-condensed text-[11px] tracking-[.14em] uppercase text-faint mt-[2px]">
            Detention collected
          </p>
        </div>
      </div>

      {/* booking over the floor */}
      <MeterRow
        label="Booking over the floor"
        right={
          floorReady && card.overBreakEven != null
            ? `${card.overBreakEven >= 0 ? "▲ +" : "▼ −"}${fmtRate(Math.abs(card.overBreakEven))}/mi ${
                card.overBreakEven >= 0 ? "over" : "under"
              } · ${card.loadsBookedLifetime} load${card.loadsBookedLifetime === 1 ? "" : "s"}`
            : undefined
        }
      >
        {floorReady ? (
          <>
            <Cells fill={floorFill} notch={TARGET_AT} notchLabel="FLOOR" />
            <p className="font-condensed text-[10.5px] text-faint mt-[6px]">
              she books at {fmtRate(card.avgBookedRate as number)}/mi gross · the floor
              is the walk-away — {fmtRate(card.breakEven as number)}/mi · past the
              notch is margin she found
            </p>
          </>
        ) : (
          <GhostLine>
            The floor forges from the cost basis — a month of P&L arms this meter.
          </GhostLine>
        )}
      </MeterRow>

      {/* career ladder */}
      <MeterRow
        label={
          next
            ? `Career ladder — next rung at ${next.min} booked`
            : "Career ladder — top rung"
        }
        right={next ? `${card.rank.count} / ${next.min}` : String(card.rank.count)}
      >
        <Cells fill={ladderFill} count={10} />
        <div className="flex gap-[6px] mt-[10px]">
          {RANK_TIERS.map((tier, i) => {
            const current = i === card.rank.index;
            return (
              <div key={tier.name} className="flex-1 text-center min-w-0">
                <div
                  className="rounded-[2px]"
                  style={
                    current
                      ? {
                          height: 7,
                          background:
                            "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                          boxShadow: "0 0 8px rgba(232,148,10,.35)",
                        }
                      : {
                          height: 4,
                          background: "var(--color-well)",
                          border: "1px solid var(--color-hairline-lo)",
                        }
                  }
                />
                <div
                  className={`font-condensed text-[10px] mt-[5px] truncate ${
                    current ? "text-amber-hi font-semibold" : "text-faint"
                  }`}
                >
                  {tier.name}
                </div>
                <div className="font-condensed text-[9px] text-faint">
                  {tier.min}
                  {current ? " ◄ you" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </MeterRow>

      {/* on-time */}
      <MeterRow
        label="On-time arrivals · her booked loads"
        right={
          card.gradedStops > 0
            ? `${card.onTimeCount} of ${card.gradedStops}`
            : undefined
        }
        last
      >
        {card.gradedStops > 0 ? (
          <Cells fill={card.onTimeCount / card.gradedStops} count={10} />
        ) : (
          <GhostLine>
            No graded stops yet — arms when her loads run with appointments and
            in/out times.
          </GhostLine>
        )}
      </MeterRow>
    </div>
  );
};
