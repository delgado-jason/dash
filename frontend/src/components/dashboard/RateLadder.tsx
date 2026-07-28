import type { RateLadder as Ladder } from "@/lib/metrics/rateTargets";
// The rpm formatter, aliased — `rpm` is already a prop name in this component.
import { rpm as rate } from "@/lib/format";

interface Props {
  ladder: Ladder;
  rpm: number | null; // your current rate — the marker
  spec?: Ladder; // optional Specialized ladder — shown as a compact second row
}

const RED = "#e24b4a";
const AMBER = "#e8940a";
const GREEN = "#1d9e75";
const GREEN_BRIGHT = "#4ade80"; // reads as text on dark, unlike the fill green
const CORAL = "#e05a3a"; // Specialized — matches the Scorer/Settings dot
const TRACK = "#232c3f";


// Horizontal ladder from walk-away → strong, split at the target tier. A marker
// shows where the current rate lands: red at/below walk-away (losing money),
// amber below target, green at/above target.
export const RateLadder = ({ ladder, rpm, spec }: Props) => {
  const { walkAway, target, strong } = ladder;
  if (walkAway == null || target == null || strong == null) return null;
  // Specialized shares the same walk-away (break-even) — only its target/strong
  // markups differ, so the compact row shows just those two.
  const showSpec = spec != null && spec.target != null && spec.strong != null;

  const span = strong - walkAway;
  const targetPos = span > 0 ? ((target - walkAway) / span) * 100 : 58;
  const markerPos =
    rpm == null || span <= 0
      ? null
      : Math.max(0, Math.min(1, (rpm - walkAway) / span)) * 100;
  const markerColor =
    rpm == null ? AMBER : rpm >= target ? GREEN : rpm <= walkAway ? RED : AMBER;

  return (
    <div>
      {markerPos != null && (
        <div className="relative h-4 mb-1 text-xs">
          <div
            className="absolute whitespace-nowrap font-condensed"
            style={{
              left: `${markerPos}%`,
              transform: "translateX(-50%)",
              color: markerColor,
            }}
          >
            you {rate(rpm)} ▼
          </div>
        </div>
      )}

      <div
        className="flex h-3 rounded overflow-hidden"
        style={{ background: TRACK }}
      >
        <div style={{ width: `${targetPos}%`, background: AMBER, opacity: 0.55 }} />
        <div style={{ flex: 1, background: GREEN, opacity: 0.55 }} />
      </div>

      <div className="relative h-8 mt-1 text-xs text-muted-text">
        <span className="absolute left-0">
          walk-away
          <br />
          <span className="text-light">{rate(walkAway)}</span>
        </span>
        <span
          className="absolute text-center"
          style={{ left: `${targetPos}%`, transform: "translateX(-50%)" }}
        >
          target
          <br />
          <span className="text-light">{rate(target)}</span>
        </span>
        <span className="absolute right-0 text-right">
          strong
          <br />
          <span className="text-light">{rate(strong)}</span>
        </span>
      </div>

      {showSpec && (
        <div
          className="flex items-center gap-2 flex-wrap mt-2 pt-2 text-xs"
          style={{ borderTop: "0.5px solid rgba(255,255,255,0.07)" }}
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block rounded-full shrink-0"
              style={{ width: 8, height: 8, background: CORAL }}
            />
            <span className="text-light">Specialized</span>
          </span>
          <span className="text-[11px] text-muted-text">oversize · hazmat · heavy</span>
          <span className="ml-auto text-muted-text">
            target <span style={{ color: AMBER }}>{rate(spec!.target)}</span> · strong{" "}
            <span style={{ color: GREEN_BRIGHT }}>{rate(spec!.strong)}</span>
          </span>
        </div>
      )}
    </div>
  );
};
