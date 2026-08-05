import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

// The shared form field pieces. The look lives in `.ds-*` classes (index.css)
// so every form across the app reads the same. Compose: a `Field` (label +
// inline error) wrapping an `AffixInput`, a `SelectControl`, or any `.ds-input`.

interface FieldProps {
  label: string;
  hint?: string; // a light note beside the label, e.g. "· fills from city"
  error?: string | null;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

export const Field = ({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: FieldProps) => (
  <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
    <label
      htmlFor={htmlFor}
      className="text-[11px] font-semibold uppercase tracking-wide text-[#9fb0c9]"
    >
      {label}
      {hint && (
        <span className="ml-1 font-medium normal-case tracking-normal text-muted-text">
          {hint}
        </span>
      )}
    </label>
    {children}
    {error && <span className="text-[11.5px] text-[#f0857a]">{error}</span>}
  </div>
);

interface AffixInputProps extends InputHTMLAttributes<HTMLInputElement> {
  prefix?: string; // unit shown before the value, e.g. "$"
  suffix?: string; // unit shown after the value, e.g. "gal" / "mi"
  invalid?: boolean;
}

// A boxed input with an optional unit affix. Numeric by default: right-aligned,
// tabular figures, and no spinner arrows.
export const AffixInput = ({
  prefix,
  suffix,
  invalid,
  className,
  ...props
}: AffixInputProps) => (
  <div className={`ds-ctrl ${invalid ? "ds-ctrl--err" : ""}`}>
    {prefix && <span className="ds-affix ds-affix--pre">{prefix}</span>}
    <input className={`ds-num ${className ?? ""}`} {...props} />
    {suffix && <span className="ds-affix ds-affix--suf">{suffix}</span>}
  </div>
);

interface SelectControlProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

// A native <select> styled to match the field system (custom chevron; the
// native mobile picker is preserved).
export const SelectControl = ({
  invalid,
  className,
  children,
  ...props
}: SelectControlProps) => (
  <div className={`ds-ctrl ${invalid ? "ds-ctrl--err" : ""}`}>
    <select className={className} {...props}>
      {children}
    </select>
    <span className="ds-chev">▾</span>
  </div>
);
