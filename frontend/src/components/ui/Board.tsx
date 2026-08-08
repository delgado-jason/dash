import type { HTMLAttributes, ReactNode } from "react";

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
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  valueClassName?: string;
  className?: string;
}) => (
  <div className={`relative px-[18px] py-4 ${className}`}>
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
  </div>
);
