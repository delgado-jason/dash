import { useState } from "react";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { scoreLoad, VERDICT_META } from "@/lib/metrics/loadScore";
import { RATE_TIERS } from "@/lib/constants/targets";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const rpm = (n: number | null) => (n != null ? `$${n.toFixed(2)}` : "—");

// Where the load sits on the PASS | MEH | TAKE IT | STEAL bar (0–100%).
const markerPct = (pct: number | null, allIn: number | null, be: number | null): number => {
  if (pct == null || allIn == null || be == null) return 0;
  if (allIn < be) return Math.max(0, Math.min(25, (allIn / be) * 25)); // PASS band
  if (pct < RATE_TIERS.target) return 25 + (pct / RATE_TIERS.target) * 25; // MEH
  if (pct < RATE_TIERS.strong)
    return 50 + ((pct - RATE_TIERS.target) / (RATE_TIERS.strong - RATE_TIERS.target)) * 25; // TAKE
  return 75 + Math.min(1, (pct - RATE_TIERS.strong) / 0.4) * 25; // STEAL
};

const Field = ({
  label,
  value,
  onChange,
  accent,
  suffix,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  accent?: boolean;
  suffix?: string;
  prefix?: string;
}) => (
  <div
    className="flex items-center justify-between rounded-[9px] px-3 py-2.5"
    style={{ background: "#161d2b", border: `1px solid ${accent ? "#85500b" : "#2a3347"}` }}
  >
    <span className="text-xs" style={{ color: accent ? "#f5b03a" : "#9fb0c9" }}>
      {label}
    </span>
    <span className="flex items-baseline gap-1">
      {prefix && <span className="text-xs text-muted-text">{prefix}</span>}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        className="w-24 bg-transparent text-right text-lg outline-none"
        style={{ color: accent ? "#f5b03a" : "#f4f7fb" }}
      />
      {suffix && <span className="text-[11px] text-muted-text">{suffix}</span>}
    </span>
  </div>
);

const ScoreLoadPage = () => {
  const { loads } = useLoads(0);
  const targets = useRateTargets(loads);
  const [rate, setRate] = useState("");
  const [loaded, setLoaded] = useState("");
  const [deadhead, setDeadhead] = useState("");

  const entered = rate !== "" && loaded !== "";
  const score = scoreLoad(
    {
      rate: Number(rate),
      loadedMiles: Number(loaded),
      deadheadMiles: Number(deadhead),
    },
    {
      costPerDrivenMile: targets.basis.costPerTotalMile,
      payTake: targets.basis.payTake,
    },
  );
  const meta = score.verdict ? VERDICT_META[score.verdict] : null;

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div
        className="mx-auto"
        style={{ maxWidth: 400, background: "#10151f", border: "1px solid #2a3347", borderRadius: 16, padding: 18 }}
      >
        <div className="text-[17px] font-semibold uppercase tracking-wide" style={{ color: "#f4f7fb" }}>
          Score a Load
        </div>
        <div className="text-[11px] text-muted-text mt-0.5 mb-3.5">Punch it in at the phone.</div>

        <div className="flex flex-col gap-2.5">
          <Field label="Rate" value={rate} onChange={setRate} prefix="$" />
          <div className="flex gap-2.5">
            <div className="flex-1">
              <Field label="Loaded" value={loaded} onChange={setLoaded} suffix="mi" />
            </div>
            <div className="flex-1">
              <Field label="Deadhead" value={deadhead} onChange={setDeadhead} accent suffix="mi" />
            </div>
          </div>
        </div>

        {!targets.ready ? (
          <p className="text-xs text-muted-text mt-4 text-center">
            Upload a P&amp;L on the Expenses page to calibrate your break-even, then loads can be scored.
          </p>
        ) : !entered ? (
          <p className="text-xs text-muted-text mt-6 text-center">
            Enter a rate and loaded miles to get a verdict.
          </p>
        ) : (
          <>
            <div className="text-center mt-4 mb-1.5">
              <div
                className="inline-block font-bold"
                style={{
                  transform: "rotate(-7deg)",
                  border: `4px solid ${meta!.fg}`,
                  color: meta!.fg,
                  borderRadius: 12,
                  padding: "6px 22px",
                  fontSize: 34,
                  letterSpacing: 3,
                  fontFamily: "Georgia, serif",
                }}
              >
                {meta!.label}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-3.5">
              <div className="rounded-[9px] py-2 text-center" style={{ background: "#141b28" }}>
                <div className="text-[9px] text-muted-text tracking-wide">ALL-IN / MI</div>
                <div className="text-lg font-semibold" style={{ color: meta!.fg }}>{rpm(score.allInRpm)}</div>
                <div className="text-[9px]" style={{ color: "#5f6b80" }}>{score.drivenMiles.toLocaleString("en-US")} mi driven</div>
              </div>
              <div className="rounded-[9px] py-2 text-center" style={{ background: "#141b28" }}>
                <div className="text-[9px] text-muted-text tracking-wide">BREAK-EVEN</div>
                <div className="text-lg font-semibold" style={{ color: "#cdd8e8" }}>{rpm(score.breakevenRpm)}</div>
                <div className="text-[9px]" style={{ color: "#5f6b80" }}>
                  {score.pctOverBreakeven != null
                    ? `${score.pctOverBreakeven >= 0 ? "+" : ""}${Math.round(score.pctOverBreakeven * 100)}%`
                    : ""}
                </div>
              </div>
              <div className="rounded-[9px] py-2 text-center" style={{ background: "#141b28" }}>
                <div className="text-[9px] text-muted-text tracking-wide">PROFIT</div>
                <div className="text-lg font-semibold" style={{ color: (score.profit ?? 0) >= 0 ? "#4ade80" : "#f87171" }}>
                  {score.profit != null ? money(score.profit) : "—"}
                </div>
                <div className="text-[9px]" style={{ color: "#5f6b80" }}>after the cut</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-[9px] text-muted-text tracking-wide mb-1.5">WHERE IT LANDS</div>
              <div className="flex rounded-[5px] overflow-hidden relative" style={{ height: 10 }}>
                <div style={{ flex: 1, background: "#3a1a1a" }} />
                <div style={{ flex: 1, background: "#3a2a0a" }} />
                <div style={{ flex: 1, background: "#1a3a2a" }} />
                <div style={{ flex: 1, background: "#3a300a" }} />
                <div
                  style={{
                    position: "absolute",
                    left: `${markerPct(score.pctOverBreakeven, score.allInRpm, score.breakevenRpm)}%`,
                    top: -3,
                    width: 2,
                    height: 16,
                    background: "#f4f7fb",
                  }}
                />
              </div>
              <div className="flex justify-between text-[8.5px] mt-1">
                <span style={{ color: "#f87171" }}>PASS</span>
                <span style={{ color: "#e8940a" }}>MEH</span>
                <span style={{ color: "#4ade80" }}>TAKE IT</span>
                <span style={{ color: "#fbbf24" }}>STEAL</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScoreLoadPage;
