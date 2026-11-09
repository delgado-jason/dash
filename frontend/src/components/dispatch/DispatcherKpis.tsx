import { Panel } from "@/components/ui/Panel";
import type { DispatcherCard } from "@/lib/metrics/dispatcherCard";
import { MIN_STOPS } from "@/lib/metrics/stopScore";
import { money, rpm as fmtRpm } from "@/lib/format";

// A dispatcher's booking figures as plain cards (the Cockpit, call 10; the
// Redesign, B1). Everything here is scored on the loads with her as "Booked by"
// — a cancelled load or a TONU never counts — in GROSS per DRIVEN mile on the
// booking ladder, never net. One component, two surfaces: her dashboard shows
// the three figures and her loads this week; her page shows all of them.

const hoursLabel = (minutes: number): string =>
  minutes === 0 ? "0h" : `${(minutes / 60).toFixed(1)}h`;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export const Figure = ({
  label,
  value,
  sub,
  tone = "",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string; // a text colour class when the figure carries a verdict
}) => (
  <div className="min-w-0">
    <p className="ds2-label">{label}</p>
    <p className={`font-condensed font-semibold text-[24px] leading-none mt-1.5 tabular-nums ${tone}`}>{value}</p>
    {sub && <p className="text-[11px] text-faint mt-1 leading-snug">{sub}</p>}
  </div>
);

// The floor line under "Booked over the floor": what the rate is measured
// against, and what was left out of it.
const floorWords = (card: DispatcherCard): { sub: string; tone: string } => {
  const left =
    card.drivenUnknown > 0
      ? ` · ${plural(card.drivenUnknown, "load")} without driven miles left out`
      : "";
  if (card.avgBookedRate == null) {
    return { sub: `no driven miles on your loads yet${left}`, tone: "" };
  }
  if (card.breakEven == null || card.overBreakEven == null) {
    return { sub: `gross per driven mile · the ladder's floor needs a filed P&L month${left}`, tone: "" };
  }
  const over = card.overBreakEven >= 0;
  return {
    sub: `${fmtRpm(Math.abs(card.overBreakEven))} ${over ? "over" : "under"} the ${fmtRpm(card.breakEven)} walk-away floor${left}`,
    tone: over ? "text-status-positive-text" : "text-status-negative-text",
  };
};

export const DispatcherKpis = ({
  card,
  full = false,
  loadsThisWeek = null,
  title = "Your bookings",
  className = "",
}: {
  card: DispatcherCard;
  full?: boolean; // the page: lifetime loads and gross too
  loadsThisWeek?: number | null; // the dashboard: her loads landing this pay week
  title?: string;
  className?: string;
}) => {
  const floor = floorWords(card);
  return (
    <Panel className={`p-4 ${className}`} data-testid="dispatcher-kpis">
      <p className="ds2-label">{title}</p>
      <div className={`grid grid-cols-2 ${full ? "sm:grid-cols-3" : ""} gap-x-5 gap-y-4 mt-3`}>
        {full && (
          <Figure
            label="Loads booked"
            value={String(card.loadsBookedLifetime)}
            sub={`${card.loadsBookedMonth} this month · lifetime, real freight only`}
          />
        )}
        {full && (
          <Figure label="Gross booked" value={money(card.grossBooked)} sub="lifetime · the full customer rate" />
        )}
        <Figure
          label="Booked over the floor"
          value={card.avgBookedRate != null ? `${fmtRpm(card.avgBookedRate)}/mi` : "—"}
          sub={floor.sub}
          tone={floor.tone}
        />
        <Figure
          label="Detention collected"
          value={hoursLabel(card.detentionCollectedMin)}
          sub="on your loads · confirmed billable and paid"
        />
        <Figure
          label="On-time"
          value={card.onTimePct != null ? `${Math.round(card.onTimePct * 100)}%` : "—"}
          sub={
            card.onTimePct != null
              ? `${card.onTimeCount} of ${plural(card.gradedStops, "graded stop")} · an appointment and an arrival`
              : card.gradedStops > 0
                ? `${card.onTimeCount} of ${card.gradedStops} on time · the share waits for ${MIN_STOPS} graded stops`
                : "no stop with an appointment and an arrival yet"
          }
        />
        {loadsThisWeek != null && (
          <Figure
            label="Loads this week"
            value={String(loadsThisWeek)}
            sub="you booked, landing this pay week"
          />
        )}
      </div>
    </Panel>
  );
};
