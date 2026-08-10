import { useEffect, useRef, type ReactNode } from "react";
import type { TankRecap } from "@/lib/metrics/fuelEconomy";
import { money, dieselPrice, formatDate } from "@/lib/format";
import { playSfx } from "@/lib/sfx";

const GOOD = "#4ade80";
const BAD = "#f87171";

const signed = (n: number, d = 2) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(d)}`;

const Cell = ({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: ReactNode;
}) => (
  <div
    className="rounded-[10px] p-3"
    style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)" }}
  >
    <p className="font-condensed text-[11px] uppercase tracking-[.12em] text-faint">{label}</p>
    <p className="font-condensed text-xl font-semibold mt-0.5 tabular-nums">{value}</p>
    <p className="font-condensed text-xs mt-0.5">{sub}</p>
  </div>
);

// The "how did my last tank do?" scorecard — the most recent completed tank,
// scored against his own history. See latestTankRecap for the math.
export const LatestTankCard = ({
  recap,
  place,
}: {
  recap: TankRecap | null;
  place?: string | null;
}) => {
  // Fire the record cue ONLY when a new record-setting tank first appears (a
  // fresh fill-up) — never on a passive re-render or a reload of the same tank.
  const lastTank = useRef<number | null>(null);
  const primed = useRef(false);
  useEffect(() => {
    if (!recap) return;
    const key = recap.tank.toOdometer;
    if (!primed.current) {
      primed.current = true;
      lastTank.current = key;
      return;
    }
    if (key !== lastTank.current) {
      lastTank.current = key;
      if (recap.isRecord) playSfx("pow");
    }
  }, [recap]);

  if (!recap) return null;
  const { tank, isRecord, mpgVsAvg, mpgVsLast, cpmVsAvg, ppgVsNational } = recap;

  return (
    <div
      className="relative overflow-hidden rounded-[14px] border mt-4"
      style={{
        background: "linear-gradient(180deg, #0e1420, #0b101a)",
        borderColor: isRecord ? "rgba(245,166,35,.5)" : "var(--color-hairline)",
        boxShadow: "0 14px 34px rgba(0,0,0,.45)",
      }}
    >
      <div
        className="flex items-center gap-[14px] px-[18px] py-[13px] border-b ds2-cell-rule flex-wrap"
        style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}
      >
        <div className="min-w-0">
          <div className="font-forge font-bold text-[20px] leading-none" style={{ letterSpacing: "1.5px" }}>
            THE LAST TANK
          </div>
          <div className="font-condensed text-[11px] text-faint tracking-[.1em] uppercase mt-[3px]">
            closed {formatDate(tank.date) ?? ""}
            {place ? ` · ${place}` : ""}
          </div>
        </div>
        {isRecord ? (
          <span
            className="ml-auto font-forge font-bold uppercase text-sm"
            style={{
              border: "3px solid #f5a623",
              color: "#f5a623",
              borderRadius: 8,
              padding: "2px 10px",
              letterSpacing: 2,
              transform: "rotate(-6deg)",
              animation: "stampSlam 0.4s cubic-bezier(0.2, 1.5, 0.4, 1) both",
            }}
          >
            NEW BEST
          </span>
        ) : mpgVsAvg != null && mpgVsAvg >= 0 ? (
          <span className="ml-auto font-condensed font-bold text-[10.5px] tracking-[.12em] px-[8px] py-[3px] rounded-[4px] text-[#6fd08c] border border-[rgba(111,208,140,.35)] bg-[rgba(111,208,140,.08)]">
            ABOVE YOUR AVERAGE
          </span>
        ) : null}
      </div>
      <div className="px-[18px] py-4">

      <div className="flex items-end gap-2 flex-wrap">
        <span
          className="text-[52px] font-display tracking-[.02em] leading-none"
          style={isRecord ? { color: "#f5a623" } : undefined}
        >
          {tank.mpg.toFixed(2)}
        </span>
        <span className="font-condensed text-[13px] tracking-[.12em] uppercase text-faint mb-1.5">MPG · this tank</span>
        <span className="ml-1.5 text-sm mb-1">
          {mpgVsAvg != null ? (
            <span style={{ color: mpgVsAvg >= 0 ? GOOD : BAD }}>
              {mpgVsAvg >= 0 ? "▲" : "▼"}{" "}
              {signed(mpgVsAvg)} vs your average
            </span>
          ) : (
            <span className="text-faint">your first full tank</span>
          )}
          {mpgVsLast != null && (
            <span className="text-faint"> · {signed(mpgVsLast)} vs last</span>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <Cell
          label="Fuel cost / mile"
          value={`$${recap.costPerMile.toFixed(2)}`}
          sub={
            cpmVsAvg != null ? (
              <span style={{ color: cpmVsAvg <= 0 ? GOOD : BAD }}>
                {cpmVsAvg <= 0 ? "▼" : "▲"}{" "}
                ${Math.abs(cpmVsAvg).toFixed(2)} {cpmVsAvg <= 0 ? "under" : "over"}{" "}
                avg
              </span>
            ) : (
              <span className="text-faint">no average yet</span>
            )
          }
        />
        <Cell
          label="Price / gallon"
          value={dieselPrice(recap.pricePerGallon)}
          sub={
            ppgVsNational != null ? (
              <span style={{ color: ppgVsNational <= 0 ? GOOD : BAD }}>
                ${Math.abs(ppgVsNational).toFixed(2)}{" "}
                {ppgVsNational <= 0 ? "under" : "over"} national
              </span>
            ) : (
              <span className="text-faint">national n/a</span>
            )
          }
        />
        <Cell
          label="This tank"
          value={`${Math.round(tank.miles).toLocaleString("en-US")} mi`}
          sub={
            <span className="text-faint">
              {tank.gallons.toFixed(0)} gal · {money(tank.cost)} spent
            </span>
          }
        />
      </div>

      {recap.streak >= 2 && (
        <div
          className="mt-3 font-condensed font-semibold text-sm tracking-[.04em]"
          style={{ color: "var(--color-amber-hi)" }}
        >
          ▲ {recap.streak} tanks running at or above your average
        </div>
      )}
      </div>
    </div>
  );
};
