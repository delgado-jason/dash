import type { RateLadder as Ladder } from "@/lib/metrics/rateTargets";
import { bookedRate } from "@/lib/metrics/rateTargets";

interface Props {
  ladder: Ladder;
  rpm: number | null; // your current rate — the marker (net)
  take?: number; // linehaul take (linehaul % + trailer %); < 1 adds the "book" line
}

const RED = "#e24b4a";
const AMBER = "#e8940a";
const GREEN = "#1d9e75";
const TRACK = "#232c3f";

const rate = (n: number | null): string => (n == null ? "—" : `$${n.toFixed(2)}`);

// Horizontal ladder from walk-away → strong, split at the target tier. The marker
// shows where the current NET rate lands: red at/below walk-away (losing money),
// amber below target, green at/above. When a settlement cut applies (take < 1),
// each rung also shows the full rate you must BOOK to clear it after the cut.
export const RateLadder = ({ ladder, rpm, take = 1 }: Props) => {
  const { walkAway, target, strong } = ladder;
  if (walkAway == null || target == null || strong == null) return null;

  const showBook = take > 0 && take < 1;
  const book = (n: number | null): string => rate(bookedRate(n, take));

  const span = strong - walkAway;
  const targetPos = span > 0 ? ((target - walkAway) / span) * 100 : 58;
  const markerPos =
    rpm == null || span <= 0
      ? null
      : Math.max(0, Math.min(1, (rpm - walkAway) / span)) * 100;
  const markerColor =
    rpm == null ? AMBER : rpm >= target ? GREEN : rpm <= walkAway ? RED : AMBER;

  const rung = (label: string, net: number | null) => (
    <>
      {label}
      <br />
      <span className="text-light">{rate(net)}</span>
      {showBook && (
        <>
          <br />
          <span style={{ color: AMBER }}>book {book(net)}</span>
        </>
      )}
    </>
  );

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

      <div
        className={`relative ${showBook ? "h-12" : "h-8"} mt-1 text-xs text-muted-text`}
      >
        <span className="absolute left-0">{rung("walk-away", walkAway)}</span>
        <span
          className="absolute text-center"
          style={{ left: `${targetPos}%`, transform: "translateX(-50%)" }}
        >
          {rung("target", target)}
        </span>
        <span className="absolute right-0 text-right">
          {rung("strong", strong)}
        </span>
      </div>
    </div>
  );
};
