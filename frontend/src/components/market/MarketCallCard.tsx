import type { MarketCall, TierCall } from "@/lib/metrics/marketCall";
import { indexSentence } from "@/lib/metrics/marketSignal";
import { rpm as fmtRpm } from "@/lib/format";

const ACTION_COLOR: Record<TierCall["action"], string> = {
  raise: "var(--color-cat2)",
  hold: "var(--color-amber-hi)",
  protect: "var(--color-amber-hi)",
  "under-floor": "var(--color-amber)", // caution — below break-even, but not a loss
  "cut-costs": "var(--color-status-negative-text)",
  "no-call": "var(--color-dim)",
};

const RUNG_COLOR: Record<string, string> = {
  strong: "var(--color-cat2)",
  target: "var(--color-amber-hi)",
  floor: "var(--color-dim)",
  breakEven: "var(--color-status-negative-text)",
  you: "var(--color-amber-hi)",
};

const RUNG_TAG: Record<string, string> = {
  floor: "don't chase below",
  breakEven: "lose money below",
};

// One tier: the call, why, the evidence it rests on, and the rungs with your
// median dropped in — so the call is something you can see, not decode.
const TierColumn = ({ call }: { call: TierCall }) => {
  const e = call.evidence;
  const lower = call.label.toLowerCase();
  const evidence =
    call.yourRate == null
      ? null
      : `${e.n} load${e.n === 1 ? "" : "s"} · median ${fmtRpm(call.yourRate)} · ${e.below} under break-even` +
        (e.pctile != null
          ? ` · target at the ${Math.round(e.pctile * 100)}th percentile of your accepted ${lower} loads`
          : e.n > 0
            ? ` · fewer than 8 ${lower} loads to rank the target`
            : "") +
        (e.disagree ? " · the index and your loads disagree" : "");
  const rows =
    call.yourRate == null
      ? []
      : [
          ...call.rungs.map((r) => ({ key: r.key, label: r.label, rate: r.rate, you: false })),
          { key: "you", label: "You're booking", rate: call.yourRate, you: true },
        ].sort((a, b) => b.rate - a.rate);

  return (
    <div className="p-4">
      <div className="text-[11px] uppercase tracking-[.10em] text-faint font-condensed mb-2">
        {call.label} <span className="normal-case tracking-normal">· last 90 days</span>
      </div>
      <div className="font-condensed text-[19px] font-semibold leading-tight" style={{ color: ACTION_COLOR[call.action] }}>
        {call.headline}
      </div>
      <p className="text-[12.5px] text-dim mt-1 leading-snug">{call.why}</p>
      {evidence && (
        <p className="font-condensed text-[11.5px] text-faint mt-1.5 mb-3 leading-snug">
          <span className="uppercase tracking-[.1em]">evidence</span> · {evidence}
        </p>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col gap-1">
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex items-center justify-between rounded-[7px] px-2.5 py-1.5"
              style={r.you ? { background: "color-mix(in srgb, var(--color-amber) 13%, transparent)", border: "1px solid color-mix(in srgb, var(--color-amber) 36%, transparent)" } : undefined}
            >
              <span className="text-[12.5px]" style={{ color: RUNG_COLOR[r.key], fontWeight: r.you ? 600 : 400 }}>
                {r.label}
                {RUNG_TAG[r.key] && (
                  <span className="text-[9.5px] uppercase tracking-[.06em] text-faint ml-1.5">{RUNG_TAG[r.key]}</span>
                )}
              </span>
              <span className="font-condensed text-[16px]" style={{ color: r.you ? "var(--color-amber-hi)" : "var(--color-ink)", fontWeight: r.you ? 600 : 400 }}>
                {fmtRpm(r.rate)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const BADGE = {
  firming: { arrow: "▲", color: "var(--color-cat2)", bg: "color-mix(in srgb, var(--color-cat2) 10%, transparent)", border: "color-mix(in srgb, var(--color-cat2) 32%, transparent)" },
  softening: { arrow: "▼", color: "var(--color-amber-hi)", bg: "color-mix(in srgb, var(--color-amber) 10%, transparent)", border: "color-mix(in srgb, var(--color-amber) 32%, transparent)" },
  flat: { arrow: "▬", color: "var(--color-dim)", bg: "color-mix(in srgb, var(--color-dim) 10%, transparent)", border: "color-mix(in srgb, var(--color-dim) 28%, transparent)" },
  none: { arrow: "—", color: "var(--color-faint)", bg: "color-mix(in srgb, var(--color-faint) 10%, transparent)", border: "color-mix(in srgb, var(--color-faint) 26%, transparent)" },
} as const;

// The signal's badge: a direction only when it HOLDS and isn't fuel; otherwise
// the honest state — a fuel move, not yet a call, steady, or no read.
const badgeOf = (call: MarketCall): { word: string; meta: (typeof BADGE)[keyof typeof BADGE] } => {
  const s = call.signal;
  if (!s) return { word: "No index read", meta: BADGE.none };
  if (s.fuelDriven) return { word: "Fuel move — not a rate call", meta: BADGE.flat };
  if (s.direction === "firming") return { word: `Firming · ${s.prints} prints`, meta: BADGE.firming };
  if (s.direction === "softening") return { word: `Softening · ${s.prints} prints`, meta: BADGE.softening };
  if (s.raw !== "flat") return { word: `${s.raw === "firming" ? "Firming" : "Softening"} · 1 print — not yet a call`, meta: BADGE.flat };
  return { word: "Steady", meta: BADGE.flat };
};

export const MarketCallCard = ({ call }: { call: MarketCall }) => {
  const { word, meta } = badgeOf(call);
  return (
    <div className="ds2-board overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-hairline">
        <span className="font-condensed text-[18px] font-semibold text-ink">The call</span>
        <span className="font-condensed text-[12px] text-faint">one move per tier, each on its own freight</span>
        <span
          className="ml-auto flex items-center gap-1.5 text-[12.5px] rounded-lg px-2.5 py-1"
          style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
        >
          <span>{meta.arrow}</span> {word}
        </span>
      </div>
      <div className="px-4 py-3 border-b border-hairline text-[13.5px] text-dim">
        {indexSentence(call.signal)} · the index may nudge a tier one step, only once it has held two prints and isn’t diesel.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-hairline">
        {call.tiers.map((t) => (
          <TierColumn key={t.key} call={t} />
        ))}
      </div>
    </div>
  );
};
