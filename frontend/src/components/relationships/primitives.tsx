import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

// The Relationships surface's small shared pieces, all built from the house
// grammar (DispatchDashboard's gradient CTA, WhoToCallTab's code chip,
// HardwareBoard's section heads). Module-level on purpose — nothing here is
// ever defined inside a render body. Components only (react-refresh); the
// name helper lives in lib/relationships/nameOf.

type Size = "sm" | "md" | "lg";
const HEIGHT: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-[14.5px]",
  lg: "h-11 px-5 text-[15px]",
};

// The amber gradient CTA — the app's primary button.
export const PrimaryButton = ({
  className = "",
  size = "md",
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: Size }) => (
  <button
    type="button"
    className={`inline-flex items-center justify-center gap-1.5 ${HEIGHT[size]} rounded-[10px] font-condensed font-semibold tracking-[.05em] text-canvas whitespace-nowrap hover:brightness-105 disabled:opacity-40 disabled:hover:brightness-100 ${className}`}
    style={{
      background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
      boxShadow: "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
      ...style,
    }}
    {...rest}
  >
    {children}
  </button>
);

// The same CTA as an anchor — tel: / sms: / mailto: doors. An <a> styled as
// the button, never a <button> nested inside an <a>.
export const PrimaryLink = ({
  className = "",
  size = "md",
  children,
  style,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { size?: Size }) => (
  <a
    className={`inline-flex items-center justify-center gap-1.5 ${HEIGHT[size]} rounded-[10px] font-condensed font-semibold tracking-[.05em] text-canvas whitespace-nowrap hover:brightness-105 ${className}`}
    style={{
      background: "linear-gradient(178deg, var(--color-hot), var(--color-amber))",
      boxShadow: "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
      ...style,
    }}
    {...rest}
  >
    {children}
  </a>
);

export const GhostLink = ({
  className = "",
  size = "md",
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { size?: Size }) => (
  <a
    className={`inline-flex items-center justify-center gap-1.5 ${HEIGHT[size]} rounded-[9px] border border-hairline font-condensed font-semibold text-dim hover:text-ink whitespace-nowrap ${className}`}
    {...rest}
  >
    {children}
  </a>
);

// The quiet secondary — a hairline border and dim text; `danger` for Park.
export const GhostButton = ({
  className = "",
  size = "md",
  tone = "default",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: Size; tone?: "default" | "danger" }) => (
  <button
    type="button"
    className={`inline-flex items-center justify-center gap-1.5 ${HEIGHT[size]} rounded-[9px] border font-condensed font-semibold whitespace-nowrap disabled:opacity-40 ${
      tone === "danger"
        ? "border-status-negative-text/40 text-status-negative-text hover:bg-status-negative-text/10"
        : "border-hairline text-dim hover:text-ink"
    } ${className}`}
    {...rest}
  >
    {children}
  </button>
);

// The operational section head: condensed 11px, .14em, uppercase, faint.
export const SectionHead = ({
  children,
  right,
  className = "",
}: {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) => (
  <div
    className={`flex items-center gap-2.5 flex-wrap px-3.5 pt-3 pb-2 font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint ${className}`}
  >
    <span>{children}</span>
    {right && (
      <span className="ml-auto normal-case tracking-[.06em] text-[11.5px] text-amber-hi">
        {right}
      </span>
    )}
  </div>
);

// The agency-code plate; a codeless prospect wears a faint dashed NO CODE.
export const CodeChip = ({ code }: { code: string | null | undefined }) =>
  code ? (
    <span className="inline-flex items-center h-[18px] px-[7px] rounded font-condensed font-bold text-[11px] tracking-[.12em] text-ink bg-gradient-to-b from-plate-a to-plate-lo border-t border-white/10">
      {code}
    </span>
  ) : (
    <span className="inline-flex items-center h-[18px] px-[7px] rounded font-condensed font-semibold text-[10px] tracking-[.12em] uppercase text-faint border border-dashed border-hairline">
      no code
    </span>
  );

// PARKED — outlined red, transparent (the nod sheet's .pill.parked).
export const ParkedChip = () => (
  <span className="inline-flex items-center h-[20px] px-2.5 rounded-[10px] font-condensed font-semibold text-[10px] tracking-[.09em] uppercase text-status-negative-text border border-status-negative-text/40">
    parked
  </span>
);

// A form field's label.
export const FieldLabel = ({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) => (
  <label
    htmlFor={htmlFor}
    className="block font-condensed font-semibold text-[11px] tracking-[.1em] uppercase text-faint mb-1"
  >
    {children}
  </label>
);

// A write's error, by name, right where it happened.
export const ErrorLine = ({ children }: { children: ReactNode }) =>
  children ? (
    <p role="alert" className="font-condensed text-[12.5px] text-status-negative-text mt-2">
      {children}
    </p>
  ) : null;
