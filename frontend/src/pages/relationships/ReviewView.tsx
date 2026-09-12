import { Fragment, useMemo, useState } from "react";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { money } from "@/lib/format";
import { buildAgentScorecards } from "@/lib/metrics/agentScorecard";
import { reviewWindow, defaultReviewMonth, buildReview, reviewReportText, type Move } from "@/lib/metrics/monthlyReview";
import { copyText } from "@/lib/clipboard";
import { GhostButton } from "@/components/relationships/primitives";
import { nameOf } from "@/lib/relationships/nameOf";
import { useRelationships } from "./context";

// REVIEW — in PR1 the existing monthly-review board, moved as-is. PR4
// rebuilds it on REL-01 §5H: re-tier suggestions with approve / hold, the
// cooling list, the milestone log, the cap audit, the month sign-off.

const pct0 = (n: number): string => `${Math.round(n * 100)}%`;

const MOVE_META: Record<Move, { label: (r: { tier: number }) => string; tone: PillTone }> = {
  up: { label: (r) => `▲ consider T${Math.max(1, r.tier - 1)}`, tone: "good" },
  down: { label: (r) => `▼ consider T${Math.min(3, r.tier + 1)}`, tone: "bad" },
  hold: { label: () => "hold", tone: "neutral" },
  thin: { label: () => "thin — no verdict", tone: "info" },
};

const ReviewView = () => {
  const { agents, loads, contacts, targets, now, openAgent } = useRelationships();
  const nowKey = now.toISOString().slice(0, 10);

  const scorecards = useMemo(() => buildAgentScorecards(agents, loads, now), [agents, loads, now]);
  const [reviewMonth, setReviewMonth] = useState(() => defaultReviewMonth(new Date()));
  const win = useMemo(() => reviewWindow(reviewMonth, now), [reviewMonth, now]);
  const reviewRows = useMemo(() => {
    const dataTiers = new Map([...scorecards].map(([id, sc]) => [id, sc.tier]));
    return buildReview(agents, loads, contacts, dataTiers, targets.basis.breakEvenRpm, targets.tiers, win, now);
  }, [agents, loads, contacts, scorecards, targets, win, now]);

  const stepMonth = (d: number) => {
    const [y, m] = reviewMonth.split("-").map(Number);
    const nx = new Date(Date.UTC(y, m - 1 + d, 1));
    const nxKey = nx.toISOString().slice(0, 7);
    // Never step past the CURRENT month — a wholly-future window is a
    // phantom that clamps into a duplicate of today's view.
    if (nxKey <= nowKey.slice(0, 7)) setReviewMonth(nxKey);
  };

  return (
    <div className="ds2-board mt-4 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule flex-wrap" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
        <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>THE MONTHLY REVIEW</span>
        <span className="font-display text-[16px] tracking-[.05em] flex items-center gap-2">
          <button className="text-faint hover:text-ink" onClick={() => stepMonth(-1)} aria-label="previous window">‹</button>
          {win.label}
          <button className="text-faint hover:text-ink" onClick={() => stepMonth(1)} aria-label="next window">›</button>
        </span>
        <span className="font-condensed text-[11px] text-faint">trailing 90 days · reviewed monthly</span>
        <GhostButton size="sm" className="ml-auto" onClick={() => copyText(reviewReportText(reviewRows, win))}>
          Copy report
        </GhostButton>
      </div>
      {reviewRows.length === 0 ? (
        <p className="text-xs text-muted-text px-4 py-6">no activity in this window yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums font-condensed" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-[10.5px] tracking-[.1em] uppercase text-faint">
                {["Agent", "Loads · 90d", "Net revenue", "Net $/mi", "Rate", "Inbound", "Last load", "Days touched / in", "Move"].map((h, i) => (
                  <th key={h} className={`${i === 0 ? "text-left" : "text-right"} px-3 py-2 border-b border-hairline whitespace-nowrap`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviewRows.map((r, i) => {
                const sep = i === 0 || reviewRows[i - 1].tier !== r.tier;
                const meta = MOVE_META[r.move];
                const recTone =
                  r.lastLoadDays == null ? "var(--color-faint)"
                  : r.lastLoadDays > 60 ? "var(--color-status-negative-text)"
                  : r.lastLoadDays > 30 ? "#f5c37a"
                  : "var(--color-ink)";
                const gradeTone =
                  r.rateGrade === "strong" ? "var(--color-status-positive-text)"
                  : r.rateGrade === "target" ? "var(--color-amber-hi)"
                  : r.rateGrade === "minimum" ? "var(--color-dim)"
                  : r.rateGrade === "below" ? "var(--color-status-negative-text)"
                  : "var(--color-faint)";
                return (
                  <Fragment key={r.agent.agent_id}>
                    {sep && (
                      <tr>
                        <td colSpan={9} className="text-left px-3 py-1.5 border-b border-hairline-lo font-display text-[13px] tracking-[.08em] text-amber-hi" style={{ background: "rgba(232,148,10,.05)" }}>
                          {r.tier === 3 ? "TIER 3 · PROSPECTS" : `TIER ${r.tier}`}
                        </td>
                      </tr>
                    )}
                    <tr>
                      <td className="text-left px-3 py-2 border-b border-hairline-lo">
                        <button className="hover:underline underline-offset-4 font-semibold" onClick={() => openAgent(r.agent.agent_id)}>
                          {nameOf(r.agent)}
                        </button>
                      </td>
                      <td className="text-right px-3 py-2 border-b border-hairline-lo">{r.loads90}</td>
                      <td className="text-right px-3 py-2 border-b border-hairline-lo">{money(r.netRevenue)}</td>
                      <td className="text-right px-3 py-2 border-b border-hairline-lo">{r.netRpm != null ? `$${r.netRpm.toFixed(2)}` : "—"}</td>
                      <td className="text-right px-3 py-2 border-b border-hairline-lo" style={{ color: gradeTone }}>{r.rateGrade ?? "—"}</td>
                      <td className="text-right px-3 py-2 border-b border-hairline-lo">{r.inbound != null ? pct0(r.inbound) : "—"}</td>
                      <td className="text-right px-3 py-2 border-b border-hairline-lo" style={{ color: recTone }}>{r.lastLoadDays != null ? `${r.lastLoadDays}d` : "never"}</td>
                      <td className="text-right px-3 py-2 border-b border-hairline-lo">{r.touchesOut} / {r.touchesIn}</td>
                      <td className="text-right px-3 py-2 border-b border-hairline-lo" style={{ maxWidth: 260 }}>
                        <StatusPill tone={meta.tone}>{meta.label(r)}</StatusPill>
                        {r.move !== "hold" && (
                          <span className="block text-[10.5px] text-faint mt-0.5 text-right">{r.why}</span>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4 py-[9px] border-t ds2-cell-rule font-condensed text-[11px] text-faint leading-[1.5]">
        evidence rules: ▲ needs 3+ loads with the data saying call-first (a prospect’s conversion promotes on its
        first load — converting IS the evidence) · ▼ on a Tier 1 needs the full quarter quiet, touches cited ·
        under 3 loads → THIN, never a fake grade · last-load amber past 30d, red past 60d · tap a name to open the
        agent sheet — the owner sets the tier there. Rebuilt on the five buckets in the next build.
      </div>
    </div>
  );
};

export default ReviewView;
