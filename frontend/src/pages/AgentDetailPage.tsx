import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import { Mail, Phone, StickyNote, Star, MessageSquare } from "lucide-react";

const TOUCH_LABEL: Record<string, string> = {
  capacity: "capacity email",
  check_in: "check-in",
  appreciation: "appreciation",
  close_out: "close-out",
  cold: "cold outreach",
  inbound_inquiry: "inbound inquiry",
  other: "touch",
};

import { useAgent } from "@/hooks/useAgent";
import { useLoads } from "@/hooks/useLoads";
import { useCarrierName } from "@/hooks/useCarrierName";
import { createAgentNote } from "@/services/createAgentNoteService";
import { getSettlementSchedule } from "@/services/settlementScheduleService";
import {
  agentStops,
  scoreStops,
  agentDetention,
} from "@/lib/metrics/stopScore";

import RatingForm from "@/components/RatingForm";
import { StopScorecard } from "@/components/StopScorecard";
import { Kpi } from "@/components/Kpi";
import { StatusBadge } from "@/components/StatusBadge";
import { RatingStamp } from "@/components/agents/RatingStamp";
import { TrophyCase } from "@/components/agents/TrophyCase";
import { PRESTIGE_META } from "@/components/agents/PrestigeBadge";
import { Coin, type CoinMetal } from "@/components/forge/Coin";
import { fmtRpm, rpmTextClass } from "@/components/lanes/rpmStyle";

import {
  agentPrestige,
  computeHonors,
  agentSeasonLog,
  currentQuarterStanding,
} from "@/lib/metrics/agentLeaderboard";
import {
  getLoadCount,
  getGrossRevenue,
  getAverageRPM,
  getCancelledCount,
  getLastLoadDate,
  buildTimeline,
} from "@/lib/metrics/agent";
import { loadRevenue } from "@/lib/metrics/loads";
import { Panel } from "@/components/ui/Panel";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  getAgentContacts, deleteAgentContact, type AgentContact,
} from "@/services/agentContactsService";
import { useRateTargets } from "@/hooks/useRateTargets";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCardsSkeleton, BlockSkeleton } from "@/components/ui/PageSkeletons";
import { money } from "@/lib/format";

const fmtDate = (d?: string | null) =>
  d
    ? new Date(String(d).slice(0, 10) + "T00:00:00Z").toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" },
      )
    : "—";

const AgentDetailPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const carrierName = useCarrierName();
  const { agent, loads, notes, ratingHistory, isLoading, error } =
    useAgent(refreshKey);
  const { loads: allLoads } = useLoads(0);
  // "Your rate with them vs your overall" — the overall comes from the same
  // rolling engine every other surface uses, over the full load history the
  // page already fetches.
  const overallTargets = useRateTargets(allLoads);

  const [noteText, setNoteText] = useState("");
  const [noteInitials, setNoteInitials] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [freeHours, setFreeHours] = useState(3);

  useEffect(() => {
    getSettlementSchedule()
      .then((s) => setFreeHours(s.detention_free_hours))
      .catch(() => {});
  }, []);

  // How this agent's freight behaves on the clock — dwell, on-time, detention.
  const timeScore = useMemo(
    () => scoreStops(agentStops(loads ?? [], freeHours)),
    [loads, freeHours],
  );
  // Detention claimed vs actually paid — does this agent's freight waste time?
  const det = useMemo(
    () => agentDetention(loads ?? [], freeHours),
    [loads, freeHours],
  );

  const agentId = agent?.agent_id;
  const honors = useMemo(
    () =>
      agentId
        ? computeHonors(allLoads ?? [], new Date()).get(agentId)
        : undefined,
    [allLoads, agentId],
  );
  const season = useMemo(
    () => (agentId ? agentSeasonLog(allLoads ?? [], agentId, new Date()) : []),
    [allLoads, agentId],
  );
  const live = useMemo(
    () =>
      agentId
        ? currentQuarterStanding(allLoads ?? [], agentId, new Date())
        : null,
    [allLoads, agentId],
  );

  if (isLoading)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-32 mb-6" />
        <StatCardsSkeleton count={4} />
        <BlockSkeleton className="h-56 mt-6" />
      </div>
    );
  if (error)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );
  if (!agent) return null;

  const tier = agentPrestige(honors);
  const prestige = PRESTIGE_META[tier];
  const grossRev = getGrossRevenue(loads);
  const rpm = getAverageRPM(loads);
  const lastWorked = getLastLoadDate(loads);
  // The relationship touches join the same activity stream — deletable,
  // because a mis-log from a truck stop must be fixable or the log rots.
  const [touches, setTouches] = useState<AgentContact[]>([]);
  useEffect(() => {
    getAgentContacts()
      .then((all) => setTouches(all.filter((c) => c.agent_id === agentId)))
      .catch(() => {});
  }, [agentId, refreshKey]);
  const removeTouch = async (id: string) => {
    try {
      await deleteAgentContact(id);
      setTouches((prev) => prev.filter((c) => c.contact_id !== id));
    } catch {
      /* row stays — nothing changed server-side */
    }
  };
  const logs = buildTimeline(notes, ratingHistory, touches);
  const agentLoads = [...(loads ?? [])].sort((a, b) =>
    b.pickup_date.localeCompare(a.pickup_date),
  );

  const handleSuccess = () => {
    setRefreshKey((p) => p + 1);
    setShowRatingForm(false);
  };

  const handleAddNote = async () => {
    setNoteError(null);
    if (!noteText.trim() || !noteInitials.trim()) {
      setNoteError("A note and your initials are required");
      return;
    }
    try {
      setSavingNote(true);
      await createAgentNote(agent.agent_id, {
        note: noteText.trim(),
        created_by: noteInitials.trim(),
      });
      setNoteText("");
      setNoteInitials("");
      setRefreshKey((p) => p + 1);
    } catch (e) {
      setNoteError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10 pt-5">
      {showRatingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowRatingForm(false)}
          />
          <div className="relative w-full max-w-[450px] mx-4 max-h-[90vh] bg-panel text-ink overflow-y-auto shadow-xl rounded-xl p-4 sm:p-6 border border-hairline">
            <RatingForm
              agent={agent}
              onSuccess={handleSuccess}
              onClose={() => setShowRatingForm(false)}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-1">
        <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
        <Link to="/agents" className="text-xs text-dim hover:text-ink">← Agents</Link>
      </div>

      <div className="flex flex-col gap-4 mt-3 mb-6 sm:flex-row sm:justify-between sm:items-start">
        <div className="flex gap-4 items-center min-w-0">
          <div className="size-16 rounded-full bg-well border-2 border-amber flex items-center justify-center font-condensed font-semibold text-2xl text-amber-light shrink-0">
            {agent.first_name.charAt(0)}
            {agent.last_name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[27px] tracking-[.05em] leading-none">
              {agent.first_name} {agent.last_name}
            </h1>
            <p className="text-sm text-dim mt-1">
              {agent.broker_name}
              {carrierName ? ` · ${carrierName} Agent` : ""}
            </p>
            {prestige.label && (
              <span className="inline-flex items-center gap-2 mt-1.5">
                <Coin
                  metal={
                    ({ contender: "bronze", "all-star": "silver", champion: "gold", legend: "platinum" } as Record<string, CoinMetal>)[tier] ?? "bronze"
                  }
                  size={22}
                >
                  {agent.first_name.charAt(0)}
                </Coin>
                <span className="text-xs font-condensed font-semibold uppercase tracking-[.1em] text-dim">
                  {prestige.label} agent
                </span>
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <RatingStamp rating={agent.rating} />
          <div className="mt-3">
            <button
              onClick={() => setShowRatingForm(true)}
              className="h-8 px-3.5 rounded-[9px] border border-hairline text-dim hover:text-ink text-sm font-condensed font-semibold"
            >
              Edit rating
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <Kpi label="Loads" value={String(getLoadCount(loads))} />
        <Kpi
          label="Gross revenue"
          value={grossRev == null ? "—" : money(grossRev)}
        />
        <Kpi
          label="Avg rate/mile"
          value={fmtRpm(rpm)}
          valueClass={rpmTextClass(rpm)}
          sub={
            rpm != null && overallTargets.rollingRpm != null
              ? `${rpm >= overallTargets.rollingRpm ? "▲" : "▼"} ${fmtRpm(Math.abs(rpm - overallTargets.rollingRpm))} vs your overall`
              : undefined
          }
        />
        <Kpi label="Cancelled" value={String(getCancelledCount(loads))} />
        <Kpi
          label="Last worked"
          value={lastWorked ? fmtDate(lastWorked) : "Never"}
        />
      </div>

      {(() => {
        const best = loads.reduce<(typeof loads)[number] | null>(
          (b, l) => (!b || loadRevenue(l) > loadRevenue(b) ? l : b),
          null,
        );
        if (!best) return null;
        return (
          <div className="mt-3 px-4 py-2.5 rounded-[9px] flex items-baseline gap-2.5 flex-wrap" style={{ background: "linear-gradient(178deg,#2c3549,#1e2636)", borderTop: "1px solid rgba(255,255,255,.1)", borderBottom: "1.5px solid rgba(0,0,0,.5)" }}>
            <span className="font-forge font-semibold text-[11px] tracking-[.14em] text-amber-hi">BEST LOAD TOGETHER</span>
            <span className="font-condensed font-semibold text-[13.5px] text-ink tabular-nums">
              {money(loadRevenue(best))} · {best.origin_city}, {best.origin_state} → {best.destination_city}, {best.destination_state}
            </span>
            <span className="text-[11px] text-faint">the one to beat</span>
          </div>
        );
      })()}

      <Panel className="p-4 mt-4">
        <p className="text-xs text-dim uppercase tracking-wider mb-3">
          Time on the dock · this agent's freight
        </p>
        <StopScorecard
          score={timeScore}
          countLabel="Loads"
          countValue={getLoadCount(loads)}
        />
        {det.claimable > 0 && (
          <div className="mt-3 pt-3 border-t border-hairline flex items-baseline gap-2 flex-wrap">
            <span
              className="font-condensed text-lg"
              style={{ color: "#f5c37a" }}
            >
              {det.paid} / {det.claimable}
            </span>
            <span className="text-xs text-dim">
              detention loads collected vs claimable
              {det.claimable - det.paid > 0 && (
                <>
                  {" · "}
                  <span style={{ color: "#f2a6a3" }}>
                    {det.claimable - det.paid} held you up with no detention
                    paid
                  </span>
                </>
              )}
            </span>
          </div>
        )}
      </Panel>

      <div className="mt-4">
        <TrophyCase honors={honors} log={season} live={live} />
      </div>

      <Panel className="p-4 mt-4">
        <p className="text-xs text-dim uppercase tracking-wider mb-3">
          Loads with this agent
        </p>
        {agentLoads.length === 0 ? (
          <p className="text-sm text-dim">No loads yet.</p>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-xs text-dim text-left">
                  <th className="font-normal pb-2 pr-4">Load #</th>
                  <th className="font-normal pb-2 pr-4">Status</th>
                  <th className="font-normal pb-2 pr-4">Lane</th>
                  <th className="font-normal pb-2 pr-4">Pickup</th>
                  <th className="font-normal pb-2 pr-4 text-right">Gross</th>
                  <th className="font-normal pb-2">Payment</th>
                </tr>
              </thead>
              <tbody>
                {agentLoads.map((load) => (
                  <tr key={load.load_id} className="border-t ds2-cell-rule">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <Link
                        to={`/loads/${load.load_id}`}
                        className="text-amber-light hover:underline font-medium"
                      >
                        {load.load_number}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">
                      <StatusBadge value={load.load_status} />
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {load.origin_city}, {load.origin_state}{" "}
                      <span className="text-dim">→</span>{" "}
                      {load.destination_city}, {load.destination_state}
                    </td>
                    <td className="py-2 pr-4 text-dim whitespace-nowrap">
                      {fmtDate(load.pickup_date)}
                    </td>
                    <td className="py-2 pr-4 text-right whitespace-nowrap">
                      {money(loadRevenue(load))}
                    </td>
                    <td className="py-2">
                      <StatusBadge value={load.payment_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
        <Panel className="md:col-span-2 p-4">
          <p className="text-xs text-dim uppercase tracking-wider mb-3">
            Activity
          </p>
          <div className="bg-well rounded p-3 mb-4">
            <textarea
              className="bg-well rounded px-2 py-1.5 text-sm w-full text-ink placeholder:text-dim"
              placeholder="Add a note about this agent…"
              rows={2}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="flex items-center gap-2 mt-2">
              <input
                className="bg-well rounded px-2 py-1.5 text-sm w-24 text-ink placeholder:text-dim"
                placeholder="Initials"
                maxLength={5}
                value={noteInitials}
                onChange={(e) => setNoteInitials(e.target.value)}
              />
              <button
                onClick={handleAddNote}
                disabled={savingNote}
                className="ml-auto bg-amber text-steel px-3 py-1.5 rounded text-sm font-semibold disabled:opacity-50"
              >
                {savingNote ? "Saving…" : "Add note"}
              </button>
            </div>
            {noteError && (
              <p className="text-destructive text-sm mt-2">{noteError}</p>
            )}
          </div>

          {logs.length === 0 ? (
            <p className="text-sm text-dim italic px-1 py-2">
              No activity yet
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {logs.map((log) =>
                log.type === "rating" ? (
                  <div
                    key={log.data.id}
                    className="border-l-2 border-l-amber bg-well px-3 py-2 rounded-sm"
                  >
                    <p className="text-sm">
                      <Star size={13} className="inline text-amber -mt-0.5" />{" "}
                      Rating changed{" "}
                      <span className="text-dim">
                        {log.data.old_rating ?? "—"}
                      </span>{" "}
                      →{" "}
                      <span className="text-amber font-semibold">
                        {log.data.new_rating}
                      </span>
                    </p>
                    {log.data.reason && (
                      <p className="text-sm text-dim">
                        {log.data.reason}
                      </p>
                    )}
                    <p className="text-xs text-dim mt-1">
                      {fmtDate(log.timestamp)} · {log.data.changed_by}
                    </p>
                  </div>
                ) : log.type === "touch" ? (
                  <div
                    key={log.data.contact_id}
                    className="border-l-2 px-3 py-2 rounded-sm flex items-start gap-2"
                    style={{
                      borderLeftColor: log.data.direction === "inbound" ? "#6fd08c" : "#4f8cd6",
                      background: "var(--color-well)",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <Phone size={13} className="inline text-dim -mt-0.5" style={{ display: log.data.method === "call" ? undefined : "none" }} />
                        <Mail size={13} className="inline text-dim -mt-0.5" style={{ display: log.data.method === "email" ? undefined : "none" }} />
                        <MessageSquare size={13} className="inline text-dim -mt-0.5" style={{ display: log.data.method === "text" ? undefined : "none" }} />{" "}
                        {log.data.direction === "inbound" ? "They reached out" : "You reached out"} ·{" "}
                        <span className="text-light">{TOUCH_LABEL[log.data.type]}</span>
                      </p>
                      {log.data.note && <p className="text-sm text-dim">{log.data.note}</p>}
                      <p className="text-xs text-dim mt-1">{fmtDate(log.timestamp)}</p>
                    </div>
                    <button
                      className="text-dim hover:text-destructive text-xs mt-0.5"
                      title="delete this touch — mis-logs happen; the metrics recompute"
                      onClick={() => void removeTouch(log.data.contact_id)}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div
                    key={log.data.id}
                    className="border-l-2 border-l-[#3b4660] bg-well/20 px-3 py-2 rounded-sm"
                  >
                    <p className="text-sm">
                      <StickyNote
                        size={13}
                        className="inline text-dim -mt-0.5"
                      />{" "}
                      {log.data.note}
                    </p>
                    <p className="text-xs text-dim mt-1">
                      {fmtDate(log.timestamp)} · {log.data.created_by}
                    </p>
                  </div>
                ),
              )}
            </div>
          )}
        </Panel>

        <Panel className="p-4">
          <p className="text-xs text-dim uppercase tracking-wider mb-3">
            Contact
          </p>
          <p className="text-sm mb-2 break-words">
            <Mail size={14} className="inline text-dim mr-1.5 -mt-0.5" />
            {agent.email || "No email"}
          </p>
          <p className="text-sm mb-3">
            <Phone
              size={14}
              className="inline text-dim mr-1.5 -mt-0.5"
            />
            {agent.phone || "No phone"}
          </p>
          <p className="text-xs text-dim">Preferred</p>
          <p className="text-sm capitalize">{agent.preferred_contact || "—"}</p>
        </Panel>
      </div>
      </div>
    </div>
  );
};

export default AgentDetailPage;
