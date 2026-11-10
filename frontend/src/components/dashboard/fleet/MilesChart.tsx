import { type MileMonth, peakDriven } from "@/lib/metrics/milesHistory";
import { rpm as fmtRpm } from "@/lib/format";

// Miles a month, and the floor they forced (Jason, 2026-11-09: "if my miles
// are low, it drives my rate up").
//
// Two units on one picture, so neither gets a y-axis it would have to share:
// the BARS are miles, stacked loaded over empty; the month's break-even is
// printed above its own bar as a figure, toned against the rate you actually
// book to; and the booking floor itself is the one dashed rule across the
// chart. A zig-zag line would have needed a second axis in dollars and would
// still have been read off the wrong gridlines.
//
// The mile count sits under each month because the rate is the consequence and
// the miles are the cause, and you should be able to read both without
// measuring a bar with your eye.
const CHART_H = 150;

const miles = (n: number): string => Math.round(n).toLocaleString("en-US");

// Toned against the rate you book to: above it, that month did not clear its
// own costs at your booking rate; near it, close.
const floorTone = (be: number | null, floor: number | null): string => {
  if (be == null) return "text-faint";
  if (floor == null || floor <= 0) return "text-ink";
  if (be > floor) return "text-status-negative-text";
  if (be > floor * 0.9) return "text-amber-hi";
  return "text-status-positive-text";
};

export const MilesChart = ({
  rows,
  bookingFloor,
}: {
  rows: MileMonth[];
  bookingFloor: number | null;
}) => {
  const peak = peakDriven(rows);
  if (rows.length === 0 || peak <= 0)
    return (
      <p className="text-xs text-faint py-4">
        No odometer readings yet — log a load's start and end and the miles
        appear here.
      </p>
    );

  const cols = { gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` };

  return (
    <>
      <div className="relative" style={{ height: CHART_H }}>
        {/* the one dashed rule: the rate you actually book to */}
        {bookingFloor != null && (
          <div
            className="absolute left-0 right-0 top-3.5 border-t border-dashed border-amber/55"
            aria-hidden
          />
        )}
        <div className="grid gap-[7px] items-end h-full" style={cols}>
          {rows.map((r) => {
            const h = (r.driven / peak) * 100;
            const loadedPct = r.driven > 0 ? (r.loaded / r.driven) * h : 0;
            const emptyPct = Math.max(0, h - loadedPct);
            return (
              <div
                key={r.longLabel}
                className="flex flex-col justify-end h-full"
                title={
                  !r.measured
                    ? `${r.longLabel} · ${
                        r.hasActivity
                          ? `${miles(r.loaded)} loaded miles, but no odometer readings — the miles driven are unknown`
                          : "nothing logged"
                      }`
                    : `${r.longLabel} · ${miles(r.driven)} driven · ${miles(r.loaded)} loaded · ${miles(r.empty)} empty${
                        r.breakEven != null
                          ? ` · break-even ${fmtRpm(r.breakEven)}/mi`
                          : " · no P&L filed"
                      }`
                }
              >
                <span
                  className={`font-condensed font-semibold text-[11px] tabular-nums text-center ${floorTone(r.breakEven, bookingFloor)}`}
                >
                  {r.breakEven == null ? "—" : fmtRpm(r.breakEven)}
                </span>
                {/* empty on top, loaded beneath: of these miles, this many paid */}
                <div
                  style={{
                    height: `${emptyPct}%`,
                    background: "var(--color-plate-a)",
                    borderRadius: "3px 3px 0 0",
                    opacity: r.inProgress ? 0.55 : 1,
                  }}
                />
                <div
                  style={{
                    height: `${loadedPct}%`,
                    background: "var(--color-amber)",
                    opacity: r.inProgress ? 0.55 : 1,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* the month, and the miles you drove it */}
      <div className="grid gap-[7px] mt-1.5 text-center" style={cols}>
        {rows.map((r) => (
          <span key={r.longLabel} className="font-condensed text-[11px] text-faint">
            {r.label}
            {/* A month of real freight whose loads carry no odometer reading
                is an UNKNOWN, not a zero — printing 0 would claim the truck
                sat still. Only a month with nothing logged at all reads 0. */}
            <b
              className={`block font-semibold text-[12px] tabular-nums mt-px ${
                r.measured ? (r.inProgress ? "text-faint" : "text-ink") : "text-faint"
              }`}
            >
              {r.measured ? miles(r.driven) : r.hasActivity ? "—" : "0"}
            </b>
          </span>
        ))}
      </div>

      <div className="flex gap-3.5 flex-wrap mt-2.5 font-condensed text-[12px] text-dim">
        <span>
          <i
            className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]"
            style={{ background: "var(--color-amber)" }}
          />
          loaded miles
        </span>
        <span>
          <i
            className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-[-1px]"
            style={{ background: "var(--color-plate-a)" }}
          />
          empty miles
        </span>
        <span className="text-faint">
          the figure above each bar is that month&rsquo;s break-even
          {bookingFloor != null && <> · the dashed rule is the {fmtRpm(bookingFloor)} you book to</>}
        </span>
      </div>
    </>
  );
};
