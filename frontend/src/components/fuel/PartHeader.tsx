import type { ReactNode } from "react";

// The five parts of the Fuel page wear one heading: the part's number, the
// house panel heading (`ds2-label`, the C1b lesson — one heading system), and
// the part's own line in dim ink.
export const PartHeader = ({ n, title, sub }: { n: string; title: string; sub: ReactNode }) => (
  <div className="flex items-baseline gap-2.5 px-4 pt-2.5 pb-[7px] border-b ds2-cell-rule flex-wrap">
    <span className="font-condensed text-[12px] text-faint tabular-nums tracking-[.12em]">{n}</span>
    <span className="ds2-label text-ink">{title}</span>
    <span className="font-condensed text-[13px] text-faint">· {sub}</span>
  </div>
);

// A sub-heading inside a part ("By vendor · lifetime").
export const SubHeading = ({ children }: { children: ReactNode }) => (
  <p className="font-condensed font-semibold text-[12px] tracking-[.14em] uppercase text-faint px-4 pt-3 pb-1.5">{children}</p>
);
