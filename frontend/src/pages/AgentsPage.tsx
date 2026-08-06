import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAgents } from "@/hooks/useAgents";
import { useLoads } from "@/hooks/useLoads";
import { Kpi } from "@/components/Kpi";
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
  agentRosterAnalytics,
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
  const roster = useMemo(() => agentRosterAnalytics(scorecards), [scorecards]);

  const byId = useMemo(
    () => new Map((agents ?? []).map((a) => [a.agent_id, a])),
    [agents],
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
      <div className="p-6 bg-iron text-light min-h-screen font-body">
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
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  const rateLeader = roster.rateLeader ? byId.get(roster.rateLeader.agentId) : null;
  const cold = roster.goingCold ? byId.get(roster.goingCold.agentId) : null;

  const CHIPS: [Filter, string, number][] = [
    ["all", "All", counts.all],
    ["oversize", "Oversize", counts.oversize],
    ["specialty", "Specialty", counts.specialty],
    ["standard", "Standard", counts.standard],
    ["call-first", "Top pick", counts["call-first"]],
    ["cold", "Cold", counts.cold],
  ];

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-baseline mb-6">
        <h1 className="text-3xl font-condensed text-light">Agents</h1>
        <Link to="/guide" className="text-xs text-muted-text hover:text-amber-light">
          How this works →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {rateLeader && roster.rateLeader ? (
          <Link to={`/agents/${rateLeader.agent_id}`}>
            <Kpi
              label="Rate leader"
              value={fmtRpm(roster.rateLeader.medianRpm)}
              valueClass="text-status-good-text"
              sub={`${rateLeader.first_name.charAt(0)}. ${rateLeader.last_name} · $/mi`}
            />
          </Link>
        ) : (
          <Kpi label="Rate leader" value="—" sub="need 2+ loads" />
        )}
        <Kpi
          label="Oversize bench"
          value={String(roster.oversizeBench)}
          valueClass="text-amber"
          sub={`specialists · ${roster.specCapable} spec-capable`}
        />
        <Kpi
          label="Concentration"
          value={roster.concentrationPct != null ? `${Math.round(roster.concentrationPct * 100)}%` : "—"}
          sub="top 3 of your revenue"
        />
        {cold && roster.goingCold ? (
          <Link to={`/agents/${cold.agent_id}`}>
            <Kpi
              label="Going cold"
              value={`${cold.first_name.charAt(0)}. ${cold.last_name}`}
              valueClass="text-amber"
              sub={`${money(roster.goingCold.revenue)} · ${roster.goingCold.daysSince}d quiet`}
            />
          </Link>
        ) : (
          <Kpi label="Going cold" value="—" sub="all recently active" />
        )}
        <Kpi label="Roster" value={String(counts.all)} sub={`${roster.oversizeBench + counts.specialty} specialty`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-5 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="text-[11.5px] rounded-full px-2.5 py-1 border transition-colors"
              style={
                filter === key
                  ? { background: "#e8940a", borderColor: "#e8940a", color: "#12151b", fontWeight: 700 }
                  : { borderColor: "#2a3347", color: "#9aa4b5" }
              }
            >
              {label} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-plate rounded-lg p-1">
          {(["table", "cards"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1 rounded text-sm capitalize ${
                view === v ? "bg-steel text-light font-semibold" : "text-muted-text"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <input
        className="bg-plate rounded px-3 py-2 text-sm w-full max-w-md text-light placeholder:text-muted-text mb-4"
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
          <p className="text-muted-text text-sm">No agents match.</p>
        )
      ) : view === "table" ? (
        <AgentTable rows={rows} />
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

      <p className="text-xs text-muted-text mt-6">
        {rows.length} agent{plural(rows.length)}
        {filter !== "all" ? ` · ${filter}` : ""}
      </p>
    </div>
  );
};

export default AgentsPage;
