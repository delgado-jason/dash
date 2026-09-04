import { useEffect, useMemo, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { useLoads } from "@/hooks/useLoads";
import { getAgents } from "@/services/agentsService";
import { getBrokers } from "@/services/brokersService";
import { createBroker } from "@/services/createBrokerService";
import { createAgent } from "@/services/createAgentService";
import { patchAgent } from "@/services/patchAgentService";
import {
  getAgentContacts, createAgentContact, type AgentContact,
} from "@/services/agentContactsService";
import type { Agent } from "@/types/agent";
import type { Broker } from "@/types/broker";
import { loadRevenue } from "@/lib/metrics/rateTargets";
import { buildAgentScorecards } from "@/lib/metrics/agentScorecard";
import {
  SYSTEM_START, TIER_CADENCE_DAYS,
  lastTouchOf, prospectState, dueQueue, tuesdayPick, fridayList,
  closeOutPending, inboundShare, inboundByTier, inboundTrend, coldFunnel,
} from "@/lib/metrics/relationships";
import { capacityDraft, closeOutDraft } from "@/lib/relationshipTemplates";
import { isDispatcher } from "@/lib/roles";

const money = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const pct0 = (n: number): string => `${Math.round(n * 100)}%`;
const dayKeyOf = (d: Date) => d.toISOString().slice(0, 10);
const nameOf = (a: { first_name: string; last_name: string }) => `${a.first_name} ${a.last_name}`.trim();

const CHIP = "inline-block font-condensed text-[10.5px] font-semibold tracking-[.08em] px-2 py-[1px] rounded-full border uppercase";
const chipStyle = {
  plain: { color: "var(--color-faint)", borderColor: "var(--color-hairline)" },
  due: { color: "#f2a6a3", borderColor: "rgba(224,82,82,.45)", background: "rgba(224,82,82,.08)" },
  drift: { color: "var(--color-blue)", borderColor: "rgba(79,140,214,.45)", background: "rgba(79,140,214,.08)" },
  ok: { color: "var(--color-ok)", borderColor: "rgba(111,208,140,.4)", background: "rgba(111,208,140,.07)" },
  warm: { color: "var(--color-amber-hi)", borderColor: "rgba(232,148,10,.45)", background: "rgba(232,148,10,.08)" },
} as const;

const BTN = "font-condensed font-bold text-[11px] tracking-[.1em] uppercase bg-amber text-[#0d1117] rounded-[7px] px-3 py-[5px] hover:bg-amber-hi disabled:opacity-40";
const BTN_GHOST = "font-condensed font-semibold text-[11px] tracking-[.1em] uppercase text-dim border border-hairline rounded-[7px] px-3 py-[5px] hover:text-ink";

// Copy to clipboard, best-effort — a failed copy still shows the text on screen.
const copyText = (t: string) => {
  try { void navigator.clipboard.writeText(t); } catch { /* text is visible anyway */ }
};

const T1_CAP = 8;

const RelationshipsPage = () => {
  const { loads } = useLoads(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [contacts, setContacts] = useState<AgentContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [touchFor, setTouchFor] = useState<{ agent: Agent; prefill?: Partial<AgentContact> } | null>(null);
  const [showProspect, setShowProspect] = useState(false);
  const [actionFor, setActionFor] = useState<Agent | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    Promise.all([getAgents(), getAgentContacts(), getBrokers()])
      .then(([a, c, b]) => {
        setAgents(a);
        setContacts(c);
        setBrokers(b);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const now = useMemo(() => new Date(), []);
  const nowKey = dayKeyOf(now);
  const scorecards = useMemo(() => buildAgentScorecards(agents, loads ?? [], now), [agents, loads, now]);

  const byTier = useMemo(() => {
    const t: Record<number, Agent[]> = { 1: [], 2: [], 3: [] };
    for (const a of agents) (t[a.relationship_tier] ?? t[3]).push(a);
    return t;
  }, [agents]);

  const queue = useMemo(() => dueQueue(agents, contacts, loads ?? [], now), [agents, contacts, loads, now]);
  const tue = useMemo(() => tuesdayPick(agents, contacts, now), [agents, contacts, now]);
  const fri = useMemo(() => fridayList(agents, loads ?? [], now), [agents, loads, now]);
  const pendingCloseOuts = useMemo(() => closeOutPending(loads ?? [], contacts, now), [loads, contacts, now]);
  const capacity = useMemo(() => capacityDraft(loads ?? []), [loads]);

  const ninetyAgo = dayKeyOf(new Date(now.getTime() - 90 * 86_400_000));
  const share90 = useMemo(() => inboundShare(loads ?? [], ninetyAgo, nowKey), [loads, ninetyAgo, nowKey]);
  const tierShare = useMemo(() => inboundByTier(agents, loads ?? [], ninetyAgo, nowKey), [agents, loads, ninetyAgo, nowKey]);
  const trend = useMemo(() => inboundTrend(loads ?? []), [loads]);
  const funnel = useMemo(() => coldFunnel(agents, contacts, loads ?? []), [agents, contacts, loads]);

  const revenueOf = useMemo(() => {
    const m = new Map<string, { rev: number; n: number }>();
    for (const l of loads ?? []) {
      if (l.load_status !== "delivered" || !l.agent_id) continue;
      const e = m.get(l.agent_id) ?? { rev: 0, n: 0 };
      e.rev += loadRevenue(l);
      e.n++;
      m.set(l.agent_id, e);
    }
    return m;
  }, [loads]);

  const inboundOfAgent = (agentId: string) => {
    const mine = (loads ?? []).filter(
      (l) => l.agent_id === agentId && l.booked_via != null && l.load_status !== "cancelled",
    );
    if (mine.length === 0) return null;
    return mine.filter((l) => l.booked_via === "agent_reached_out").length / mine.length;
  };

  const logTouch = async (
    agent: Agent,
    data: { direction: AgentContact["direction"]; method: AgentContact["method"]; type: AgentContact["type"]; note?: string; load_id?: string | null },
  ) => {
    setBusy(true);
    try {
      await createAgentContact({ agent_id: agent.agent_id, ...data });
      await load();
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Monday's one-tap: log the capacity email as an outbound touch on every T1.
  const logCapacityBlast = async () => {
    setBusy(true);
    try {
      for (const a of byTier[1]) {
        await createAgentContact({
          agent_id: a.agent_id, direction: "outbound", method: "email", type: "capacity",
        });
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const overdueSet = useMemo(() => new Set(queue.map((e) => e.agent.agent_id)), [queue]);

  if (loading) return <div className="text-sm text-muted-text py-12 text-center">Opening the book of agents…</div>;

  const AgentCard = ({ a }: { a: Agent }) => {
    const st = prospectState(a.agent_id, contacts, loads ?? []);
    const last = lastTouchOf(a.agent_id, contacts);
    const days = last == null ? null : Math.floor((now.getTime() - Date.parse(last)) / 86_400_000);
    const rev = revenueOf.get(a.agent_id);
    const inb = inboundOfAgent(a.agent_id);
    const sc = scorecards.get(a.agent_id);
    // The data disagreeing with the placement — same gut-vs-data grammar as
    // the star-rating flags. Only loud disagreements chip.
    const drift =
      sc && st.stage === "converted"
        ? a.relationship_tier >= 2 && sc.tier === "call-first"
          ? "DATA: CALL-FIRST"
          : a.relationship_tier === 1 && (sc.tier === "watch" || sc.tier === "cold")
            ? `DATA: ${sc.tier.toUpperCase()}`
            : null
        : null;
    const overdue = overdueSet.has(a.agent_id);
    return (
      <button
        onClick={() => setActionFor(a)}
        className="w-full text-left rounded-[9px] px-2.5 py-2 mt-2"
        style={{
          background: "var(--color-well)",
          border: overdue ? "1px solid rgba(224,82,82,.45)" : "1px solid var(--color-hairline-lo)",
        }}
      >
        <div className="font-condensed font-semibold text-[13px] flex gap-2 items-baseline flex-wrap">
          {nameOf(a)} <span className="text-faint font-normal">· {a.broker_name}</span>
          {st.stage === "prospect" && <span className={CHIP} style={chipStyle.plain}>NEVER RUN</span>}
          {st.stage === "touched" && <span className={CHIP} style={chipStyle.drift}>COLD ×{st.coldTouches}</span>}
          {st.stage === "replied" && <span className={CHIP} style={chipStyle.warm}>REPLIED</span>}
          {overdue && <span className={CHIP} style={chipStyle.due}>{days == null ? "NEVER TOUCHED" : `${days}d — DUE`}</span>}
          {drift && <span className={CHIP} style={chipStyle.drift}>{drift}</span>}
          {inb != null && st.stage === "converted" && (
            <span className={CHIP} style={inb >= 0.4 ? chipStyle.ok : chipStyle.plain}>inbound {pct0(inb)}</span>
          )}
        </div>
        <div className="font-condensed text-[11px] text-faint mt-0.5 tabular-nums">
          {days == null ? "never touched" : `touched ${days}d ago`}
          {rev ? <> · <b className="text-dim">{money(rev.rev)}</b> · {rev.n} loads</> : null}
          {st.stage !== "converted" && a.agent_city ? <> · {a.agent_city}, {a.agent_state}</> : null}
          {st.stage !== "converted" && a.source ? <> · via {a.source}</> : null}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">RELATIONSHIPS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">the book of agents — freight follows friendship</span>
          <button onClick={() => setShowProspect(true)} className={`ml-auto ${BTN}`}>+ Add prospect</button>
        </div>

        {/* answering line */}
        <div className="flex items-center gap-3 flex-wrap mt-4 font-condensed">
          {share90.share != null ? (
            <>
              <span
                className="font-display text-[21px] tracking-[.04em] rounded-[8px] px-3 pt-[3px] pb-[1px] border-2"
                style={{ color: "var(--color-ok)", borderColor: "rgba(111,208,140,.45)", background: "rgba(111,208,140,.06)", transform: "rotate(-1.2deg)" }}
              >
                {pct0(share90.share)} INBOUND
              </span>
              <span className="text-[13.5px] text-faint">
                · <b className="text-ink tabular-nums">{share90.inbound}</b> of{" "}
                <b className="text-ink tabular-nums">{share90.attributed}</b> attributed loads (90d) came to you
                · system start {SYSTEM_START} · <b className="text-ink tabular-nums">{queue.length}</b> touches due
              </span>
            </>
          ) : (
            <span className="text-[13.5px] text-faint">
              the inbound gauge forges as new loads carry their attribution — {queue.length} touches due meanwhile
            </span>
          )}
        </div>

        {/* THIS WEEK'S RITUAL */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
            <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>THIS WEEK’S RITUAL</span>
            <span className="ml-auto font-condensed text-[12px] text-faint">the queue does the thinking — you do the talking</span>
          </div>
          <div className="px-4 pb-3">
            {/* MON */}
            <div className="flex items-start gap-3 py-3 border-b border-hairline-lo flex-wrap">
              <span className="font-display text-[17px] tracking-[.05em] text-amber-hi w-[52px] flex-none">MON</span>
              <div className="flex-1 min-w-[260px]">
                <p className="font-condensed font-semibold text-[13.5px]">Capacity email → all Tier 1 ({byTier[1].length} agents)</p>
                <p className="font-condensed text-[11.5px] text-mono mt-1.5 rounded-[7px] px-2.5 py-1.5" style={{ background: "var(--color-well)", border: "1px dashed rgba(232,148,10,.35)", color: "var(--color-amber-hi)", fontFamily: "ui-monospace, monospace" }}>
                  {capacity.subject} — {capacity.body.split("\n")[0]}
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button className={BTN_GHOST} onClick={() => copyText(`${capacity.subject}\n\n${capacity.body}`)}>Copy</button>
                <button className={BTN} disabled={busy || byTier[1].length === 0} onClick={logCapacityBlast}>
                  Log all {byTier[1].length} sent
                </button>
              </div>
            </div>
            {/* TUE */}
            <div className="flex items-start gap-3 py-3 border-b border-hairline-lo flex-wrap">
              <span className="font-display text-[17px] tracking-[.05em] text-amber-hi w-[52px] flex-none">TUE</span>
              <div className="flex-1 min-w-[260px]">
                <p className="font-condensed font-semibold text-[13.5px]">
                  Check-in call →{" "}
                  {tue ? (
                    <>
                      <b>{nameOf(tue.agent)}</b>{" "}
                      <span className={CHIP} style={chipStyle.plain}>
                        Tier 2 · {tue.daysSince == null ? "never touched" : `longest untouched (${tue.daysSince}d)`}
                      </span>
                    </>
                  ) : (
                    <span className="text-faint">no Tier 2 agents yet — promote one from Tier 3</span>
                  )}
                </p>
                <p className="font-condensed text-[12px] text-faint mt-0.5">this is how a Tier 2 earns Tier 1</p>
              </div>
              {tue && (
                <div className="flex gap-2 pt-1">
                  <button
                    className={BTN}
                    disabled={busy}
                    onClick={() => setTouchFor({ agent: tue.agent as unknown as Agent, prefill: { direction: "outbound", method: "call", type: "check_in" } })}
                  >
                    Log the call
                  </button>
                </div>
              )}
            </div>
            {/* NOW — close-outs */}
            {pendingCloseOuts.map((l) => {
              const a = agents.find((x) => x.agent_id === l.agent_id);
              const draft = closeOutDraft(l, loads ?? []);
              return (
                <div key={l.load_id} className="flex items-start gap-3 py-3 border-b border-hairline-lo flex-wrap">
                  <span className="font-display text-[17px] tracking-[.05em] text-amber-hi w-[52px] flex-none">NOW</span>
                  <div className="flex-1 min-w-[260px]">
                    <p className="font-condensed font-semibold text-[13.5px]">
                      Close-out email → {l.load_number} delivered {l.delivery_date?.slice(5, 10)}
                      {a && <span className="text-faint font-normal"> · {nameOf(a)}</span>}{" "}
                      <span className={CHIP} style={chipStyle.due}>PENDING</span>
                    </p>
                    <p className="font-condensed text-[11.5px] mt-1.5 rounded-[7px] px-2.5 py-1.5" style={{ background: "var(--color-well)", border: "1px dashed rgba(232,148,10,.35)", color: "var(--color-amber-hi)", fontFamily: "ui-monospace, monospace" }}>
                      {draft.subject}
                    </p>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button className={BTN_GHOST} onClick={() => copyText(`${draft.subject}\n\n${draft.body}`)}>Copy</button>
                    {a && (
                      <button
                        className={BTN}
                        disabled={busy}
                        onClick={() => void logTouch(a, { direction: "outbound", method: "email", type: "close_out", load_id: l.load_id })}
                      >
                        Log sent
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {/* FRI */}
            <div className="flex items-start gap-3 py-3 flex-wrap">
              <span className="font-display text-[17px] tracking-[.05em] text-amber-hi w-[52px] flex-none">FRI</span>
              <div className="flex-1 min-w-[260px]">
                <p className="font-condensed font-semibold text-[13.5px]">Appreciation calls → Tier 1s you ran for this week</p>
                <p className="font-condensed text-[12px] text-faint mt-0.5">
                  {fri.length > 0 ? (
                    <>auto-computed: <b className="text-dim">{fri.map((e) => `${nameOf(e.agent)} (${e.loads})`).join(" · ")}</b> — thank them like you mean it</>
                  ) : (
                    "no Tier 1 deliveries this week yet"
                  )}
                </p>
              </div>
              {fri.length > 0 && (
                <div className="flex gap-2 pt-1">
                  <button
                    className={BTN}
                    disabled={busy}
                    onClick={() => setTouchFor({ agent: fri[0].agent as unknown as Agent, prefill: { direction: "outbound", method: "call", type: "appreciation" } })}
                  >
                    Log calls
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* THE TIERS */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
            <span className="font-forge font-bold text-[18px]" style={{ letterSpacing: "1.5px" }}>THE TIERS</span>
            <span className="ml-auto font-condensed text-[12px] text-faint">tiers are YOUR call — blue chips are the data disagreeing · tap an agent</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3">
            {[1, 2, 3].map((t) => (
              <div key={t} className="px-3.5 py-3 border-b md:border-b-0 md:border-r ds2-cell-rule last:border-r-0">
                <p className="font-condensed font-semibold text-[11px] tracking-[.16em] uppercase text-faint">
                  <span className="font-display text-[17px] text-ink tracking-[.04em] normal-case">TIER {t}</span>{" "}
                  · every {TIER_CADENCE_DAYS[t]}d · {byTier[t].length}
                  {t === 1 && ` of ${T1_CAP} max`}
                  {t === 3 && " · incl. the cold pool"}
                </p>
                {byTier[t].map((a) => <AgentCard key={a.agent_id} a={a} />)}
                {byTier[t].length === 0 && <p className="font-condensed text-[12px] text-faint mt-2">nobody here yet</p>}
              </div>
            ))}
          </div>
        </div>

        {/* IS IT WORKING */}
        <div className="ds2-board mt-4 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-[11px] border-b ds2-cell-rule" style={{ background: "linear-gradient(90deg, rgba(232,148,10,.08), transparent 55%)" }}>
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
                      <ReferenceLine x={SYSTEM_START.slice(2, 7)} stroke="var(--color-blue)" strokeDasharray="3 4" label={{ value: "system start", fill: "var(--color-blue)", fontSize: 10, position: "insideTopLeft" }} />
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
                    <span className="w-11 text-dim">Tier {t}</span>
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
              <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mt-4 mb-1">The cold funnel</p>
              <p className="font-condensed text-[12px] text-dim tabular-nums">
                {funnel.pool} in the pool · {funnel.touched} touched · {funnel.replied} replied ·{" "}
                <b className="text-ink">{funnel.converted} converted</b>
                {funnel.medianDaysToConvert != null && <> · median {funnel.medianDaysToConvert}d to first load</>}
              </p>
            </div>
          </div>
        </div>

        {touchFor && (
          <TouchPopup
            agent={touchFor.agent}
            prefill={touchFor.prefill}
            busy={busy}
            onLog={async (data) => {
              const ok = await logTouch(touchFor.agent, data);
              if (ok) setTouchFor(null);
            }}
            onClose={() => setTouchFor(null)}
          />
        )}
        {actionFor && (
          <AgentActionPopup
            agent={actionFor}
            t1Count={byTier[1].length}
            busy={busy}
            canRetier={!isDispatcher()}
            onTouch={() => {
              setTouchFor({ agent: actionFor });
              setActionFor(null);
            }}
            onRetier={async (tier) => {
              setBusy(true);
              try {
                await patchAgent(actionFor.agent_id, { relationship_tier: tier });
                await load();
                setActionFor(null);
              } finally {
                setBusy(false);
              }
            }}
            onClose={() => setActionFor(null)}
          />
        )}
        {showProspect && (
          <ProspectPopup
            brokers={brokers}
            busy={busy}
            onAdd={async (data) => {
              setBusy(true);
              try {
                let brokerId = data.broker_id;
                if (!brokerId && data.newBrokerCode) {
                  const b = await createBroker({ broker_name: data.newBrokerCode, phone: null, email: null, rating: null, notes: null });
                  brokerId = b.broker_id;
                }
                if (!brokerId) return false;
                await createAgent({
                  broker_id: brokerId,
                  first_name: data.first_name,
                  last_name: data.last_name,
                  phone: data.phone || null,
                  email: data.email || null,
                  preferred_contact: null,
                  rating: null,
                  notes: data.note || null,
                  agent_city: data.city || null,
                  agent_state: data.state || null,
                  source: data.source,
                });
                await load();
                setShowProspect(false);
                return true;
              } catch {
                return false;
              } finally {
                setBusy(false);
              }
            }}
            onClose={() => setShowProspect(false)}
          />
        )}
      </div>
    </div>
  );
};

const POPUP_WRAP = "fixed inset-0 z-50 flex items-center justify-center";
const POPUP_BOX = "relative w-full max-w-[460px] mx-4 max-h-[90vh] overflow-y-auto bg-canvas text-ink rounded-[12px] border border-hairline shadow-xl";
const POPUP_HEAD = "flex items-center gap-3 px-5 py-[14px] border-b ds2-cell-rule";
const LBL = "font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint block mt-3 mb-1";
const FIELD = "w-full bg-well border border-hairline rounded-[8px] px-3 py-2 text-[13.5px] text-ink focus:outline-none focus:border-amber";

const Seg = <T extends string>({ options, value, onPick }: { options: [T, string][]; value: T; onPick: (v: T) => void }) => (
  <div className="inline-flex flex-wrap border border-hairline rounded-[8px] overflow-hidden">
    {options.map(([v, label]) => (
      <button
        key={v}
        type="button"
        onClick={() => onPick(v)}
        className={`font-condensed text-[12px] px-3 py-[6px] ${v === value ? "bg-amber text-[#0d1117] font-bold" : "text-dim hover:text-ink"}`}
      >
        {label}
      </button>
    ))}
  </div>
);

const TouchPopup = ({
  agent, prefill, busy, onLog, onClose,
}: {
  agent: Agent;
  prefill?: Partial<AgentContact>;
  busy: boolean;
  onLog: (d: { direction: AgentContact["direction"]; method: AgentContact["method"]; type: AgentContact["type"]; note?: string }) => void;
  onClose: () => void;
}) => {
  const [direction, setDirection] = useState<AgentContact["direction"]>(prefill?.direction ?? "outbound");
  const [method, setMethod] = useState<AgentContact["method"]>(prefill?.method ?? "call");
  const [type, setType] = useState<AgentContact["type"]>(prefill?.type ?? "check_in");
  const [note, setNote] = useState("");
  return (
    <div className={POPUP_WRAP}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={POPUP_BOX}>
        <div className={POPUP_HEAD} style={{ background: "linear-gradient(90deg, rgba(232,148,10,.12), transparent 60%)" }}>
          <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>LOG A TOUCH</span>
          <span className="font-condensed text-[12px] text-faint">{agent.first_name} {agent.last_name}</span>
          <button className="ml-auto text-faint hover:text-ink" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          <span className={LBL}>Direction</span>
          <Seg options={[["outbound", "I reached out"], ["inbound", "They reached out"]]} value={direction} onPick={setDirection} />
          <span className={LBL}>Method</span>
          <Seg options={[["call", "Call"], ["email", "Email"], ["text", "Text"]]} value={method} onPick={setMethod} />
          <span className={LBL}>Type</span>
          <Seg
            options={[["capacity", "Capacity"], ["check_in", "Check-in"], ["appreciation", "Appreciation"], ["close_out", "Close-out"], ["cold", "Cold"], ["inbound_inquiry", "Inbound"], ["other", "Other"]]}
            value={type}
            onPick={setType}
          />
          <span className={LBL}>Note (optional)</span>
          <input className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} placeholder="daughter starts college this fall — ask next time" />
          <div className="flex gap-2 mt-4">
            <button className={BTN} disabled={busy} onClick={() => onLog({ direction, method, type, note: note || undefined })}>
              {busy ? "Logging…" : "Log it"}
            </button>
            <button className={BTN_GHOST} onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AgentActionPopup = ({
  agent, t1Count, busy, canRetier, onTouch, onRetier, onClose,
}: {
  agent: Agent;
  t1Count: number;
  busy: boolean;
  // Tiers are the OWNER'S call — the dispatcher runs the ritual (touches,
  // prospects, close-outs) but never moves an agent between tiers.
  canRetier: boolean;
  onTouch: () => void;
  onRetier: (tier: number) => void;
  onClose: () => void;
}) => (
  <div className={POPUP_WRAP}>
    <div className="absolute inset-0 bg-black/60" onClick={onClose} />
    <div className={POPUP_BOX}>
      <div className={POPUP_HEAD} style={{ background: "linear-gradient(90deg, rgba(232,148,10,.12), transparent 60%)" }}>
        <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>{agent.first_name.toUpperCase()} {agent.last_name.toUpperCase()}</span>
        <span className="font-condensed text-[12px] text-faint">· {agent.broker_name}</span>
        <button className="ml-auto text-faint hover:text-ink" onClick={onClose}>✕</button>
      </div>
      <div className="p-5">
        <button className={`${BTN} w-full py-2`} onClick={onTouch}>Log a touch</button>
        {canRetier ? (
          <>
            <span className={LBL}>Move to tier</span>
            <div className="flex gap-2">
              {[1, 2, 3].map((t) => {
                const isCurrent = agent.relationship_tier === t;
                const capped = t === 1 && !isCurrent && t1Count >= T1_CAP;
                return (
                  <button
                    key={t}
                    disabled={busy || isCurrent || capped}
                    className={`${isCurrent ? BTN : BTN_GHOST} flex-1 py-2`}
                    title={capped ? `Tier 1 is full (${T1_CAP}) — demote someone first` : undefined}
                    onClick={() => onRetier(t)}
                  >
                    Tier {t}{capped ? " · full" : ""}
                  </button>
                );
              })}
            </div>
            <p className="font-condensed text-[11px] text-faint mt-3">
              Tier 1 caps at {T1_CAP} — weekly attention diluted is weekly attention wasted.
            </p>
          </>
        ) : (
          <p className="font-condensed text-[11px] text-faint mt-3">
            Tier {agent.relationship_tier} — tiers are the owner’s call.
          </p>
        )}
      </div>
    </div>
  </div>
);

const ProspectPopup = ({
  brokers, busy, onAdd, onClose,
}: {
  brokers: Broker[];
  busy: boolean;
  onAdd: (d: {
    first_name: string; last_name: string; broker_id: string | null; newBrokerCode: string;
    city: string; state: string; phone: string; email: string; source: string; note: string;
  }) => Promise<boolean>;
  onClose: () => void;
}) => {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [newCode, setNewCode] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("load_board");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!first.trim() || !last.trim()) { setErr("Name is required"); return; }
    if (!brokerId && !newCode.trim()) { setErr("Pick the agency code, or type a new one"); return; }
    setErr(null);
    const ok = await onAdd({
      first_name: first.trim(), last_name: last.trim(),
      broker_id: brokerId || null, newBrokerCode: newCode.trim().toUpperCase(),
      city: city.trim(), state: state.trim().toUpperCase(), phone: phone.trim(), email: email.trim(),
      source, note: note.trim(),
    });
    if (!ok) setErr("Couldn't add the prospect — check the fields and try again.");
  };

  return (
    <div className={POPUP_WRAP}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={POPUP_BOX}>
        <div className={POPUP_HEAD} style={{ background: "linear-gradient(90deg, rgba(232,148,10,.12), transparent 60%)" }}>
          <span className="font-forge font-bold text-[19px]" style={{ letterSpacing: "1.5px" }}>+ ADD A PROSPECT</span>
          <button className="ml-auto text-faint hover:text-ink" onClick={onClose}>✕</button>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <div><span className={LBL}>First name</span><input className={FIELD} value={first} onChange={(e) => setFirst(e.target.value)} /></div>
            <div><span className={LBL}>Last name</span><input className={FIELD} value={last} onChange={(e) => setLast(e.target.value)} /></div>
          </div>
          <span className={LBL}>Agency (broker code)</span>
          <div className="grid grid-cols-2 gap-3">
            <select className={FIELD} value={brokerId} onChange={(e) => { setBrokerId(e.target.value); if (e.target.value) setNewCode(""); }}>
              <option value="">— existing —</option>
              {brokers.map((b) => <option key={b.broker_id} value={b.broker_id}>{b.broker_name}</option>)}
            </select>
            <input className={FIELD} placeholder="or new 3-letter code" maxLength={10} value={newCode} onChange={(e) => { setNewCode(e.target.value); if (e.target.value) setBrokerId(""); }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={LBL}>Agency city</span><input className={FIELD} value={city} onChange={(e) => setCity(e.target.value)} /></div>
            <div><span className={LBL}>State</span><input className={FIELD} maxLength={2} value={state} onChange={(e) => setState(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={LBL}>Phone</span><input className={FIELD} value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div><span className={LBL}>Email</span><input className={FIELD} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <span className={LBL}>Where'd you find them?</span>
          <Seg
            options={[["load_board", "Load board"], ["referral", "Referral"], ["directory", "Landstar directory"], ["saw_freight", "Saw their freight"], ["other", "Other"]]}
            value={source}
            onPick={setSource}
          />
          <span className={LBL}>Note</span>
          <input className={FIELD} value={note} onChange={(e) => setNote(e.target.value)} placeholder="posts stepdeck freight out of Boise weekly" />
          {err && <p className="font-condensed text-[12px] mt-2" style={{ color: "var(--color-warn)" }}>{err}</p>}
          <div className="flex gap-2 mt-4">
            <button className={BTN} disabled={busy} onClick={() => void submit()}>{busy ? "Adding…" : "Add to the cold pool"}</button>
            <button className={BTN_GHOST} onClick={onClose}>Cancel</button>
          </div>
          <p className="font-condensed text-[11px] text-faint mt-3">
            lands in Tier 3 automatically — booking their first load later matches this record, no duplicate
          </p>
        </div>
      </div>
    </div>
  );
};

export default RelationshipsPage;
