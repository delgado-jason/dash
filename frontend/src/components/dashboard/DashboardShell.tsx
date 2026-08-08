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
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#0b111b", border: "1px solid #26304a" }}
    >
      <div
        className="flex items-center gap-1 px-4 py-2.5 flex-wrap"
        style={{ background: "#0d131f", borderBottom: "1px solid #26304a" }}
      >
        <span className="font-condensed font-bold text-[15px] mr-3 tracking-wide text-light">
          Dashboard
        </span>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => pick(t.key)}
            className="text-[12.5px] font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
            style={
              active === t.key
                ? { background: "#e8940a", color: "#12151b" }
                : { color: "#8b93a3" }
            }
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
    className="rounded-xl p-6 text-center flex flex-col items-center justify-center"
    style={{ background: "#0f1622", border: "1px dashed #2a3347", minHeight: 360 }}
  >
    <p className="font-condensed text-2xl text-light">{title}</p>
    <p className="text-sm text-muted-text mt-1 mb-4">{blurb}</p>
    <div className="inline-flex flex-col gap-1.5 text-left">
      {points.map((p) => (
        <span key={p} className="text-[12.5px] text-muted-text">
          <span style={{ color: "#e8940a" }}>•</span> {p}
        </span>
      ))}
    </div>
    <p className="text-[11px] mt-5" style={{ color: "#5b6577" }}>
      building this next — the mockup you approved
    </p>
  </div>
);
