import type { ReactNode } from "react";

// Design System v2 — the state chip. Tone is generic (good/info/amber/bad/
// neutral); pages map their domain statuses (delivered→good, paid→info,
// in_transit→amber, cancelled→bad) at their migration slice.
export type PillTone = "good" | "info" | "amber" | "bad" | "neutral";

const TONE: Record<PillTone, string> = {
  good: "bg-status-positive-text/10 text-status-positive-text",
  info: "bg-status-info-text/10 text-[#7ab0e8]",
  amber: "bg-amber/10 text-amber-hi",
  bad: "bg-status-negative-text/10 text-status-negative-text",
  neutral: "bg-white/5 text-dim",
};

export const StatusPill = ({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: PillTone;
  className?: string;
  children: ReactNode;
}) => (
  <span
    className={`inline-flex items-center gap-1.5 h-[21px] px-2.5 rounded-[10px] text-[10px] font-semibold tracking-[.09em] uppercase before:content-[''] before:w-[5px] before:h-[5px] before:rounded-full before:bg-current ${TONE[tone]} ${className}`}
  >
    {children}
  </span>
);

// The warning lamp — dashboards' alert strip. Amber illumination on the
// etched board; category reads like a cluster tell-tale label.
export const AlertLamp = ({
  category,
  className = "",
  children,
}: {
  category: string;
  className?: string;
  children: ReactNode;
}) => (
  <div
    className={`flex items-center gap-2.5 h-[34px] px-3.5 rounded-lg border border-amber/30 bg-amber/8 text-[12.5px] text-dim ${className}`}
  >
    <span className="text-[9.5px] font-semibold tracking-[.14em] uppercase text-amber-hi">
      {category}
    </span>
    <span className="min-w-0 truncate">{children}</span>
  </div>
);
