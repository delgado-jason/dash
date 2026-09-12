import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import type { Agent } from "@/types/agent";
import { StatusPill } from "@/components/ui/StatusPill";
import { createAgentContact } from "@/services/agentContactsService";
import {
  SYSTEM_START, activeByTier, tuesdayPick, fridayList, closeOutPending, inboundByTier, inboundTrend, coldFunnel,
} from "@/lib/metrics/relationships";
import { capacityDraft, closeOutDraft } from "@/lib/relationshipTemplates";
import { copyText } from "@/lib/clipboard";
import { GhostButton, PrimaryButton } from "@/components/relationships/primitives";
import { nameOf } from "@/lib/relationships/nameOf";
import { useRelationships } from "./context";

// TODAY — in PR1 this is the existing THIS WEEK'S RITUAL and IS IT WORKING
// boards, moved as-is so Brandie keeps the week's rituals while PR2 rebuilds
// Today on ADMIN-02 v1.1 (the capacity pass, the nurture flags, the cooling
// section). Three fixes rode along: parked agents leave byTier and the Monday
// blast; the "answering line" moved into the statusbar chip; the old TIERS
// board (with its "every undefinedd" header) is replaced by the Tiers view.
//
// The TUE / FRI buttons open the agent sheet with a v2 prefill: the check-in
// became a capacity heads-up by phone, the appreciation call a milestone
// note — the two v1 types are retired and leave the pickers.

const pct0 = (n: number): string => `${Math.round(n * 100)}%`;
const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);

const HEAD = "flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule";
const HEAD_BG = { background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" };
const DRAFT = { background: "var(--color-well)", border: "1px dashed rgba(232,148,10,.35)", color: "var(--color-amber-hi)", fontFamily: "ui-monospace, monospace" };

const TodayView = () => {
  const { agents, contacts, loads, now, reload, openAgent } = useRelationships();
  const [busy, setBusy] = useState(false);
  const [blastError, setBlastError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const nowKey = dayKeyOf(now);

  // Parked agents leave every working surface — the tier lists and the blast.
  const byTier = useMemo(() => activeByTier(agents), [agents]);

  const tue = useMemo(() => tuesdayPick(agents, contacts, now), [agents, contacts, now]);
  const fri = useMemo(() => fridayList(agents, loads, now), [agents, loads, now]);
  const pendingCloseOuts = useMemo(() => closeOutPending(loads, contacts, now), [loads, contacts, now]);
  const capacity = useMemo(() => capacityDraft(loads), [loads]);

  const ninetyAgo = dayKeyOf(new Date(now.getTime() - 90 * 86_400_000));
  const tierShare = useMemo(() => inboundByTier(agents, loads, ninetyAgo, nowKey), [agents, loads, ninetyAgo, nowKey]);
  const trend = useMemo(() => inboundTrend(loads), [loads]);
  const funnel = useMemo(() => coldFunnel(agents, contacts, loads), [agents, contacts, loads]);

  // NOW — the close-out email, logged against its load (operational, uncapped).
  const logCloseOut = async (agent: Agent, loadId: string) => {
    setBusy(true);
    setLogError(null);
    try {
      await createAgentContact({ agent_id: agent.agent_id, direction: "outbound", method: "email", type: "close_out", load_id: loadId });
      await reload();
    } catch (e) {
      setLogError(e instanceof Error ? e.message : "Couldn't log the close-out");
    } finally {
      setBusy(false);
    }
  };

  // Monday's one-tap: log the capacity email as an outbound touch on every
  // (non-parked) T1 — idempotent per day (a retry after a partial failure
  // skips agents already logged today), failures named, screen refreshed.
  const logCapacityBlast = async () => {
    setBusy(true);
    setBlastError(null);
    const already = new Set(
      contacts.filter((c) => c.type === "capacity" && c.contacted_at.slice(0, 10) === nowKey).map((c) => c.agent_id),
    );
    const failed: string[] = [];
    for (const a of byTier[1]) {
      if (already.has(a.agent_id)) continue;
      try {
        await createAgentContact({ agent_id: a.agent_id, direction: "outbound", method: "email", type: "capacity" });
      } catch {
        failed.push(nameOf(a));
      }
    }
    await reload();
    if (failed.length) setBlastError(`Didn't log: ${failed.join(", ")} — tap again to retry just them.`);
    setBusy(false);
  };

  return (
    <>
      {/* THIS WEEK'S RITUAL */}
      <div className="ds2-board mt-4 overflow-hidden">
        <div className={HEAD} style={HEAD_BG}>
          <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>THIS WEEK’S RITUAL</span>
          <span className="ml-auto font-condensed text-[12px] text-faint">the queue does the thinking — you do the talking</span>
        </div>
        <div className="px-4 pb-3">
          {/* MON */}
          <div className="flex items-start gap-3 py-3 border-b border-hairline-lo flex-wrap">
            <span className="font-display text-[17px] tracking-[.05em] text-amber-hi w-[52px] flex-none">MON</span>
            <div className="flex-1 min-w-[260px]">
              <p className="font-condensed font-semibold text-[13.5px]">Capacity heads-up → all Tier 1 ({byTier[1].length} agents)</p>
              <p className="font-condensed text-[11.5px] mt-1.5 rounded-[7px] px-2.5 py-1.5" style={DRAFT}>
                {capacity.subject} — {capacity.body.split("\n")[0]}
              </p>
              {blastError && <p className="font-condensed text-[12px] mt-1.5 text-status-negative-text">{blastError}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <GhostButton size="sm" onClick={() => copyText(`${capacity.subject}\n\n${capacity.body}`)}>Copy</GhostButton>
              <PrimaryButton size="sm" disabled={busy || byTier[1].length === 0} onClick={() => void logCapacityBlast()}>
                Log all {byTier[1].length} sent
              </PrimaryButton>
            </div>
          </div>
          {/* TUE */}
          <div className="flex items-start gap-3 py-3 border-b border-hairline-lo flex-wrap">
            <span className="font-display text-[17px] tracking-[.05em] text-amber-hi w-[52px] flex-none">TUE</span>
            <div className="flex-1 min-w-[260px]">
              <p className="font-condensed font-semibold text-[13.5px] flex items-center gap-2 flex-wrap">
                Nurture call →{" "}
                {tue ? (
                  <>
                    <b>{nameOf(tue.agent)}</b>
                    <StatusPill tone="neutral">
                      Tier 2 · {tue.daysSince == null ? "never touched" : `longest untouched (${tue.daysSince}d)`}
                    </StatusPill>
                  </>
                ) : (
                  <span className="text-faint">no Tier 2 agents yet — the owner sets tiers from the agent sheet</span>
                )}
              </p>
              <p className="font-condensed text-[12px] text-faint mt-0.5">this is how a Tier 2 earns Tier 1 — a capacity heads-up by phone, never “just checking in”</p>
            </div>
            {tue && (
              <div className="flex gap-2 pt-1">
                <PrimaryButton
                  size="sm"
                  disabled={busy}
                  onClick={() => openAgent(tue.agent.agent_id, { prefill: { direction: "outbound", method: "call", type: "capacity" } })}
                >
                  Log the call
                </PrimaryButton>
              </div>
            )}
          </div>
          {/* NOW — close-outs */}
          {pendingCloseOuts.map((l) => {
            const a = agents.find((x) => x.agent_id === l.agent_id);
            const draft = closeOutDraft(l, loads);
            return (
              <div key={l.load_id} className="flex items-start gap-3 py-3 border-b border-hairline-lo flex-wrap">
                <span className="font-display text-[17px] tracking-[.05em] text-amber-hi w-[52px] flex-none">NOW</span>
                <div className="flex-1 min-w-[260px]">
                  <p className="font-condensed font-semibold text-[13.5px] flex items-center gap-2 flex-wrap">
                    Close-out email → {l.load_number} delivered {l.delivery_date?.slice(5, 10)}
                    {a && <span className="text-faint font-normal"> · {nameOf(a)}</span>}
                    <StatusPill tone="bad">pending</StatusPill>
                  </p>
                  <p className="font-condensed text-[11.5px] mt-1.5 rounded-[7px] px-2.5 py-1.5" style={DRAFT}>
                    {draft.subject}
                  </p>
                </div>
                <div className="flex gap-2 pt-1">
                  <GhostButton size="sm" onClick={() => copyText(`${draft.subject}\n\n${draft.body}`)}>Copy</GhostButton>
                  {a && (
                    <PrimaryButton size="sm" disabled={busy} onClick={() => void logCloseOut(a, l.load_id)}>
                      Log sent
                    </PrimaryButton>
                  )}
                </div>
              </div>
            );
          })}
          {logError && <p className="font-condensed text-[12px] mt-1.5 text-status-negative-text">{logError}</p>}
          {/* FRI */}
          <div className="flex items-start gap-3 py-3 flex-wrap">
            <span className="font-display text-[17px] tracking-[.05em] text-amber-hi w-[52px] flex-none">FRI</span>
            <div className="flex-1 min-w-[260px]">
              <p className="font-condensed font-semibold text-[13.5px]">Thank-you calls → Tier 1s you ran for this week</p>
              <p className="font-condensed text-[12px] text-faint mt-0.5">
                {fri.length > 0 ? "thank them like you mean it — one button per agent, each logs its own milestone note" : "no Tier 1 deliveries this week yet"}
              </p>
            </div>
            {fri.length > 0 && (
              <div className="flex gap-2 pt-1 flex-wrap">
                {fri.map((e) => {
                  // Already thanked this week → the button turns done-ghost.
                  const weekAgo = dayKeyOf(new Date(now.getTime() - 6 * 86_400_000));
                  const thanked = contacts.some(
                    (c) =>
                      c.agent_id === e.agent.agent_id &&
                      (c.type === "appreciation" || c.type === "milestone") &&
                      c.contacted_at.slice(0, 10) >= weekAgo,
                  );
                  return thanked ? (
                    <GhostButton key={e.agent.agent_id} size="sm" disabled>
                      ✓ {nameOf(e.agent)}
                    </GhostButton>
                  ) : (
                    <PrimaryButton
                      key={e.agent.agent_id}
                      size="sm"
                      disabled={busy}
                      onClick={() => openAgent(e.agent.agent_id, { prefill: { direction: "outbound", method: "call", type: "milestone" } })}
                    >
                      Log {nameOf(e.agent)} ({e.loads})
                    </PrimaryButton>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* IS IT WORKING */}
      <div className="ds2-board mt-4 overflow-hidden">
        <div className={HEAD} style={HEAD_BG}>
          <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>IS IT WORKING</span>
          <span className="ml-auto font-condensed text-[12px] text-faint">the one number: are agents calling you first?</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 px-4 py-4">
          <div>
            <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mb-2">
              Inbound share of attributed loads — monthly
            </p>
            {trend.length >= 2 ? (
              <div style={{ height: 170 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend.map((r) => ({ m: r.month.slice(2), share: Math.round(r.share * 100) }))} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#141c2a" vertical={false} />
                    <XAxis dataKey="m" tick={{ fill: "#5a6880", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "#1e2636" }} />
                    <YAxis tick={{ fill: "#5a6880", fontSize: 11 }} tickLine={false} axisLine={false} unit="%" width={36} />
                    <Tooltip
                      contentStyle={{ background: "#0e1420", border: "1px solid #1e2636", borderRadius: 8, fontSize: 12 }}
                      formatter={(v) => [`${v}%`, "inbound share"]}
                    />
                    <ReferenceLine x={SYSTEM_START.slice(2, 7)} stroke="var(--color-chart-blue)" strokeDasharray="3 4" label={{ value: "system start", fill: "var(--color-chart-blue)", fontSize: 10, position: "insideTopLeft" }} />
                    <Line type="monotone" dataKey="share" stroke="#f5b03a" strokeWidth={2} dot={{ r: 3, fill: "#f5b03a" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="font-condensed text-[12.5px] text-faint">
                forges after two months of attributed loads — every new booking feeds it
              </p>
            )}
            <p className="font-condensed text-[11px] text-faint mt-1">
              pre-system loads carry no attribution and sit outside the math
            </p>
          </div>
          <div>
            <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mb-2">Inbound by tier · 90d</p>
            {[1, 2, 3].map((t) => {
              const s = tierShare[t];
              return (
                <div key={t} className="flex items-center gap-2.5 mt-2 font-condensed text-[12px]">
                  <span className="w-11 text-dim">{t === 3 ? "T3 + Pro." : `Tier ${t}`}</span>
                  <div className="flex-1 h-[12px] rounded-[6px] overflow-hidden" style={{ background: "var(--color-well)", border: "1px solid var(--color-hairline-lo)" }}>
                    <div style={{ width: `${Math.round((s.share ?? 0) * 100)}%`, height: "100%", background: "var(--color-amber)", opacity: 1 - (t - 1) * 0.22 }} />
                  </div>
                  <span className="w-10 text-right tabular-nums text-ink">{s.share == null ? "—" : pct0(s.share)}</span>
                </div>
              );
            })}
            <p className="font-condensed text-[11px] text-faint mt-2.5">
              the thesis on one screen: attention converts to inbound freight
            </p>
            <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mt-4 mb-1">The prospect funnel</p>
            <p className="font-condensed text-[12px] text-dim tabular-nums">
              {funnel.pool} courting · {funnel.touched} touched · {funnel.replied} replied ·{" "}
              <b className="text-ink">{funnel.converted} converted</b>
              {funnel.medianDaysToConvert != null && <> · median {funnel.medianDaysToConvert}d to first load</>}
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default TodayView;
