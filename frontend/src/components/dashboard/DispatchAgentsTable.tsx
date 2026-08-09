import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import type { Load } from "@/types/load";
import { Panel } from "@/components/ui/Panel";
import { getAgentGrossTable } from "@/lib/metrics/dashboard";

const PAGE = 10;
const MEDAL = ["🥇", "🥈", "🥉"];

type Sort = "gross" | "loads" | "name";

const fmtK = (n: number): string => `$${(n / 1000).toFixed(1)}k`;

export const DispatchAgentsTable = ({ loads }: { loads: Load[] }) => {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("gross");
  const [page, setPage] = useState(0);

  useEffect(() => setPage(0), [search, sort]);

  // Gross-ranked directory of every agent with a delivered load.
  const table = useMemo(() => getAgentGrossTable(loads), [loads]);
  const leader = table[0];

  const sorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = table.filter((a) => !q || a.agent.toLowerCase().includes(q));
    const by =
      sort === "loads"
        ? (a: typeof rows[number], b: typeof rows[number]) =>
            b.loadCount - a.loadCount || b.revenue - a.revenue
        : sort === "name"
          ? (a: typeof rows[number], b: typeof rows[number]) =>
              a.agent.localeCompare(b.agent)
          : (a: typeof rows[number], b: typeof rows[number]) =>
              b.revenue - a.revenue;
    return [...rows].sort(by);
  }, [table, search, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE));
  const clamped = Math.min(page, pages - 1);
  const start = clamped * PAGE;
  const shown = sorted.slice(start, start + PAGE);

  // Medals only read as a rank when the list is gross-sorted from the top.
  const rankMark = (idx: number): string =>
    sort === "gross" && idx < 3 ? MEDAL[idx] : String(idx + 1);

  const SortHead = ({ label, col, align }: { label: string; col: Sort; align?: string }) => (
    <button
      onClick={() => setSort(col)}
      className={`uppercase tracking-wide ${align ?? ""}`}
      style={{ color: sort === col ? "var(--color-amber-hi)" : undefined }}
    >
      {label}
      {sort === col ? " ▾" : ""}
    </button>
  );

  return (
    <Panel className="p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-forge font-bold text-lg" style={{ color: "var(--color-amber-hi)" }}>
          AGENTS
        </span>
      </div>

      <div className="flex items-center gap-2 bg-[#141a26] border border-[#2a3347] rounded-md px-2.5 py-1.5 mb-2.5">
        <Search size={13} className="text-dim shrink-0" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agent name"
          className="bg-transparent outline-none text-sm text-ink placeholder:text-dim w-full"
        />
      </div>

      {leader && (
        <Link
          to={`/agents/${leader.agentId}`}
          className="block rounded-lg px-2.5 py-1.5 mb-2.5 hover:opacity-90"
          style={{ background: "#241a0d", border: "1px solid #7a4718" }}
        >
          <div className="flex items-center justify-between">
            <span
              className="text-[10px] flex items-center gap-1"
              style={{ color: "var(--color-amber-hi)" }}
            >
              <Trophy size={11} /> TOP BY GROSS
            </span>
            <span className="text-[10px] text-dim">
              {leader.loadCount} loads
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span
              className="font-forge font-bold text-base truncate"
              style={{ color: "var(--color-amber-hi)" }}
            >
              {leader.agent}
            </span>
            <span className="font-forge font-bold text-base" style={{ color: "var(--color-amber-hi)" }}>
              {fmtK(leader.revenue)}
            </span>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-[22px_1fr_40px_52px] text-[10px] text-dim px-1 pb-1.5 border-b border-steel">
        <span>#</span>
        <SortHead label="Agent" col="name" />
        <SortHead label="Loads" col="loads" align="text-right" />
        <SortHead label="Gross" col="gross" align="text-right" />
      </div>

      {shown.length === 0 ? (
        <p className="text-dim text-sm py-4 text-center">
          No agents match.
        </p>
      ) : (
        shown.map((a, i) => (
          <Link
            key={a.agentId}
            to={`/agents/${a.agentId}`}
            className="grid grid-cols-[22px_1fr_40px_52px] items-center text-[11px] py-1.5 px-1 border-b border-[#202838] last:border-b-0 hover:opacity-80"
          >
            <span>{rankMark(start + i)}</span>
            <span className="text-ink truncate underline">{a.agent}</span>
            <span className="text-right text-dim">{a.loadCount}</span>
            <span className="text-right" style={{ color: "#cdd8e8" }}>
              {fmtK(a.revenue)}
            </span>
          </Link>
        ))
      )}

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[11px] text-dim">
          {sorted.length === 0
            ? "0 agents"
            : `${start + 1}–${start + shown.length} of ${sorted.length}`}
        </span>
        <div className="flex gap-1.5">
          <button
            onClick={() => setPage(clamped - 1)}
            disabled={clamped === 0}
            className="w-6 h-5 rounded flex items-center justify-center disabled:opacity-30"
            style={{ background: "#232c3f", color: "#cdd8e8" }}
            aria-label="Previous page"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={() => setPage(clamped + 1)}
            disabled={clamped >= pages - 1}
            className="w-6 h-5 rounded flex items-center justify-center disabled:opacity-30"
            style={{ background: "#232c3f", color: "#cdd8e8" }}
            aria-label="Next page"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </Panel>
  );
};
