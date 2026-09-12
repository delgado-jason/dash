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
// n OF 3 LOADS / NEVER RAN) — the row draws whichever one it is handed.

export type RowChipKind = "parked" | "losing" | "suggest" | "progress" | "never";
export interface RowChip {
  kind: RowChipKind;
  label: string;
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
  context: string; // line 2 — at most three facts, the caller's job
  // Days since the last two-way contact. null = never; undefined = not known
  // (the loads slice didn't come through, and a load IS contact) → "—".
  daysSince: number | null | undefined;
  market?: string | null; // md+ cell
  loadsCell?: string | null; // md+ cell — "6 · $5.01"
  dimmed?: boolean;
  onOpen: () => void;
}

const RowChipPill = ({ chip }: { chip: RowChip }) => {
  switch (chip.kind) {
    case "parked":
      return <ParkedChip />;
    case "losing":
      return <StatusPill tone="bad">{chip.label}</StatusPill>;
    case "suggest":
      return <StatusPill tone="info">{chip.label}</StatusPill>;
    default:
      return <StatusPill tone="neutral">{chip.label}</StatusPill>;
  }
};

export const AgentRow = ({
  agent,
  chip,
  context,
  daysSince,
  market,
  loadsCell,
  dimmed = false,
  onOpen,
}: AgentRowProps) => {
  const name = nameOf(agent);
  // The row is a button that CONTAINS a link (the name → dossier), so it is a
  // keyboard-reachable div rather than a <button>. Enter on the focused link
  // stays a link press — only the row itself answers Enter / Space.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  const stop = (e: MouseEvent) => e.stopPropagation();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className={`grid items-center gap-3 px-3.5 py-2.5 border-t border-hairline-lo min-h-[56px] cursor-pointer hover:bg-white/[.02] transition-colors grid-cols-[minmax(0,1fr)_72px_44px] md:grid-cols-[minmax(0,1fr)_130px_110px_72px_44px] ${
        dimmed ? "opacity-70" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
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
          {daysSince === undefined ? "—" : daysSince === null ? "never" : `${daysSince}d`}
        </span>
        <span className="block font-condensed text-[10px] tracking-[.08em] uppercase text-faint mt-0.5">
          {daysSince === null ? "contact" : "since contact"}
        </span>
      </span>
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
    </div>
  );
};
