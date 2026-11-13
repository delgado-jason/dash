import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAgents } from "@/hooks/useAgents";
import { useLoads } from "@/hooks/useLoads";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AgentTable } from "@/components/agents/AgentTable";
import { TIER_META } from "@/components/agents/agentDisplay";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildAgentScorecards,
  concentrationAnalytics,
} from "@/lib/metrics/agentScorecard";
import { money } from "@/lib/format";
import { useRateTargets } from "@/hooks/useRateTargets";
import {
  agentByType,
  worthASecondCall,
  bookShape,
  type Book,
  type BookRate,
} from "@/lib/metrics/agentByType";
import { standingOf } from "@/lib/agents/standing";

// ARCHIVED, not parked. A rating says how a desk treats you; archiving says
// the record is not a working contact — "Bad Number", "No longer with
// company", "not the freight decision-maker". Seven of Jason's ten parked
// desks are the second kind, and rating them 1 would be a judgment he never
// made. The COLUMN is still `work_status = 'parked'` because the Foreman and
// the Relationships pages read it; only the word changes, at this boundary.
type Filter =
  | "all"
  | "oversize"
  | "specialty"
  | "standard"
  | "call-first"
  | "second-call"
  | "archived";

const plural = (n: number) => (n !== 1 ? "s" : "");

const AgentsPage = () => {
  const { agents, isLoading, error } = useAgents(0);
  const { loads, isLoading: loadsLoading } = useLoads(0);


  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const now = useMemo(() => new Date(), []);

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

  // Each desk's delivered loads, once, for everything below.
  const loadsByAgent = useMemo(() => {
    const m = new Map<string, typeof loads extends (infer T)[] | null ? T[] : never>();
    for (const l of loads ?? []) {
      if (!l.agent_id) continue;
      const arr = m.get(l.agent_id) ?? [];
      arr.push(l);
      m.set(l.agent_id, arr);
    }
    return m;
  }, [loads]);

  const targets = useRateTargets(loads);
  const ladders = useMemo(
    () => ({ standard: targets.bookingLadder, specialized: targets.specLadder }),
    [targets.bookingLadder, targets.specLadder],
  );

  // A rate per BOOK, each graded against its own rung. ROR is one of his best
  // standard desks and his worst oversize one; pooled into a single column
  // they read the same, which is the bug this fixes.
  const ratesByAgent = useMemo(() => {
    const m = new Map<string, Record<Book, BookRate>>();
    for (const [agentId, ls] of loadsByAgent) m.set(agentId, agentByType(ls, ladders));
    return m;
  }, [loadsByAgent, ladders]);

  const secondCall = useMemo(
    () => new Map(worthASecondCall(loadsByAgent, ladders).map((s) => [s.agentId, s])),
    [loadsByAgent, ladders],
  );

  const shape = useMemo(() => bookShape(loadsByAgent), [loadsByAgent]);

  const counts = useMemo(() => {
    const c = {
      all: 0,
      oversize: 0,
      specialty: 0,
      standard: 0,
      "call-first": 0,
      "second-call": 0,
      archived: 0,
    };
    for (const a of agents ?? []) {
      const card = scorecards.get(a.agent_id);
      if (!card) continue;
      // Archived desks are counted on their own chip and nowhere else — the
      // headline count should be desks you could actually ring.
      if (standingOf(a) === "parked") {
        c.archived += 1;
        continue;
      }
      c.all += 1;
      c[card.specialty.tag] += 1;
      if (card.tier === "call-first") c["call-first"] += 1;
      if (secondCall.has(a.agent_id)) c["second-call"] += 1;
    }
    return c;
  }, [agents, scorecards, secondCall]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (agents ?? [])
      .map((a) => ({ agent: a, card: scorecards.get(a.agent_id)! }))
      .filter(({ agent, card }) => {
        if (!card) return false;
        if (
          q &&
          !`${agent.first_name} ${agent.last_name} ${agent.posting_code ?? ""} ${agent.agency_code ?? ""}`
            .toLowerCase()
            .includes(q)
        )
          return false;
        // Archived desks are out of every view but their own. They are not
        // bad desks — most are a dead number or the wrong person — they are
        // simply not callable, and a list you scan to decide who to ring
        // should not carry them.
        const archived = standingOf(agent) === "parked";
        if (filter === "archived") return archived;
        if (archived) return false;
        if (filter === "oversize" || filter === "specialty" || filter === "standard")
          return card.specialty.tag === filter;
        if (filter === "call-first") return card.tier === "call-first";
        if (filter === "second-call") return secondCall.has(agent.agent_id);
        return true;
      })
      .sort(
        (a, b) =>
          TIER_META[b.card.tier].rank - TIER_META[a.card.tier].rank ||
          b.card.revenue - a.card.revenue,
      );
  }, [agents, scorecards, search, filter, secondCall]);

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
    ["second-call", "Worth a second call", counts["second-call"]],
    ["archived", "Archived", counts.archived],
  ];

  // The answering line — whatever the filters show, summed live. The revenue
  // figure is LIFETIME delivered gross (card.revenue has no date window), and
  // the label says so. Story KPIs
  // (rate leader, concentration, going cold) live on the dashboard Agents tab.
  const revLifetime = rows.reduce((sum, r) => sum + (r.card.revenue || 0), 0);

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
      <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
        <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
        <h1 className="font-display text-[28px] tracking-[.06em] leading-none">AGENTS</h1>
        <span className="flex-1" />
        <Link to="/guide" className="text-xs text-dim hover:text-amber-light">
          How this works →
        </Link>
      </div>

      {/* WHAT THE BOOK ACTUALLY IS. It used to open "8 agents · $549,459
          delivered through them", which reads like a customer base. It is a
          long tail: 45 of 56 desks gave exactly one load and those one-offs
          are 54% of the revenue. Knowing that changes what you do here. */}
      <div className="flex items-baseline gap-2.5 flex-wrap mt-4 px-0.5">
        <span className="font-condensed font-semibold text-[24px] tabular-nums">
          {rows.length} desk{plural(rows.length)}
        </span>
        <span className="text-[13px] text-faint">in this view ·</span>
        <b className="font-condensed font-semibold text-ink tabular-nums">
          {money(revLifetime)} delivered · lifetime
        </b>

      </div>
      {shape.oneLoadDesks > 0 && (
        <p className="text-[13px] text-faint mt-1 px-0.5 font-condensed">
          Your whole book: {shape.desks} desks · {shape.loads} loads ·{" "}
          <b className="text-amber-hi">
            {shape.oneLoadDesks} of them one load each
          </b>
          {shape.oneLoadShare != null && (
            <>
              , carrying {Math.round(shape.oneLoadShare * 100)}% of the revenue
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 mt-5 mb-4">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map(([key, label, n]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[13px] font-condensed font-semibold rounded-full px-3 py-1.5 border transition-colors ${
                filter === key
                  ? "bg-amber border-amber text-canvas"
                  : "border-hairline text-dim hover:text-ink"
              }`}
            >
              {label} <span className="opacity-70">{n}</span>
            </button>
          ))}
        </div>

      </div>

      <input
        className="h-9 rounded-[10px] px-3.5 text-sm w-full max-w-md text-ink placeholder:text-faint bg-well border-0 mb-4" style={{ boxShadow: "var(--shadow-inset)" }}
        placeholder="Search name or code"
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
      ) : (
        /* ONE VIEW. There were two renderings of the same rows behind a
           toggle, which meant every fact had to be built twice — and when it
           is built twice it disagrees: the table called a parked desk
           ★★☆☆☆ while the cards called her PARKED, one click apart. The
           table wins because it is the only one that can hold two rate
           columns; it inherits the standing the cards were carrying. */
        <AgentTable
          rows={rows}
          shareByAgent={shareByAgent}
          ratesByAgent={ratesByAgent}
          secondCall={secondCall}
        />
      )}

      <p className="text-xs text-dim mt-6">
        {rows.length} desk{plural(rows.length)}
        {filter !== "all" ? ` · ${filter}` : ""}
      </p>
      </div>
    </div>
  );
};

export default AgentsPage;
