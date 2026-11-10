import { Link } from "react-router-dom";
import { Panel } from "@/components/ui/Panel";
import { FetchFailed } from "@/components/integrity/FetchFailed";
import { missingWords } from "@/lib/integrity/require";
import { money } from "@/lib/format";
import type { DepositLine } from "@/lib/metrics/cashBoard";
import type { ProfitRow, YtdSummary, LastFiledMonth } from "@/lib/metrics/profitSummary";
import { dayWords } from "./words";

const LINK = "text-amber-hi hover:text-hot underline-offset-2 hover:underline";
const BIG = "font-condensed font-semibold text-[28px] leading-none tabular-nums mt-1.5";

// BAND 1 · the hero plate's right figure: Next deposit — the cash board's own figure, the words it always printed.
export const DepositFigure = ({
  nextDeposit,
  pipelineFallback,
}: {
  nextDeposit: DepositLine | null;
  pipelineFallback: { amount: number; loads: number; lands: string | null } | null; // before the board loads
}) => (
  <div className="sm:border-l sm:border-white/10 sm:pl-5">
    <p className="ds2-label">Next deposit</p>
    {nextDeposit ? (
      <>
        {nextDeposit.amount != null ? (
          <p className={`${BIG} text-status-positive-text`}>{money(nextDeposit.amount)}</p>
        ) : null}
        <p className="text-[12px] text-faint mt-1.5">
          lands {dayWords(nextDeposit.date)} · statement {dayWords(nextDeposit.statementDate).replace(/^[A-Za-z]+, /, "")} ·{" "}
          {nextDeposit.missing?.length ? (
            <span className="text-amber-hi">{missingWords(nextDeposit.missing)} — set it in ASSUMPTIONS on Cash Flow</span>
          ) : nextDeposit.source === "actual"
            ? "actual, from the feed"
            : nextDeposit.revenueSource === "fallback"
              ? "nothing delivered yet — a planning week, less the advance and deductions"
              : `${nextDeposit.loads} delivered${nextDeposit.inTransit + nextDeposit.booked > 0 ? ` + ${nextDeposit.inTransit + nextDeposit.booked} expected` : ""} at net, less the advance and deductions`}
          {nextDeposit.carriedIn < 0 && <> · {money(nextDeposit.carriedIn)} carried in</>}
          {nextDeposit.carriedOut < 0 && <> · nothing lands, {money(nextDeposit.carriedOut)} carries</>}
        </p>
      </>
    ) : pipelineFallback && pipelineFallback.amount > 0 ? (
      <>
        <p className={`${BIG} text-status-positive-text`}>{money(pipelineFallback.amount)}</p>
        <p className="text-[12px] text-faint mt-1.5">
          {pipelineFallback.lands ? `lands ${pipelineFallback.lands} · ` : ""}
          {pipelineFallback.loads} load{pipelineFallback.loads === 1 ? "" : "s"} · POD in
        </p>
      </>
    ) : (
      <p className="text-[13px] text-faint mt-1.5">nothing waiting — all settled up</p>
    )}
  </div>
);

// BAND 1 · This pay week — gross booked against the weekly target, a plain pace bar.
export const WeekCard = ({
  booked,
  target,
  delivered,
  bookedAhead,
  bookedFor,
  daysLeft,
  projected,
}: {
  booked: number; // targets.weekBooked — gross booked in the pay week
  target: number | null; // targets.gross.weeklyTarget
  delivered: number | null;
  bookedAhead: number | null;
  bookedFor: string | null; // the day word the booked loads are for
  daysLeft: number | null;
  projected: number | null;
}) => {
  const pct = target != null && target > 0 ? Math.min(100, Math.round((booked / target) * 100)) : null;
  return (
    <Panel className="p-4 h-full">
      <p className="ds2-label">This pay week</p>
      <p className={BIG}>
        {money(booked)}
        {target != null && <span className="text-[14px] text-dim font-normal"> of {money(target)}</span>}
      </p>
      <p className="text-[11.5px] uppercase tracking-wider text-faint mt-1">booked · gross</p>
      {pct != null ? (
        <div className="h-[6px] rounded-[3px] bg-well mt-2 overflow-hidden" role="img" aria-label={`${pct}% of the weekly target booked`}>
          <div className="h-full bg-amber" style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <p className="text-[12.5px] text-amber-hi mt-2">
          The weekly target isn’t set —{" "}
          <Link to="/settings" className={LINK}>set the margin goal in Settings ›</Link>
        </p>
      )}
      <p className="text-[12.5px] text-faint mt-1.5">
        {delivered != null && bookedAhead != null
          ? `${delivered} delivered · ${bookedAhead} booked${bookedFor ? ` for ${bookedFor}` : ""}${daysLeft != null ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""}`
          : "no pay week to project yet"}
      </p>
      {projected != null && (
        <p className="text-[12.5px] text-dim mt-0.5">
          projected <b className="text-ink tabular-nums">{money(projected)}</b> gross by the week’s end
        </p>
      )}
    </Panel>
  );
};

const monthName = (k: string): string =>
  new Date(`${k.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });

// BAND 1 · Profit — year to date, from the one P&L lib the Money tab also reads.
export const ProfitCard = ({
  year,
  summary,
  last,
  currentMonthFiled,
  currentMonthName,
  marginGoal,
  loading,
  hasRows,
  fetchFailed,
  retry,
}: {
  year: number;
  summary: YtdSummary | null;
  last: LastFiledMonth | null;
  currentMonthFiled: boolean;
  currentMonthName: string;
  marginGoal: number | null;
  loading: boolean;
  hasRows: boolean;
  fetchFailed: boolean;
  retry: () => void;
}) => {
  const margin = summary?.cashMargin ?? null;
  // Coloured by the goal exactly as the Money tab colours it.
  const tone =
    margin != null && marginGoal != null
      ? margin >= marginGoal
        ? "text-status-positive-text"
        : "text-status-negative-text"
      : "";
  return (
    <Panel className="p-4 h-full">
      <p className="ds2-label">Profit · {year} to date</p>
      {loading ? (
        <p className={`${BIG} text-faint`}>…</p>
      ) : fetchFailed ? (
        <FetchFailed what="the P&L" onRetry={retry} className="mt-2" />
      ) : !hasRows || !summary || summary.months === 0 ? (
        <p className="text-[13px] text-amber-hi mt-1.5">
          No P&amp;L month is filed for {year} —{" "}
          <Link to="/expenses" className={LINK}>upload one on Expenses ›</Link>
        </p>
      ) : (
        <>
          <p className={BIG}>
            ≈ {money(Math.round(summary.trueNet / 100) * 100)}
            <span className="text-[13px] text-dim font-normal"> true net</span>
          </p>
          <p className="text-[12.5px] text-faint mt-1.5">
            {margin != null ? (
              <b className={`tabular-nums ${tone}`}>{Math.round(margin * 100)}%</b>
            ) : null}
            {margin != null ? " after notes · " : ""}on {money(summary.income)} income
          </p>
          {last && (
            <p className="text-[12.5px] text-dim mt-0.5">
              {monthName(last.month)}{" "}
              <b className={`tabular-nums ${last.profit < 0 ? "text-status-negative-text" : "text-ink"}`}>{money(last.profit)}</b> operating
            </p>
          )}
          {!currentMonthFiled && (
            <p className="text-[12.5px] text-faint mt-0.5">{currentMonthName} posts when you file it</p>
          )}
        </>
      )}
    </Panel>
  );
};

export type { ProfitRow };
