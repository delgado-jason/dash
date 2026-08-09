import { useEffect, useRef, type ReactNode } from "react";
import { TrendingUp, TrendingDown, Trophy, Flame } from "lucide-react";
import type { TankRecap } from "@/lib/metrics/fuelEconomy";
import { Panel } from "@/components/ui/Panel";
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
  <div className="bg-plate rounded-lg p-3">
    <p className="text-[11px] uppercase tracking-wide text-muted-text">{label}</p>
    <p className="text-xl font-semibold mt-0.5">{value}</p>
    <p className="text-xs mt-0.5">{sub}</p>
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
    <Panel
      className="p-5 mb-4"
      style={isRecord ? { borderColor: "#5a4410" } : undefined}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-[11px] tracking-[1.5px] text-muted-text uppercase">
          Latest tank
        </span>
        <span className="text-xs text-muted-text">
          · {formatDate(tank.date) ?? ""}
          {place ? ` · ${place}` : ""}
        </span>
        {isRecord && (
          <span
            className="ml-auto inline-flex items-center gap-1 font-forge font-bold uppercase text-sm"
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
            <Trophy size={14} /> New best
          </span>
        )}
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <span
          className="text-[42px] font-condensed leading-none"
          style={isRecord ? { color: "#f5a623" } : undefined}
        >
          {tank.mpg.toFixed(2)}
        </span>
        <span className="text-[15px] text-muted-text mb-1.5">MPG</span>
        <span className="ml-1.5 text-sm mb-1">
          {mpgVsAvg != null ? (
            <span style={{ color: mpgVsAvg >= 0 ? GOOD : BAD }}>
              {mpgVsAvg >= 0 ? (
                <TrendingUp size={14} className="inline -mt-0.5" />
              ) : (
                <TrendingDown size={14} className="inline -mt-0.5" />
              )}{" "}
              {signed(mpgVsAvg)} vs your average
            </span>
          ) : (
            <span className="text-muted-text">your first full tank</span>
          )}
          {mpgVsLast != null && (
            <span className="text-muted-text"> · {signed(mpgVsLast)} vs last</span>
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
                {cpmVsAvg <= 0 ? (
                  <TrendingDown size={13} className="inline -mt-0.5" />
                ) : (
                  <TrendingUp size={13} className="inline -mt-0.5" />
                )}{" "}
                ${Math.abs(cpmVsAvg).toFixed(2)} {cpmVsAvg <= 0 ? "under" : "over"}{" "}
                avg
              </span>
            ) : (
              <span className="text-muted-text">no average yet</span>
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
              <span className="text-muted-text">national n/a</span>
            )
          }
        />
        <Cell
          label="This tank"
          value={`${Math.round(tank.miles).toLocaleString("en-US")} mi`}
          sub={
            <span className="text-muted-text">
              {tank.gallons.toFixed(0)} gal · {money(tank.cost)} spent
            </span>
          }
        />
      </div>

      {recap.streak >= 2 && (
        <div
          className="mt-3 flex items-center gap-1.5 text-sm"
          style={{ color: "#f5c37a" }}
        >
          <Flame size={15} /> {recap.streak} tanks running at or above your
          average
        </div>
      )}
    </Panel>
  );
};
