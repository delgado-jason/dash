// Forecast against actual.
//
// Phase 2 of "Does the forecast hold?". The honest part of this panel is the
// waiting: it is empty for a week, thin for a month, and genuinely worth
// reading around week six. Saying so is better than looking authoritative on
// two samples.
//
// What it will NOT do is feed the measured bias back into the projection.
// Jason's twelve statements swing $0 to $8,560, and two of his last four pay
// weeks had no fills at all because he was home. A bias computed across a
// stretch like that mostly describes how many home weeks fell inside the
// window — and it would correct hardest right after a slow month, which is
// exactly when the forecast needs to be honest rather than gloomy. The record
// is step one; step three waits for evidence this panel will itself provide.
import { useMemo } from "react";
import type { CashCheck } from "@/lib/metrics/cashBoard";
import { scoreForecasts, ENOUGH, type ForecastRecord } from "@/lib/metrics/forecastScore";
import { money } from "@/lib/format";
import { Panel } from "@/components/ui/Panel";

const md = (key: string): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });

interface Props {
  records: ForecastRecord[];
  checks: CashCheck[];
  today: string;
  /** When the open period closes — what the empty state counts down to. */
  openPeriodEnd: string | null;
  /** A projection could not be written down. Said out loud, because this
      panel is only worth reading if the captures are happening. */
  captureFailed?: boolean;
}

export const ForecastScore = ({ records, checks, today, openPeriodEnd, captureFailed }: Props) => {
  const score = useMemo(() => scoreForecasts(records, checks, today), [records, checks, today]);

  const tone = (n: number): string =>
    n >= 0 ? "var(--color-status-positive-text)" : "var(--color-status-negative-text)";

  return (
    <Panel className="p-4 mt-4">
      <p className="ds2-label">
        Forecast against actual
        <span className="ml-2 normal-case tracking-normal text-faint font-normal">
          {score.periods.length === 0
            ? "nothing to score yet"
            : score.scored === 0
              ? `${score.periods.length} closed · none scorable yet`
              : `the last ${score.scored} closed ${score.scored === 1 ? "period" : "periods"}`}
        </span>
      </p>

      {/* The empty state is about having no RECORD, not about having no score.
          A period that closed and could not be scored is a different thing and
          has to say so: it is the one case the reader can act on, by keying
          the balance. Branching on `scored` here hid those rows entirely. */}
      {score.periods.length === 0 ? (
        <p className="font-condensed text-[13.5px] text-faint mt-2 leading-snug">
          Nothing to score yet. The board writes down what it projects for a
          period while it is still a projection, then compares it to what
          landed.
          {openPeriodEnd && (
            <> The first miss lands when this period closes — <b className="text-dim">{md(openPeriodEnd)}</b>.</>
          )}
        </p>
      ) : (
        <>
          {score.averageMiss == null ? (
            <p className="font-condensed text-[13.5px] text-dim mt-1.5 leading-snug">
              A period has closed with a projection on it, but there is nothing
              to score it against yet. Key the balance for the day it closed —
              the Friday reading or an{" "}
              <span className="text-light">OPS NOW</span> check — and it scores
              itself.
            </p>
          ) : (
            <>
              <p className="font-condensed font-semibold tabular-nums text-[26px] mt-1"
                 style={{ color: tone(score.averageMiss) }}>
                {`${score.averageMiss >= 0 ? "+" : "−"}${money(Math.abs(score.averageMiss))}`}
                <span className="text-[15px] text-faint"> average miss</span>
              </p>
              <p className="font-condensed text-[12.5px] text-faint mt-0.5">
                {score.averagePct != null && (
                  <>
                    the forecast has run{" "}
                    <b className="text-dim">
                      {Math.abs(Math.round(score.averagePct * 100))}%{" "}
                      {score.averagePct >= 0 ? "low" : "high"}
                    </b>{" "}
                    on the ending ·{" "}
                  </>
                )}
                a positive miss means the board was pessimistic
              </p>
            </>
          )}

          <div className="mt-2.5 divide-y ds2-cell-rule">
            {score.periods.map((p) => (
              <div key={p.start} className="flex items-baseline justify-between gap-3 py-[7px]">
                <span className="font-condensed text-[13.5px] text-dim">
                  {md(p.start)} – {md(p.end)}
                  <span className="text-faint"> · taken {p.daysBefore}d before it closed</span>
                </span>
                {p.unscored ? (
                  <span className="font-condensed text-[12.5px] text-faint">
                    {p.unscored === "no-reading"
                      ? "no balance typed near the close — nothing to score it against"
                      : "no forecast was captured"}
                  </span>
                ) : (
                  <span className="font-condensed text-[13.5px] tabular-nums">
                    <span className="text-faint">{money(p.forecast)} → </span>
                    <b className="text-ink">{money(p.actual)}</b>{" "}
                    <b style={{ color: tone(p.miss!) }}>
                      {p.miss! >= 0 ? "+" : "−"}{money(Math.abs(p.miss!))}
                    </b>
                  </span>
                )}
              </div>
            ))}
          </div>

          {score.thin && (
            <p className="font-condensed text-[12.5px] text-faint mt-2.5 leading-snug">
              {score.scored} of {ENOUGH} periods. An average on this few is a
              description of a month, not a pattern — it is shown because
              hiding it would be worse, not because it is settled yet.
            </p>
          )}
        </>
      )}

      {captureFailed && (
        <p
          className="font-condensed text-[12.5px] mt-2"
          style={{ color: "var(--color-status-negative-text)" }}
          role="alert"
        >
          This period's projection could not be written down — it will not be
          scorable once the period closes.
        </p>
      )}

      <p className="font-condensed text-[12px] text-faint mt-2.5 leading-snug">
        Actuals are never stored — they are read live from your Ops checks, so a
        corrected balance re-scores the history instead of freezing a wrong
        answer into it. The measured bias does not feed back into the forecast:
        across weeks that swing from nothing to a full load, that would chase
        noise and call it learning.
      </p>
    </Panel>
  );
};
