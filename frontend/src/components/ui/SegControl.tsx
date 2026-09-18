// Night Cab segmented control — the statusbar's own switch, first built for the
// Lanes mockup (window · metric · grain) and now shared with Website's window.
// Generic in the value so a page can switch on its own union type without
// stringly-typed round trips.
export const SegControl = <T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) => (
  <div
    className="inline-flex h-[30px] p-[3px] rounded-[9px] bg-well gap-[2px]"
    style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}
    role="tablist"
    aria-label={ariaLabel}
  >
    {options.map((o) => (
      <button
        key={String(o.value)}
        role="tab"
        aria-selected={value === o.value}
        onClick={() => onChange(o.value)}
        className={`px-3 rounded-md font-condensed font-semibold text-[12.5px] tracking-[.05em] transition-colors ${
          value === o.value ? "bg-amber text-canvas" : "text-dim hover:text-ink"
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);
