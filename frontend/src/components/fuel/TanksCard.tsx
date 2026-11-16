import { useState } from "react";
import type { FuelStats, TankRecap } from "@/lib/metrics/fuelEconomy";
import { lastTankSentence } from "@/lib/metrics/fuelWords";
import { MpgChart } from "./MpgChart";
import { PartHeader } from "./PartHeader";

const FOLD = 12;

// Part 02 — THE TANKS. The MPG line over the closed tanks with the lifetime
// drawn across them, folded to the last twelve with "all" behind a door, and
// the last tank as one sentence with the figures the scorecard used to carry
// (the Fuel page sheet, call 1). No stamp, no streak.
export const TanksCard = ({
  stats,
  recap,
  place,
  national,
}: {
  stats: FuelStats;
  recap: TankRecap | null;
  place: string | null;
  national: { month: string; value: number }[];
}) => {
  const [all, setAll] = useState(false);
  const w = stats.windows;
  const shown = all || w.length <= FOLD ? w : w.slice(-FOLD);
  return (
    <div className="ds2-board overflow-hidden mt-4">
      <PartHeader
        n="02"
        title="THE TANKS"
        sub={
          w.length === 0 ? (
            "no full tank closed yet"
          ) : (
            <>
              {w.length} closed{stats.avgMpg != null ? ` · ${stats.avgMpg.toFixed(2)} MPG lifetime` : ""}
              {stats.mpg30 != null ? ` · ${stats.mpg30.toFixed(2)} last 30 days` : ""}
              {stats.bestMpg != null ? ` · best ${stats.bestMpg.toFixed(2)}` : ""}
              {stats.worstMpg != null ? ` · worst ${stats.worstMpg.toFixed(2)}` : ""}
            </>
          )
        }
      />
      <div className="px-4 pt-3">
        <MpgChart windows={shown} avgMpg={stats.avgMpg} />
        {w.length > 0 && (
          <p className="font-condensed text-[12px] text-faint mt-1">
            one point per closed tank{stats.avgMpg != null ? `, the lifetime ${stats.avgMpg.toFixed(2)} drawn across them` : ""}
            {w.length > FOLD && (
              <>
                {" · "}
                {all ? (
                  <>
                    all {w.length} tanks ·{" "}
                    <button type="button" className="text-amber-hi hover:text-hot underline-offset-2 hover:underline" onClick={() => setAll(false)}>
                      the last twelve
                    </button>
                  </>
                ) : (
                  <>
                    the last twelve of {w.length} ·{" "}
                    <button type="button" className="text-amber-hi hover:text-hot underline-offset-2 hover:underline" onClick={() => setAll(true)}>
                      all
                    </button>
                  </>
                )}
              </>
            )}
          </p>
        )}
      </div>
      <p className="font-condensed text-[14.5px] text-ink leading-snug px-4 py-3 border-t ds2-cell-rule mt-3" data-testid="last-tank">
        {lastTankSentence(recap, place, stats, national)}
      </p>
    </div>
  );
};
