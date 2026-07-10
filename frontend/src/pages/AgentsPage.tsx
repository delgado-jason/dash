import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAgents } from "@/hooks/useAgents";
import { useLoads } from "@/hooks/useLoads";
import { Kpi } from "@/components/Kpi";
import { AgentCard } from "@/components/agents/AgentCard";
import {
  computeHonors,
  perAgentStats,
  rosterKpis,
} from "@/lib/metrics/agentLeaderboard";

const money0 = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

type SortKey = "rating" | "revenue" | "recent";
const SORTS: [SortKey, string][] = [
  ["rating", "Rating"],
  ["revenue", "Revenue"],
  ["recent", "Recently worked"],
];

const plural = (n: number) => (n !== 1 ? "s" : "");

const AgentsPage = () => {
  const { agents, isLoading, error } = useAgents();
  const { loads, isLoading: loadsLoading } = useLoads(0);

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("rating");

  const honors = useMemo(() => computeHonors(loads ?? []), [loads]);
  const stats = useMemo(() => perAgentStats(loads ?? []), [loads]);
  const kpis = useMemo(
    () => rosterKpis(agents ?? [], loads ?? [], new Date()),
    [agents, loads],
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (agents ?? []).filter(
      (a) =>
        !q ||
        `${a.first_name} ${a.last_name} ${a.broker_name}`
          .toLowerCase()
          .includes(q),
    );
    const rev = (id: string) => stats.get(id)?.revenue ?? 0;
    const worked = (id: string) => stats.get(id)?.lastWorked ?? "";
    // Break rating ties by career achievement so the more decorated agent
    // (e.g. the Champion) leads within a tier.
    const honorScore = (id: string) => {
      const h = honors.get(id);
      return h ? h.gold * 10000 + h.silver * 100 + h.board : 0;
    };
    return [...filtered].sort((a, b) => {
      if (sort === "revenue") return rev(b.agent_id) - rev(a.agent_id);
      if (sort === "recent")
        return worked(b.agent_id).localeCompare(worked(a.agent_id));
      return (
        (b.rating ?? -1) - (a.rating ?? -1) ||
        honorScore(b.agent_id) - honorScore(a.agent_id) ||
        rev(b.agent_id) - rev(a.agent_id)
      );
    });
  }, [agents, stats, honors, search, sort]);

  if (isLoading || loadsLoading)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-muted-text">Loading agents...</p>
      </div>
    );

  if (error)
    return (
      <div className="p-6 bg-iron text-light min-h-screen font-body">
        <p className="text-destructive">{error}</p>
      </div>
    );

  const top = kpis.topEarner
    ? (agents ?? []).find((a) => a.agent_id === kpis.topEarner!.agentId)
    : null;

  return (
    <div className="p-6 bg-iron text-light font-body min-h-screen">
      <div className="flex justify-between items-baseline mb-6">
        <h1 className="text-3xl font-condensed text-light">Agents</h1>
        <Link
          to="/guide"
          className="text-xs text-muted-text hover:text-amber-light"
        >
          How this works →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi
          label="Roster"
          value={String(kpis.total)}
          sub={`${kpis.rated} rated`}
        />
        <Kpi
          label="Go-to bench"
          value={String(kpis.callFirst)}
          valueClass="text-amber"
          sub={`call first · ${kpis.avoid} to avoid`}
        />
        {top ? (
          <Link to={`/agents/${top.agent_id}`}>
            <Kpi
              label="Top earner"
              value={`${top.first_name.charAt(0)}. ${top.last_name}`}
              sub={`${money0(kpis.topEarner!.revenue)} · 90 days`}
            />
          </Link>
        ) : (
          <Kpi label="Top earner" value="—" sub="no delivered loads · 90 days" />
        )}
        <Kpi
          label="Active agents"
          value={String(kpis.activeCount)}
          sub="worked · last 90 days"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4 mb-4">
        <input
          className="bg-plate rounded px-3 py-2 text-sm flex-1 min-w-[180px] text-light placeholder:text-muted-text"
          placeholder="Search name or broker"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex gap-1 bg-plate rounded-lg p-1">
          {SORTS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-2.5 py-1 rounded text-sm ${
                sort === key
                  ? "bg-amber text-steel font-semibold"
                  : "text-muted-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted-text text-sm">
          {(agents ?? []).length === 0
            ? "No agents yet."
            : "No agents match your search."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {shown.map((agent) => (
            <AgentCard
              key={agent.agent_id}
              agent={agent}
              stats={stats.get(agent.agent_id)}
              honors={honors.get(agent.agent_id)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-text mt-6">
        {shown.length} agent{plural(shown.length)}
      </p>
    </div>
  );
};

export default AgentsPage;
