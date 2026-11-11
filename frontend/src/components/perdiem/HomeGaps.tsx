// Stretches that look like home time but were never marked.
//
// Home days only began being marked in July 2026, so every month before that
// reads as if the truck was available every single day. That makes utilization
// flatter than it was — miles per day out came out at 283 against a real 322 —
// and any comparison crossing July is reading two different definitions of a
// working day.
//
// IT PROPOSES; IT NEVER WRITES ON ITS OWN. Some of these gaps have a `home`
// trip in them and are near-certain. Others have nothing but a date range: a
// week like that could as easily have been a breakdown, a soft market or a
// load that fell through. So the evidence is shown, the strong cases are said
// to be strong, and the marking is a click.
import { useState } from "react";
import { Panel } from "@/components/ui/Panel";
import type { HomeGap } from "@/lib/metrics/homeGaps";

const md = (key: string): string =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "2-digit",
    timeZone: "UTC",
  });

interface Props {
  gaps: HomeGap[];
  /** Marks every unmarked day of one gap as home. */
  onMark: (days: string[]) => Promise<void>;
}

export const HomeGaps = ({ gaps, onMark }: Props) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (gaps.length === 0) return null;

  const strong = gaps.filter((g) => g.homeTrip).length;

  return (
    <Panel className="p-4 mt-4">
      <p className="ds2-label">
        Gaps that look like home time
        <span className="ml-2 normal-case tracking-normal text-faint font-normal">
          {gaps.length} unmarked {gaps.length === 1 ? "stretch" : "stretches"}
          {strong > 0 && ` · ${strong} with a home trip logged`}
        </span>
      </p>

      <p className="font-condensed text-[13px] text-dim mt-1.5 leading-snug">
        The truck stood still between these runs. Days you were home are left out
        of your pace, so an unmarked week makes the driving look slower than it
        was — <b className="text-ink">nothing here is written until you say so.</b>
      </p>

      <div className="mt-2.5 divide-y ds2-cell-rule">
        {gaps.map((g) => (
          <div key={g.from} className="flex items-baseline gap-3 flex-wrap py-[9px]">
            <span className="font-condensed text-[13.5px] min-w-[150px]">
              {md(g.from)} – {md(g.to)}
              <span className="text-faint"> · {g.days} days</span>
            </span>

            <span className="font-condensed text-[13px] text-dim">
              {g.droppedAt ?? "—"}
              <span className="text-faint"> → </span>
              {g.nextPickup ?? "—"}
            </span>

            {g.homeTrip ? (
              <span
                className="font-condensed font-semibold text-[11.5px] tracking-[.1em] uppercase px-2 py-[2px] rounded-[6px]"
                style={{
                  color: "var(--color-status-positive-text)",
                  background: "var(--color-status-positive-bg)",
                }}
              >
                home trip logged
              </span>
            ) : (
              <span className="font-condensed text-[12.5px] text-faint">
                no trip logged — only the dates
              </span>
            )}

            {g.alreadyMarked > 0 && (
              <span className="font-condensed text-[12.5px] text-faint">
                {g.alreadyMarked} already marked
              </span>
            )}

            <span className="ml-auto shrink-0">
              <button
                type="button"
                disabled={busy === g.from}
                onClick={() => {
                  setBusy(g.from);
                  setFailed(false);
                  onMark(g.unmarked)
                    .catch(() => setFailed(true))
                    .finally(() => setBusy(null));
                }}
                className="font-condensed font-bold text-[11.5px] tracking-[.1em] uppercase px-3 h-8 rounded-[9px] bg-amber text-on-amber hover:brightness-105 whitespace-nowrap disabled:opacity-40"
              >
                {busy === g.from ? "…" : `Mark ${g.unmarked.length} home`}
              </button>
            </span>
          </div>
        ))}
      </div>

      {failed && (
        <p
          className="font-condensed text-[12.5px] mt-2"
          style={{ color: "var(--color-status-negative-text)" }}
          role="alert"
        >
          That did not save. Nothing was marked.
        </p>
      )}

      <p className="font-condensed text-[12px] text-faint mt-2.5 leading-snug">
        A gap is not proof. A week like this can be a breakdown, a soft market or
        a load that fell through — all of which are days the truck was available
        and should stay in your pace. Mark only the ones you remember being home.
      </p>
    </Panel>
  );
};
