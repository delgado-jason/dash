import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";

// The AGENCY row — the nod sheet's `.row.wide`, drawn in AgentRow's grammar
// (same paddings, same hairline, same 44px door, same right-hand number) but
// for a DESK rather than a person.
//
// It is a sibling of AgentRow rather than a call into it because an agency row
// disagrees with it on all three things AgentRow fixes: the name links to
// /agencies/:id (AgentRow hard-links /agents/:id), the line carries a SET of
// code chips (AgentRow draws exactly the one chip codeOf picks), and the sheet
// asks for three md+ cells — delivered · gross, all-in rpm, agents — beside
// the days-since-load cell, where AgentRow offers two. The agency PAGE's
// agents board is the real AgentRow; this is the list's row.

// Shared with the header line above it, so the column words sit over their
// cells: name · delivered·gross · all-in rpm · agents · days · door.
export const AGENCY_ROW_GRID =
  "grid-cols-[minmax(0,1fr)_72px_44px] md:grid-cols-[minmax(0,1fr)_132px_112px_92px_72px_44px]";

// One md+ cell: a number and the small word under it. `sub` null draws nothing
// — a cell with no verdict says nothing rather than inventing one.
export const RowCell = ({ value, sub }: { value: ReactNode; sub?: ReactNode }) => (
  <span className="hidden md:block font-condensed text-[13px] text-dim text-right tabular-nums leading-tight">
    <span className="block truncate">{value}</span>
    {sub ? <span className="block text-[10.5px] text-faint truncate">{sub}</span> : null}
  </span>
);

// The md+ column words, on the row grid.
export const AgencyRowHeader = ({ cols }: { cols: [string, string, string, string, string] }) => (
  <div
    className={`hidden md:grid items-center gap-3 px-3.5 py-2 ${AGENCY_ROW_GRID} font-condensed text-[10.5px] tracking-[.12em] uppercase text-faint`}
  >
    <span>{cols[0]}</span>
    <span className="text-right">{cols[1]}</span>
    <span className="text-right">{cols[2]}</span>
    <span className="text-right">{cols[3]}</span>
    <span className="text-right">{cols[4]}</span>
    <span />
  </div>
);

export interface AgencyRowProps {
  name: string;
  to?: string; // the name is a link when there is somewhere to go
  chips?: ReactNode; // the code chips and any pill, after the name
  context: string; // line 2 — the agents and their tier words, or the shelf's sentence
  cells: [ReactNode, ReactNode, ReactNode]; // delivered · gross | all-in rpm | agents
  right: { value: string; caption: string };
  ghosted?: boolean; // half-faded — shown, not offered (the settlement-only rows)
  onOpen?: () => void;
  openLabel?: string; // what the door's screen-reader label says
  door?: "chevron" | "plus"; // `plus` = this row creates something instead of opening it
}

export const AgencyRow = ({
  name,
  to,
  chips,
  context,
  cells,
  right,
  ghosted = false,
  onOpen,
  openLabel,
  door = "chevron",
}: AgencyRowProps) => {
  const interactive = onOpen != null;
  // The row is a button that CONTAINS a link (the name → the agency page), so
  // it is a keyboard-reachable div rather than a <button>. Enter on the
  // focused link stays a link press; only the row itself answers Enter/Space.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className={`grid items-center gap-3 px-3.5 py-2.5 border-t border-hairline-lo min-h-[56px] transition-colors ${AGENCY_ROW_GRID} ${
        interactive ? "cursor-pointer hover:bg-white/[.02]" : ""
      } ${ghosted ? "opacity-60" : ""}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {to ? (
            <Link
              to={to}
              onClick={stop}
              className="font-condensed font-medium text-[15px] text-amber hover:text-hot transition-colors leading-tight"
            >
              {name}
            </Link>
          ) : (
            <span className="font-condensed font-medium text-[15px] text-amber leading-tight">{name}</span>
          )}
          {chips}
        </div>
        <div className="text-[11.5px] text-dim truncate mt-0.5">{context}</div>
      </div>
      {cells[0]}
      {cells[1]}
      {cells[2]}
      <span className="text-right">
        <span className="block font-display text-[17px] text-ink tabular-nums leading-none">{right.value}</span>
        <span className="block font-condensed text-[10px] tracking-[.08em] uppercase text-faint mt-0.5">
          {right.caption}
        </span>
      </span>
      {interactive ? (
        <button
          type="button"
          aria-label={openLabel ?? `Open ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="w-11 h-11 rounded-[10px] border border-hairline grid place-items-center text-amber-hi hover:bg-white/[.03] justify-self-end"
        >
          {door === "plus" ? <Plus size={18} /> : <ChevronRight size={18} />}
        </button>
      ) : (
        <span aria-hidden="true" className="w-11 h-11 justify-self-end" />
      )}
    </div>
  );
};
