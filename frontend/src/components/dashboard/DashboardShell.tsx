import { useState, type ReactNode } from "react";

// The tabbed dashboard frame ("shell") — the tab bar + content container every
// dashboard tab plugs into. Styled at mockup fidelity (dark bar, amber active
// pill). Active tab persists so a refresh keeps you where you were.
export interface DashTab {
  key: string;
  label: string;
}

export const DashboardShell = ({
  tabs,
  storageKey = "dash-tab",
  right,
  children,
}: {
  tabs: DashTab[];
  storageKey?: string;
  right?: ReactNode;
  children: (active: string) => ReactNode;
}) => {
  const [active, setActive] = useState<string>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved && tabs.some((t) => t.key === saved) ? saved : tabs[0].key;
  });
  const pick = (k: string) => {
    setActive(k);
    localStorage.setItem(storageKey, k);
  };

  return (
    <div className="ds2-board overflow-hidden">
      <div className="flex items-center gap-1 px-4 py-2.5 flex-wrap bg-well border-b border-hairline">
        <span className="font-condensed font-bold text-[15px] mr-3 tracking-wide text-ink">
          Dashboard
        </span>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => pick(t.key)}
            className={`text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-colors ${
              active === t.key
                ? "bg-amber text-canvas"
                : "text-dim hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
        {right && <div className="ml-auto flex items-center gap-3">{right}</div>}
      </div>
      <div className="p-4 sm:p-5">{children(active)}</div>
    </div>
  );
};

// A clean placeholder for a tab that's being built out next — previews what
// will live there so the structure reads even before the content lands.
export const TabStub = ({
  title,
  blurb,
  points,
}: {
  title: string;
  blurb: string;
  points: string[];
}) => (
  <div
    className="rounded-xl p-6 text-center flex flex-col items-center justify-center bg-panel border border-dashed border-hairline"
    style={{ minHeight: 360 }}
  >
    <p className="font-condensed text-2xl text-ink">{title}</p>
    <p className="text-sm text-dim mt-1 mb-4">{blurb}</p>
    <div className="inline-flex flex-col gap-1.5 text-left">
      {points.map((p) => (
        <span key={p} className="text-[12.5px] text-dim">
          <span className="text-amber">•</span> {p}
        </span>
      ))}
    </div>
    <p className="text-[11px] mt-5 text-faint">
      building this next — the mockup you approved
    </p>
  </div>
);
