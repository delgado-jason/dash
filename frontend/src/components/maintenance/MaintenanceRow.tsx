import type { KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";

// The one row for a schedule item on the Maintenance surface — the shop nod
// sheet's `.row.wide`, built in AgentRow's grammar: name + exactly ONE status
// chip, a context line, the md+ fact cells, a right cell that says what is
// LEFT, and the doors. Module-level on purpose; nothing here is ever defined
// inside a render body.
//
// The right cell is the whole point of the row: miles for the truck and the
// trailer, HOURS for the APU, days for a calendar-only item — one number, its
// own word underneath, coloured by how close the clock is.
//
// The Maintenance sheet (2026-11-15) added two things: a "last time" cell —
// the VISIT that last did this clock, its total, its shop, how many clocks it
// reset (never a per-clock split the page invented) — and a Done door that
// opens Log service with this clock already ticked. The chevron still edits
// the clock.

// The grid the row and its header line share, so each fact sits over its own
// column. Phone-first: name, what's left, the doors.
export const MAINTENANCE_ROW_GRID =
  "grid-cols-[minmax(0,1fr)_86px_44px] md:grid-cols-[minmax(0,1fr)_132px_124px_150px_86px_104px]";

export interface RowFact {
  lead: string; // the bold half — "25,000", "Aug 21", "never"
  rest?: string | null; // the plain half — "mi · 6 mo"
  sub?: string | null; // the 10.5px line under it — "566,637 mi", "baseline"
}

export interface RowLeft {
  value: string; // "2,100", "−68k", "—"
  caption: string; // "miles", "hours", "days"
  color?: string; // the level's colour; default is plain ink
}

export interface MaintenanceRowProps {
  name: string;
  chip: { tone: PillTone; label: string } | null;
  context: string; // line 2 — category · warn lead
  interval: RowFact;
  lastDone: RowFact;
  lastTime: RowFact | null; // the visit that last did it — null when never done
  left: RowLeft;
  dimmed?: boolean;
  onOpen?: () => void; // the chevron — edit this clock
  onDone?: () => void; // the Done door — log the service that does it
  doneWord?: string; // "Done" on a clock; "Set" on one that needs a baseline
}

// The header line above a board's rows. Same grid, same padding, so every
// word sits over its column.
export const MaintenanceRowHead = () => (
  <div
    className={`grid items-center gap-3 px-3.5 py-1.5 border-t border-hairline-lo font-condensed font-semibold text-[11px] tracking-[.12em] uppercase text-faint ${MAINTENANCE_ROW_GRID}`}
  >
    <span>item</span>
    <span className="hidden md:block text-right">interval</span>
    <span className="hidden md:block text-right">last done</span>
    <span className="hidden md:block text-right">last time</span>
    <span className="text-right">left</span>
    <span aria-hidden="true" />
  </div>
);

const Fact = ({ fact, className = "" }: { fact: RowFact; className?: string }) => (
  <span className={`font-condensed text-[14px] text-dim text-right ${className}`}>
    <span className="block truncate tabular-nums">
      <b className="font-semibold text-ink">{fact.lead}</b>
      {fact.rest ? ` ${fact.rest}` : ""}
    </span>
    {fact.sub && (
      <span className="block text-[11.5px] text-faint truncate">{fact.sub}</span>
    )}
  </span>
);

const NEVER: RowFact = { lead: "—", sub: "never done" };

export const MaintenanceRow = ({
  name,
  chip,
  context,
  interval,
  lastDone,
  lastTime,
  left,
  dimmed = false,
  onOpen,
  onDone,
  doneWord = "Done",
}: MaintenanceRowProps) => {
  const interactive = onOpen != null;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className={`grid items-center gap-3 px-3.5 py-2.5 border-t border-hairline-lo min-h-[56px] transition-colors ${MAINTENANCE_ROW_GRID} ${
        interactive ? "cursor-pointer hover:bg-ink/[.02]" : ""
      } ${dimmed ? "opacity-70" : ""}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-condensed font-medium text-[16px] text-ink leading-tight truncate">
            {name}
          </span>
          {chip && <StatusPill tone={chip.tone}>{chip.label}</StatusPill>}
        </div>
        <div className="text-[12.5px] text-dim truncate mt-0.5">{context}</div>
      </div>
      <Fact fact={interval} className="hidden md:block" />
      <Fact fact={lastDone} className="hidden md:block" />
      <Fact fact={lastTime ?? NEVER} className="hidden md:block" />
      <span className="text-right">
        <span
          className="block font-condensed font-semibold text-[18.5px] tabular-nums leading-none"
          style={{ color: left.color ?? "var(--color-ink)" }}
        >
          {left.value}
        </span>
        <span className="block font-condensed text-[11px] tracking-[.08em] uppercase text-faint mt-0.5">
          {left.caption}
        </span>
      </span>
      <span className="flex items-center justify-end gap-1.5">
        {onDone && (
          <button
            type="button"
            aria-label={`${doneWord}: ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onDone();
            }}
            className="hidden md:inline-flex h-11 px-2.5 items-center rounded-[10px] border border-amber/40 font-condensed font-semibold text-[12.5px] tracking-[.06em] uppercase text-amber-hi hover:bg-amber/[.08]"
          >
            {doneWord} →
          </button>
        )}
        {interactive ? (
          <button
            type="button"
            aria-label={`Edit ${name}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="w-11 h-11 rounded-[10px] border border-hairline grid place-items-center text-amber-hi hover:bg-ink/[.03]"
          >
            <ChevronRight size={18} />
          </button>
        ) : (
          <span aria-hidden="true" className="w-11 h-11" />
        )}
      </span>
    </div>
  );
};
