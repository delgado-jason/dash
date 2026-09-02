import { markupToMargin, dialRungs } from "@/lib/metrics/rateDial";

// THE RATE DIAL (approved mockup, 2026-09-02): one slider per freight class,
// denominated in the MARGIN you're pricing for. Rungs derive target −5 /
// target / target +5 in margin space and are written back as the same markup
// percentages the Scorer and ladders have always read — the dial is input
// UX, not new math. The goal marker and band shading make the padding
// GEOGRAPHY: the gap between your handle and the goal line is the cushion
// you chose, never a hidden fudge factor.

type Tier3 = { min: number; target: number; strong: number };

// The track PAINTS from −10 so the red zone is visible geography, but the
// HANDLE floors at 0 — the dial never writes a below-break-even rung, so the
// page-level ascending guard can never trip from here.
const TRACK_LO = -10;
const LO = 0; // handle minimum
const HI = 45;
const posOf = (m: number) => `${((m - TRACK_LO) / (HI - TRACK_LO)) * 100}%`;

export const RateDial = ({
  label,
  dot,
  tiers,
  onChange,
  be,
  marginGoalPct,
  windowLabel,
}: {
  label: string;
  dot: string;
  tiers: Tier3; // markup percentages — the stored settings shape
  onChange: (t: Tier3) => void;
  be: number | null; // break-even (walk-away) gross $/mi
  marginGoalPct: number; // e.g. 15
  windowLabel: string | null; // e.g. "Jun–Aug" — the break-even's window
}) => {
  // The handle position derives from the stored target markup, so the dial
  // and the columns can never disagree.
  const margin = Math.round(markupToMargin(tiers.target / 100) * 1000) / 10;
  const goal = marginGoalPct;
  // Cards and readout render the STORED columns — the truth the Scorer reads —
  // never a re-derivation. A legacy set (e.g. seeded +35/45/60) shows exactly
  // as saved until the first slide rewrites it into dial shape.
  const stored = (["min", "target", "strong"] as const).map((k) => ({
    key: k,
    markup: tiers[k] / 100,
    margin: markupToMargin(tiers[k] / 100),
  }));

  const slide = (mPct: number) => {
    const r = dialRungs(mPct / 100);
    onChange({
      min: Math.round(r.markups.minimum * 1000) / 10,
      target: Math.round(r.markups.target * 1000) / 10,
      strong: Math.round(r.markups.strong * 1000) / 10,
    });
  };

  const atFloor = margin <= 0;
  const under = !atFloor && margin < goal;
  const at = (markup: number) => (be != null ? `$${(be * (1 + markup)).toFixed(2)}` : "—");
  const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`; // input already in percent

  // Zone geometry in margin space: red below 0, amber 0→goal, pale green
  // goal→goal+5, solid green past goal+5.
  const zx = (m: number) => ((Math.min(HI, Math.max(TRACK_LO, m)) - TRACK_LO) / (HI - TRACK_LO)) * 100;

  return (
    <div className="rounded-lg p-3.5" style={{ background: "#0d1119" }}>
      <div className="flex items-center gap-2">
        <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: dot }} />
        <span className="text-sm font-medium text-light">{label}</span>
        <span className="text-sm tabular-nums" style={{ color: atFloor ? "#f87171" : "#ffcf7a", fontWeight: 600 }}>
          · pricing for {pct1(margin)} margin
        </span>
        {!atFloor && !under && (
          <span className="text-[11px]" style={{ color: "#4ade80" }}>
            {Math.round((margin - goal) * 10) / 10} pts above your {goal}% goal — your padding
          </span>
        )}
      </div>

      {/* the track */}
      <div className="relative mt-5" style={{ height: 56 }}>
        <div className="absolute left-0 right-0 overflow-hidden rounded-md" style={{ top: 22, height: 12, border: "1px solid #26304a" }}>
          <span className="absolute inset-y-0" style={{ left: 0, width: `${zx(0)}%`, background: "rgba(224,82,82,.45)" }} />
          <span className="absolute inset-y-0" style={{ left: `${zx(0)}%`, width: `${zx(goal) - zx(0)}%`, background: "rgba(232,148,10,.28)" }} />
          <span className="absolute inset-y-0" style={{ left: `${zx(goal)}%`, width: `${zx(goal + 5) - zx(goal)}%`, background: "rgba(111,208,140,.22)" }} />
          <span className="absolute inset-y-0" style={{ left: `${zx(goal + 5)}%`, right: 0, background: "rgba(111,208,140,.42)" }} />
        </div>
        {/* fixed markers: break-even and the goal */}
        <span className="absolute" style={{ left: posOf(0), top: 14, width: 2, height: 28, background: "#e8edf6", opacity: 0.85 }} />
        <span className="absolute text-[10px] text-muted-text" style={{ left: posOf(0), top: 0, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
          break-even 0%
        </span>
        <span className="absolute" style={{ left: posOf(goal), top: 14, width: 2, height: 28, background: "#e8edf6", opacity: 0.85 }} />
        <span className="absolute text-[10px] text-muted-text" style={{ left: posOf(goal), top: 0, transform: "translateX(-50%)", whiteSpace: "nowrap" }}>
          your goal {goal}%
        </span>
        <input
          type="range"
          min={LO}
          max={HI}
          step={0.5}
          value={Math.max(LO, margin)}
          aria-label={`${label} target margin`}
          onChange={(e) => slide(Number(e.target.value))}
          className="rate-dial-range absolute"
          style={{ left: `${zx(0)}%`, right: 0, top: 16, height: 24, ["--dial-thumb" as string]: atFloor ? "#e05252" : "#f5b03a" }}
        />
        <span className="absolute text-[10px] text-muted-text" style={{ left: 0, bottom: 0 }}>−10%</span>
        <span className="absolute text-[10px] text-muted-text" style={{ right: 0, bottom: 0 }}>45%</span>
      </div>

      {atFloor && (
        <p className="text-[12px] mt-2 font-semibold" style={{ color: "#f87171" }}>
          ⚠ AT BREAK-EVEN — the handle stops here. Everything left of the marker is
          the red zone: every mile there pays the broker.
        </p>
      )}
      {under && (
        <p className="text-[12px] mt-2" style={{ color: "#e8940a" }}>
          Pricing under your {goal}% goal — slippage lands below it. Down-market mode; watch the volume.
        </p>
      )}

      {/* live readout — both currencies plus this week's actual dollars */}
      <div className="text-[11px] text-muted-text mt-2.5">
        {be != null ? (
          <>
            {pct1(margin)} margin ⇒{" "}
            <span className="text-light">+{pct1(tiers.target)}</span> over break-even ⇒
            book at <span className="text-light tabular-nums">≈ {at(tiers.target / 100)}/mi</span> gross
          </>
        ) : (
          "add a few months of P&L to preview the rates"
        )}
      </div>

      {/* rung cards */}
      <div className="grid grid-cols-3 gap-2 mt-2">
        {stored.map((r, i) => (
          <div key={r.key} className="rounded px-2 py-1.5" style={{ background: "#111827", border: "1px solid #1e2636" }}>
            <div className="text-[10px] uppercase tracking-wide text-muted-text">
              {["Minimum", "Target", "Strong"][i]}
            </div>
            <div className="text-sm tabular-nums font-semibold" style={{ color: ["#93a1b8", "#e8940a", "#4ade80"][i] }}>
              {at(r.markup)}
            </div>
            <div className="text-[10px] text-muted-text tabular-nums">
              {pct1(r.margin * 100)} margin · +{pct1(r.markup * 100)}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[10.5px] text-muted-text mt-1.5">
        walk-away {be != null ? `$${be.toFixed(2)}` : "—"} · cash{windowLabel ? ` · ${windowLabel}` : ""} · live — moves with your break-even
      </div>
    </div>
  );
};
