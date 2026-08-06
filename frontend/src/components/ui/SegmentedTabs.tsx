import type { ReactNode } from "react";

// The app's in-page tab control: a segmented track with the active view filled
// amber, so a tab bar reads unmistakably as "pick a view" (not a heading accent).
// One component for every in-page tab bar — don't hand-roll the buttons.
// Values may be strings or numbers (e.g. a day window); labels are free-form.

interface Tab<T extends string | number> {
  value: T;
  label: ReactNode;
}

interface SegmentedTabsProps<T extends string | number> {
  tabs: Tab<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  className?: string;
  ariaLabel?: string;
}

export function SegmentedTabs<T extends string | number>({
  tabs,
  value,
  onChange,
  size = "md",
  className,
  ariaLabel,
}: SegmentedTabsProps<T>) {
  const pad = size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex gap-1 bg-steel rounded-lg p-1 max-w-full overflow-x-auto ${className ?? ""}`}
    >
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={String(t.value)}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`${pad} rounded-md whitespace-nowrap shrink-0 transition-colors ${
              active
                ? "bg-amber text-steel font-semibold"
                : "text-muted-text hover:text-light"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
