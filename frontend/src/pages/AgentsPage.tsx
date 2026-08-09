import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAgents } from "@/hooks/useAgents";
import { useLoads } from "@/hooks/useLoads";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AgentCard } from "@/components/agents/AgentCard";
import { AgentTable } from "@/components/agents/AgentTable";
import { TIER_META } from "@/components/agents/agentDisplay";
import { useCarrierName } from "@/hooks/useCarrierName";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  computeHonors,
  perAgentStats,
  currentQuarterStandings,
} from "@/lib/metrics/agentLeaderboard";
import {
  buildAgentScorecards,
  concentrationAnalytics,
} from "@/lib/metrics/agentScorecard";
import { money, rpm as fmtRpm } from "@/lib/format";

type Filter = "all" | "oversize" | "specialty" | "standard" | "call-first" | "cold";

const plural = (n: number) => (n !== 1 ? "s" : "");

const AgentsPage = () => {
  const { agents, isLoading, error } = useAgents();
  const { loads, isLoading: loadsLoading } = useLoads(0);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<"table" | "cards">("table");
  const carrierName = useCarrierName();
  const now = useMemo(() => new Date(), []);

  const honors = useMemo(() => computeHonors(loads ?? [], now), [loads, now]);
  const stats = useMemo(() => perAgentStats(loads ?? []), [loads]);
  const standings = useMemo(() => currentQuarterStandings(loads ?? [], now), [loads, now]);
  const scorecards = useMemo(
    () => buildAgentScorecards(agents ?? [], loads ?? [], now),
    [agents, loads, now],
  );
  // Concentration is WINDOWED (recent 90d) so a cold agent isn't counted as a
  // current dependency; per-agent shares feed the table's "% book" column.
  const conc = useMemo(() => concentrationAnalytics(loads ?? [], now), [loads, now]);
  const shareByAgent = useMemo(
    () => new Map(conc.shares.map((s) => [s.agentId, s.share])),
    [conc],
  );

  const counts = useMemo(() => {
    const c = { all: 0, oversize: 0, specialty: 0, standard: 0, "call-first": 0, cold: 0 };
    for (const card of scorecards.values()) {
      c.all += 1;
      c[card.specialty.tag] += 1;
      if (card.tier === "call-first") c["call-first"] += 1;
      if (card.tier === "cold") c.cold += 1;
    }
    return c;
  }, [scorecards]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (agents ?? [])
      .map((a) => ({ agent: a, card: scorecards.get(a.agent_id)! }))
      .filter(({ agent, card }) => {
        if (!card) return false;
        if (
          q &&
          !`${agent.first_name} ${agent.last_name} ${agent.broker_name}`
            .toLowerCase()
            .includes(q)
        )
          return false;
        if (filter === "oversize" || filter === "specialty" || filter === "standard")
          return card.specialty.tag === filter;
        if (filter === "call-first") return card.tier === "call-first";
        if (filter === "cold") return card.tier === "cold";
        return true;
      })
      .sort(
        (a, b) =>
          TIER_META[b.card.tier].rank - TIER_META[a.card.tier].rank ||
          b.card.revenue - a.card.revenue,
      );
  }, [agents, scorecards, search, filter]);

  if (isLoading || loadsLoading)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-10 w-full max-w-md mb-6" style={{ borderRadius: 10 }} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32" style={{ borderRadius: 13 }} />
          ))}
        </div>
      </div>
    );

  if (error)
    return (
      <div className="p-6 text-ink min-h-screen font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  const CHIPS: [Filter, string, number][] = [
    ["all", "All", counts.all],
    ["oversize", "Oversize", counts.oversize],
    ["specialty", "Specialty", counts.specialty],
    ["standard", "Standard", counts.standard],
    ["call-first", "Top pick", counts["call-first"]],
    ["cold", "Cold", counts.cold],
  ];

  // The answering line — whatever the filters show, summed live. Story KPIs
  // (rate leader, concentration, going cold) live on the dashboard Agents tab.
  const rev90 = rows.reduce((sum, r) => sum + (r.card.revenue || 0), 0);
  const medians = rows
    .map((r) => r.card.medianRpm)
    .filter((v): v is number => v != null)
    .sort((x, y) => x - y);
  const medOfMed =
    medians.length === 0
      ? null
      : medians.length % 2
        ? medians[Math.floor(medians.length / 2)]
        : (medians[medians.length / 2 - 1] + medians[medians.length / 2]) / 2;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
      <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
        <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
        <h1 className="font-display text-[26px] tracking-[.06em] leading-none">AGENTS</h1>
        <span className="flex-1" />
        <Link to="/guide" className="text-xs text-dim hover:text-amber-light">
          How this works →
        </Link>
      </div>

      <div className="flex items-baseline gap-2.5 flex-wrap mt-4 px-0.5">
        <span className="font-display text-[22px] tracking-[.03em] tabular-nums">
          {rows.length} agent{plural(rows.length)}
        </span>
        <span className="text-[12px] text-faint">in this view ·</span>
        <b className="font-condensed font-semibold text-ink tabular-nums">{money(rev90)} through them · 90d</b>
        {medOfMed != null && (
          <>
            <span className="text-[12px] text-faint">·</span>
            <b className="font-condensed font-semibold text-status-positive-text tabular-nums">{fmtRpm(medOfMed)}/mi median</b>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-5 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[12px] font-condensed font-semibold rounded-full px-3 py-1.5 border transition-colors ${
                filter === key
                  ? "bg-amber border-amber text-canvas"
                  : "border-hairline text-dim hover:text-ink"
              }`}
            >
              {label} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-0.5 bg-well rounded-[9px] p-1" style={{ boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)" }}>
          {(["table", "cards"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1 rounded-md text-[12.5px] font-condensed font-semibold capitalize ${
                view === v ? "bg-amber text-canvas" : "text-dim hover:text-ink"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <input
        className="h-9 rounded-[10px] px-3.5 text-sm w-full max-w-md text-ink placeholder:text-faint bg-well border-0 mb-4" style={{ boxShadow: "inset 0 2px 5px rgba(0,0,0,.55)" }}
        placeholder="Search name or broker"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {rows.length === 0 ? (
        (agents ?? []).length === 0 ? (
          <EmptyState
            title="No agents yet"
            hint="Add an agent to track who books your freight and how they pay."
          />
        ) : (
          <p className="text-dim text-sm">No agents match.</p>
        )
      ) : view === "table" ? (
        <AgentTable rows={rows} shareByAgent={shareByAgent} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(({ agent, card }) => (
            <AgentCard
              key={agent.agent_id}
              agent={agent}
              stats={stats.get(agent.agent_id)}
              honors={honors.get(agent.agent_id)}
              live={standings.get(agent.agent_id)}
              card={card}
              carrierName={carrierName}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-dim mt-6">
        {rows.length} agent{plural(rows.length)}
        {filter !== "all" ? ` · ${filter}` : ""}
      </p>
      </div>
    </div>
  );
};

export default AgentsPage;
