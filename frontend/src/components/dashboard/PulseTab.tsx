import { useMemo } from "react";
import type { Load } from "@/types/load";
import type { Trip } from "@/types/trip";
import { getWeekGrossEarned } from "@/lib/metrics/rateTargets";
import {
  getRevenueMTD,
  getMonthlyDeadhead,
  getLoadsMonthly,
  getUpcomingLoads,
} from "@/lib/metrics/dashboard";
import { loadRevenue } from "@/lib/metrics/loads";
import { getQuarterPace } from "@/lib/metrics/quarterPace";
import { AlertBanners } from "@/components/dashboard/AlertBanners";
import type { Alert } from "@/types/alert";
import { GrindMeter } from "@/components/dashboard/GrindMeter";
import { WhatsNext } from "@/components/dashboard/WhatsNext";
import { money, rpm as fmtRpm } from "@/lib/format";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Targets = any; // the useRateTargets shape (weekEarned/weekBooked/gross/bookingLadder/grossRate)

const C = { background: "#0f1622", border: "1px solid #26304a" } as const;
const TILE = { background: "#121a27", border: "1px solid #26304a" } as const;

const Tile = ({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) => (
  <div className="rounded-xl px-3.5 py-3" style={TILE}>
    <p className="text-[9.5px] uppercase tracking-wide text-muted-text">{label}</p>
    <p className="text-base font-bold mt-0.5 leading-tight" style={{ color }}>{value}</p>
    <p className="text-[9.5px] text-muted-text mt-0.5">{sub}</p>
  </div>
);

const PACE = {
  beat: { text: "on track to beat", color: "#4ade80", glyph: "▲" },
  behind: { text: "on track to finish under", color: "#f87171", glyph: "▼" },
  even: { text: "on pace with", color: "#f5a623", glyph: "—" },
  early: { text: "too early to call vs", color: "#9fb0c9", glyph: "·" },
  "no-prior": { text: "first quarter — no", color: "#9fb0c9", glyph: "·" },
} as const;

export const PulseTab = ({
  loads,
  trips,
  targets,
  alerts,
}: {
  loads: Load[];
  trips: Trip[];
  targets: Targets;
  alerts: Alert[];
}) => {
  const now = useMemo(() => new Date(), []);

  const earned = targets.weekEarned ?? 0;
  const committed = targets.weekBooked ?? 0;
  const weeklyTarget: number | null = targets.gross?.weeklyTarget ?? null;
  const progress = weeklyTarget && weeklyTarget > 0 ? Math.min(1, earned / weeklyTarget) : null;

  const mtd = getRevenueMTD(loads);
  const deadhead = getMonthlyDeadhead(loads, trips).thisMonth;
  const loadsM = getLoadsMonthly(loads);
  const upcoming = getUpcomingLoads(loads);
  const pace = useMemo(() => getQuarterPace(loads, now), [loads, now]);

  // Settlement pipeline: delivered but not yet paid = landing on the next
  // settlement(s). No aging — POD-in (delivered) is the gate, and it clears weekly.
  const pipeline = useMemo(
    () =>
      loads
        .filter((l) => l.load_status === "delivered" && l.payment_status !== "paid")
        .reduce((s, l) => s + loadRevenue(l), 0),
    [loads],
  );

  // Last 8 pay-weeks of gross earned, anchored to the configured week start.
  const weeks = useMemo(() => {
    const anchor: Date = targets.weekStart ? new Date(targets.weekStart) : now;
    const out: { earned: number; now: boolean }[] = [];
    for (let i = 7; i >= 0; i--) {
      const s = new Date(anchor);
      s.setUTCDate(anchor.getUTCDate() - i * 7);
      const e = new Date(s);
      e.setUTCDate(s.getUTCDate() + 7);
      out.push({ earned: getWeekGrossEarned(loads, s, e), now: i === 0 });
    }
    return out;
  }, [loads, targets.weekStart, now]);
  const weekMax = Math.max(weeklyTarget ?? 0, ...weeks.map((w) => w.earned), 1);

  const ladder = targets.bookingLadder ?? {};
  const cur: number | null = targets.grossRate ?? null;
  const gaugeMax = Math.max(ladder.strong ?? 0, cur ?? 0, ladder.target ?? 0) * 1.15 || 1;
  const pos = (v: number | null | undefined) => (v == null ? 0 : Math.min(100, (v / gaugeMax) * 100));
  const overFloor = cur != null && ladder.walkAway != null ? cur - ladder.walkAway : null;

  const paceMeta = PACE[pace.verdict];

  return (
    <div>
      <AlertBanners alerts={alerts} />

      {/* hero — the pay week */}
      <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-4 rounded-xl p-4 mt-3 mb-3" style={C}>
        <div>
          <p className="text-[10.5px] uppercase tracking-wide text-muted-text">This pay week</p>
          <p className="text-[32px] font-extrabold leading-none mt-1">
            {money(earned)} <span className="text-sm text-muted-text font-semibold">earned</span>
          </p>
          {progress != null && (
            <div className="h-2 rounded mt-2.5 mb-1.5 overflow-hidden" style={{ background: "#0b111c", border: "1px solid #26304a" }}>
              <div className="h-full rounded" style={{ width: `${progress * 100}%`, background: "#4ade80" }} />
            </div>
          )}
          <p className="text-[11.5px] text-muted-text">
            {progress != null && weeklyTarget ? (
              <><b className="text-light">{Math.round(progress * 100)}%</b> of your <b className="text-light">{money(weeklyTarget)}</b> weekly target · </>
            ) : null}
            <b style={{ color: "#4ade80" }}>{money(committed)}</b> committed & booked ahead
          </p>
          <p className="text-[11.5px] text-muted-text mt-1.5">
            Landing on settlement: <b style={{ color: "#4ade80" }}>{money(pipeline)}</b> (delivered, POD in)
          </p>
        </div>
        <div className="md:border-l md:pl-4 flex flex-col justify-center gap-2.5" style={{ borderColor: "#26304a" }}>
          <div>
            <p className="text-[18px] font-extrabold leading-none" style={{ color: overFloor != null && overFloor >= 0 ? "#4ade80" : undefined }}>
              {cur != null ? `${fmtRpm(cur)}/mi` : "—"}
            </p>
            <p className="text-[9.5px] uppercase tracking-wide text-muted-text">
              gross rate{overFloor != null ? ` · ${overFloor >= 0 ? "+" : "−"}${fmtRpm(Math.abs(overFloor))} vs floor` : ""}
            </p>
          </div>
          <div>
            <p className="text-[18px] font-extrabold leading-none">{money(mtd)}</p>
            <p className="text-[9.5px] uppercase tracking-wide text-muted-text">earned month-to-date</p>
          </div>
          <p className="text-[11px] font-bold" style={{ color: paceMeta.color }}>
            {paceMeta.glyph} {pace.label} {paceMeta.text} {pace.prevLabel}
          </p>
        </div>
      </div>

      {/* vital signs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-3">
        <Tile label="Loads · MTD" value={String(loadsM.thisMonth)} sub={`last month ${loadsM.lastMonth}`} />
        <Tile label="Deadhead" value={deadhead != null ? `${Math.round(deadhead * 100)}%` : "—"} sub="odometer-true" color={deadhead != null && deadhead <= 0.2 ? "#4ade80" : "#f5a623"} />
        <Tile label="Avg net $/mi" value={targets.rollingRpm != null ? fmtRpm(targets.rollingRpm) : "—"} sub={targets.basis?.breakEvenRpm != null ? `break-even ${fmtRpm(targets.basis.breakEvenRpm)}` : "3-mo blended"} />
        <Tile label="Pipeline" value={money(pipeline)} sub="delivered, not yet settled" />
        <Tile label="Earned · MTD" value={money(mtd)} sub="gross delivered" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-3 mb-3">
        {/* weekly earnings */}
        <div className="rounded-xl p-3.5" style={C}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2 flex justify-between">
            Weekly earnings <span className="normal-case tracking-normal">last 8 weeks · gross</span>
          </h3>
          <svg viewBox="0 0 620 150" className="w-full">
            {weeklyTarget && (
              <>
                <line x1="0" y1={140 - (weeklyTarget / weekMax) * 120} x2="620" y2={140 - (weeklyTarget / weekMax) * 120} stroke="#4ade80" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />
                <text x="616" y={140 - (weeklyTarget / weekMax) * 120 - 4} textAnchor="end" fontSize={9} fill="#4ade80">target {money(weeklyTarget)}</text>
              </>
            )}
            {weeks.map((w, i) => {
              const h = Math.max(2, (w.earned / weekMax) * 120);
              const x = 10 + i * 76;
              const hit = weeklyTarget ? w.earned >= weeklyTarget : false;
              return (
                <g key={i}>
                  <rect x={x} y={140 - h} width={56} height={h} rx={4} fill={w.now ? "#f5b03a" : hit ? "#e8940a" : "#2a3347"} />
                  <text x={x + 28} y={148} textAnchor="middle" fontSize={8.5} fill={w.now ? "#f5b03a" : "#5b6577"}>
                    {w.now ? "now" : `$${(w.earned / 1000).toFixed(1)}`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* rate vs floor gauge */}
        <div className="rounded-xl p-3.5" style={C}>
          <h3 className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-4">Rate vs your floor</h3>
          <div className="relative h-6 rounded-md" style={{ background: "linear-gradient(90deg,#3a1a1a,#3a2a0a 40%,#12261a)", border: "1px solid #26304a" }}>
            {(["walkAway", "target", "strong"] as const).map((k, i) =>
              ladder[k] != null ? (
                <div key={k} className="absolute -top-1 -bottom-1" style={{ left: `${pos(ladder[k])}%`, width: 2, background: ["#a04a2a", "#a0862a", "#2f7d55"][i] }} />
              ) : null,
            )}
            {cur != null && (
              <>
                <div className="absolute -top-2 -bottom-2" style={{ left: `${pos(cur)}%`, width: 3, background: "#fff", borderRadius: 2 }} />
                <div className="absolute text-[11px] font-extrabold" style={{ left: `${pos(cur)}%`, top: -22, transform: "translateX(-50%)", color: "#4ade80" }}>{fmtRpm(cur)}</div>
              </>
            )}
          </div>
          <div className="flex justify-between text-[9px] text-muted-text mt-1.5">
            <span>floor {ladder.walkAway != null ? fmtRpm(ladder.walkAway) : "—"}</span>
            <span>target {ladder.target != null ? fmtRpm(ladder.target) : "—"}</span>
            <span>strong {ladder.strong != null ? fmtRpm(ladder.strong) : "—"}</span>
          </div>
          <p className="text-[11px] text-muted-text mt-3">
            {overFloor != null ? (
              overFloor >= 0 ? (
                <>Booking <b style={{ color: "#4ade80" }}>{fmtRpm(overFloor)}/mi over break-even</b> — one soft lane pulls this down fast.</>
              ) : (
                <>Booking <b style={{ color: "#f87171" }}>{fmtRpm(Math.abs(overFloor))}/mi under break-even</b> — you're losing money at this rate.</>
              )
            ) : (
              "Set your cost basis to see where your rate lands."
            )}
          </p>
        </div>
      </div>

      {/* what's next + the grind */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3">
        <div className="rounded-xl p-4" style={C}>
          <p className="text-[11px] uppercase tracking-wide text-muted-text font-bold mb-2">What's next · booked</p>
          <WhatsNext loads={upcoming} />
        </div>
        <GrindMeter loads={loads} />
      </div>
    </div>
  );
};
