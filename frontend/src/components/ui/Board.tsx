import type { HTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

// Design System v2 — the etched flat surface ("flat = read").
// Telemetry, charts, tables and forms live on Boards; machined depth is
// reserved for ForgedPlate. See the gate-3 spec, §04.
export const Board = ({
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={`ds2-board ${className}`} {...rest} />
);

type Tone = "pos" | "neg" | "amb" | "none";
const TONE: Record<Tone, string> = {
  pos: "bg-status-positive-text",
  neg: "bg-status-negative-text",
  amb: "bg-amber",
  none: "bg-hairline",
};

// One KPI cell. Compose several in a grid inside a Board; interior rules
// come from the composing grid (divide-x/divide-y with ds2-cell-rule), so a
// lone cell carries no borders of its own.
export const BoardCell = ({
  label,
  value,
  sub,
  tone = "none",
  valueClassName = "",
  className = "",
  to,
  go,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  valueClassName?: string;
  className?: string;
  to?: string; // drill-down destination — every number is a door
  go?: string; // hover affordance text, e.g. "loads" → shows "→ loads"
}) => {
  const body = (
    <>
      <p className="ds2-label">{label}</p>
      <p
        className={`font-condensed font-semibold text-[30px] leading-[1.05] mt-1.5 tabular-nums ${valueClassName}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11.5px] text-faint">{sub}</p>}
      <span
        className={`absolute left-[18px] bottom-0 h-0.5 w-[34px] rounded-[1px] ${TONE[tone]}`}
      />
      {to && go && (
        <span className="absolute top-3 right-3 text-[10px] text-amber-light opacity-0 group-hover:opacity-100 transition-opacity">
          → {go}
        </span>
      )}
    </>
  );
  return to ? (
    <Link
      to={to}
      className={`group block relative px-[18px] py-4 hover:bg-white/[.02] transition-colors ${className}`}
    >
      {body}
    </Link>
  ) : (
    <div className={`relative px-[18px] py-4 ${className}`}>{body}</div>
  );
};
