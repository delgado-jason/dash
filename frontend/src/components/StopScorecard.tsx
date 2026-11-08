import type { StopScore } from "@/lib/metrics/stopScore";
import { fmtDuration } from "@/lib/stopTimes";

// Shorter dwell is better — green under 90m, amber under 3h, red beyond.
const dwellTone = (mins: number | null): string => {
  if (mins == null) return "var(--color-ink)";
  if (mins < 90) return "var(--color-status-positive-text)";
  if (mins < 180) return "var(--color-amber-hi)";
  return "color-mix(in srgb, var(--color-status-negative-text) 70%, transparent)";
};

const Tile = ({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: string;
}) => (
  <div
    className="rounded-[10px] px-3 py-2.5 text-center flex-1 min-w-[88px]"
    style={{ background: "var(--color-well)" }}
  >
    <div
      className="font-condensed text-xl leading-none"
      style={{ color: tone ?? "var(--color-ink)" }}
    >
      {value}
    </div>
    <div className="text-[9px] text-muted-text mt-1 tracking-wide uppercase">
      {label}
    </div>
  </div>
);

interface Props {
  score: StopScore | null;
  countLabel: string; // e.g. "Loads"
  countValue: number;
}

// The Phase C dwell / on-time / detention tiles, or a "needs data" note until
// there are enough timed stops. Shared by the facility and agent pages.
export const StopScorecard = ({ score, countLabel, countValue }: Props) => {
  if (!score || !score.hasData)
    return (
      <p className="text-sm text-muted-text">
        Fills in as loads accrue — needs at least 3 stops with in/out times logged
        {score ? ` (${score.timedStops} so far)` : ""}.
      </p>
    );

  return (
    <>
      <div className="flex gap-2 flex-wrap">
        <Tile
          value={fmtDuration(score.medianDwellMin) ?? "—"}
          label="Typical dwell"
          tone={dwellTone(score.medianDwellMin)}
        />
        <Tile
          value={
            score.onTimePct != null ? `${Math.round(score.onTimePct * 100)}%` : "—"
          }
          label="On-time"
          tone={score.onTimePct != null ? "var(--color-status-positive-text)" : undefined}
        />
        <Tile
          value={`${score.detentionCount} / ${score.timedStops}`}
          label="Detention"
          tone={score.detentionCount > 0 ? "var(--color-amber-hi)" : "var(--color-status-positive-text)"}
        />
        <Tile value={String(countValue)} label={countLabel} />
      </div>
      {score.unpaidCount > 0 && (
        <p className="text-[11px] mt-2" style={{ color: "color-mix(in srgb, var(--color-status-negative-text) 70%, transparent)" }}>
          {score.unpaidCount} detention {score.unpaidCount === 1 ? "load" : "loads"}{" "}
          still unpaid — worth chasing.
        </p>
      )}
    </>
  );
};
