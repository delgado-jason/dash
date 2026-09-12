import type { KeyboardEvent, MouseEvent } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Phone } from "lucide-react";
import { StatusPill } from "@/components/ui/StatusPill";
import { nameOf } from "@/lib/relationships/nameOf";
import { CodeChip, ParkedChip } from "./primitives";

// The one row for an agent anywhere on the Relationships surface (the nodded
// mock's .row): name + code + exactly ONE status chip, a context line, the
// days since a two-way contact, and a 44px door. Phone-first: three columns;
// md+ adds the market and loads·$ cells.
//
// Chip precedence is the caller's job (PARKED > LOSING MONEY > SUGGEST → … >
// n OF 3 LOADS / NEVER RAN) — the row draws whichever one it is handed. Today
// adds a LEAD chip before the name (the queue section — NOW, CAPACITY, CALL
// BACK…), a TOUCHED {DAY} status chip, its own right cell ("141 miles",
// "Mon promised") and a ghosted state for rows not offered a second touch.

export type RowChipKind =
  | "parked"
  | "losing"
  | "suggest"
  | "progress"
  | "never"
  | "now" // an operational row — hot
  | "callback" // a promise — amber
  | "touched" // already had this week's proactive touch — red
  | "cool" // the owner's cooling flag — info
  | "section"; // a plain section word — neutral
export interface RowChip {
  kind: RowChipKind;
  label: string;
}

export interface RowRight {
  value: string; // the big number — "141", "1d", "Mon"
  caption: string; // the 10px word under it — "miles", "since drop", "promised"
}

export interface AgentRowProps {
  agent: {
    agent_id: string;
    first_name: string;
    last_name: string;
    broker_name: string | null;
    phone?: string | null;
  };
  chip: RowChip | null;
  lead?: RowChip | null; // Today's section chip, drawn before the name
  context: string; // line 2 — at most three facts, the caller's job
  // Days since the last two-way contact. null = never; undefined = not known
  // (the loads slice didn't come through, and a load IS contact) → "—".
  daysSince: number | null | undefined;
  right?: RowRight | null; // overrides the days-since cell
  market?: string | null; // md+ cell
  loadsCell?: string | null; // md+ cell — "6 · $5.01"
  dimmed?: boolean;
  ghosted?: boolean; // half-faded — the row is shown, not offered
  // Absent → a read-only row: no door, no button role (the dispatcher's view
  // of the owner's cooling section).
  onOpen?: () => void;
}

const RowChipPill = ({ chip }: { chip: RowChip }) => {
  switch (chip.kind) {
    case "parked":
      return <ParkedChip />;
    case "losing":
    case "touched":
      return <StatusPill tone="bad">{chip.label}</StatusPill>;
    case "suggest":
    case "cool":
      return <StatusPill tone="info">{chip.label}</StatusPill>;
    case "now":
    case "callback":
      return <StatusPill tone="amber">{chip.label}</StatusPill>;
    default:
      return <StatusPill tone="neutral">{chip.label}</StatusPill>;
  }
};

export const AgentRow = ({
  agent,
  chip,
  lead,
  context,
  daysSince,
  right,
  market,
  loadsCell,
  dimmed = false,
  ghosted = false,
  onOpen,
}: AgentRowProps) => {
  const name = nameOf(agent);
  const interactive = onOpen != null;
  // The row is a button that CONTAINS a link (the name → dossier), so it is a
  // keyboard-reachable div rather than a <button>. Enter on the focused link
  // stays a link press — only the row itself answers Enter / Space.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  const stop = (e: MouseEvent) => e.stopPropagation();
  const fade = ghosted ? "opacity-50" : dimmed ? "opacity-70" : "";
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className={`grid items-center gap-3 px-3.5 py-2.5 border-t border-hairline-lo min-h-[56px] transition-colors grid-cols-[minmax(0,1fr)_72px_44px] md:grid-cols-[minmax(0,1fr)_130px_110px_72px_44px] ${
        interactive ? "cursor-pointer hover:bg-white/[.02]" : ""
      } ${fade}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {lead && <RowChipPill chip={lead} />}
          <Link
            to={`/agents/${agent.agent_id}`}
            onClick={stop}
            className="font-condensed font-medium text-[15px] text-amber hover:text-hot transition-colors leading-tight"
          >
            {name}
          </Link>
          <CodeChip code={agent.broker_name} />
          {chip && <RowChipPill chip={chip} />}
        </div>
        <div className="text-[11.5px] text-dim truncate mt-0.5">{context}</div>
      </div>
      <span className="hidden md:block font-condensed text-[13px] text-dim text-right truncate">
        {market || "—"}
      </span>
      <span className="hidden md:block font-condensed text-[13px] text-dim text-right tabular-nums">
        {loadsCell || "—"}
      </span>
      <span className="text-right">
        <span className="block font-display text-[17px] text-ink tabular-nums leading-none">
          {right ? right.value : daysSince === undefined ? "—" : daysSince === null ? "never" : `${daysSince}d`}
        </span>
        <span className="block font-condensed text-[10px] tracking-[.08em] uppercase text-faint mt-0.5">
          {right ? right.caption : daysSince === null ? "contact" : "since contact"}
        </span>
      </span>
      {interactive ? (
        <button
          type="button"
          aria-label={agent.phone ? `Open ${name} — ${agent.phone}` : `Open ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="w-11 h-11 rounded-[10px] border border-hairline grid place-items-center text-amber-hi hover:bg-white/[.03] justify-self-end"
        >
          {agent.phone ? <Phone size={17} /> : <ChevronRight size={18} />}
        </button>
      ) : (
        <span aria-hidden="true" className="w-11 h-11 justify-self-end" />
      )}
    </div>
  );
};
