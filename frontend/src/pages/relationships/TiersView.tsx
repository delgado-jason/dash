import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import type { Agent } from "@/types/agent";
import type { Load } from "@/types/load";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import { rpm as fmtRpm } from "@/lib/format";
import { originMarketsByAgent } from "@/lib/metrics/agentTouches";
import type { AgentContact } from "@/services/agentContactsService";
import { partitionBook, bucketOf, type Bucket, type BookCtx, type BookSort } from "@/lib/relationships/buckets";
import { agentAllInRpm, deliveredCount, lastLoadKey } from "@/lib/relationships/agentRpm";
import { daysSinceMeaningful, lastMeaningfulContact } from "@/lib/relationships/meaningfulContact";
import { ESTABLISHED_AT, isEstablished, suggestBucket, suggestionLabel, type BucketSuggestion } from "@/lib/relationships/tierSuggestion";
import { keyOf, shortDate } from "@/lib/relationships/dayKeys";
import { AgentRow, type RowChip } from "@/components/relationships/AgentRow";
import { SectionHead } from "@/components/relationships/primitives";
import { nameOf } from "@/lib/relationships/nameOf";
import { useRelationships } from "./context";

// TIERS — the book graded the v2.0 way (the nodded mock): one Board, five
// shelves in order, one row per agent, one chip per row. Rows sit in their
// CURRENT bucket; the suggestion is a chip and a count in the head, never a
// move (decision 8).

const SORT_TABS: { value: BookSort; label: string }[] = [
  { value: "loads", label: "Loads" },
  { value: "quiet", label: "Quiet longest" },
  { value: "name", label: "Name" },
];
const PROSPECTS_FOLD = 6;

interface RowModel {
  agent: Agent;
  bucket: Bucket;
  dormant: boolean;
  delivered: number;
  suggestion: BucketSuggestion;
  chip: RowChip | null;
  context: string;
  daysSince: number | null | undefined; // undefined = loads didn't come through → "—"
  market: string | null;
  loadsCell: string | null;
}

const SOURCE_WORD: Record<string, string> = {
  load_board: "load board",
  referral: "referral",
  directory: "directory",
  saw_freight: "saw their freight",
  other: "other",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Every fact a row shows, computed once per agent per render of the book.
// With the loads slice missing (loadsReady false) nothing loads-derived is
// claimed — no suggestion or progress chip, no RPM or loads cell, "—" for the
// days since contact, no dormancy verdict. Only the owner's explicit calls (a
// tier, a park) still read as facts; the warn line above says why.
const buildRow = (
  agent: Agent,
  loads: Load[],
  contacts: AgentContact[],
  ladder: RateLadder | null,
  now: Date,
  markets: Map<string, { city: string; state: string; n: number }[]>,
  loadsReady: boolean,
): RowModel => {
  const ctx: BookCtx = { loads, contacts, now, loadsReady };
  const bucket = bucketOf(agent, ctx);
  const explicitlyParked = agent.work_status === "parked";
  const dormant = bucket === "parked" && !explicitlyParked;
  const delivered = loadsReady ? deliveredCount(loads, agent.agent_id) : 0;
  const rpm = loadsReady ? agentAllInRpm(loads, agent.agent_id, now) : null;
  const suggestion: BucketSuggestion = loadsReady
    ? suggestBucket(agent, { deliveredCount: delivered, rpm: rpm?.rpm ?? null, ladder, dormant })
    : null;
  const daysSince = loadsReady ? daysSinceMeaningful(agent.agent_id, contacts, loads, now) : undefined;
  const top = loadsReady ? markets.get(agent.agent_id)?.[0] : undefined;
  const place = top ? `${top.city}, ${top.state}` : agent.agent_city ? `${agent.agent_city}${agent.agent_state ? `, ${agent.agent_state}` : ""}` : null;
  const lastLoad = loadsReady ? lastLoadKey(loads, agent.agent_id) : null;
  const rpmText = rpm?.rpm != null ? `${fmtRpm(rpm.rpm)} all-in${rpm.partial ? "*" : ""}` : null;

  // Exactly ONE chip, by precedence.
  let chip: RowChip | null = null;
  if (bucket === "parked") chip = { kind: "parked", label: "Parked" };
  else if (!loadsReady) chip = null;
  else if (isEstablished(delivered) && suggestion === "below") chip = { kind: "losing", label: "Losing money" };
  else if (bucket !== "prospect" && suggestion && suggestion !== "below" && suggestion !== "parked" && suggestion !== bucket)
    chip = { kind: "suggest", label: `Suggest → ${suggestionLabel(suggestion)}` };
  else if (bucket === "prospect" && isEstablished(delivered) && suggestion && suggestion !== "prospect" && suggestion !== "parked")
    chip = { kind: "suggest", label: `Suggest → ${suggestionLabel(suggestion)}` };
  // Only a prospect still short of the gate wears its progress. An established
  // agent with no suggestion (ladder not ready, no in-window miles) sits in
  // NEEDS A TIER with no chip — never "5 of 3 loads".
  else if (bucket === "prospect" && !isEstablished(delivered))
    chip = delivered > 0 ? { kind: "progress", label: `${delivered} of ${ESTABLISHED_AT} loads` } : { kind: "never", label: "Never ran" };

  // Line 2 — at most three facts.
  let context: string;
  if (explicitlyParked) {
    // No date: updated_at moves with every PATCH and there is no parked_at.
    context = `parked — ${agent.park_reason?.trim() || "no reason recorded"}`;
  } else if (dormant) {
    const lastTwoWay = lastMeaningfulContact(agent.agent_id, contacts, loads);
    const since = lastTwoWay ?? lastLoad ?? (agent.created_at ? keyOf(agent.created_at) : null);
    context = `dormant since ${shortDate(since) ?? "—"} — ${delivered === 0 ? "never ran" : plural(delivered, "load")}, ${
      lastTwoWay ? `last touch ${shortDate(lastTwoWay)}` : "never a touch"
    }`;
  } else {
    const facts = [
      delivered > 0 ? plural(delivered, "load") : null,
      rpmText,
      place,
      lastLoad ? `last load ${shortDate(lastLoad)}` : null,
    ].filter((f): f is string => f != null);
    if (facts.length === 0) {
      facts.push(agent.source ? `via ${SOURCE_WORD[agent.source] ?? agent.source}` : "new prospect");
      if (agent.created_at) facts.push(`added ${shortDate(keyOf(agent.created_at))}`);
    }
    context = facts.slice(0, 3).join(" · ");
  }

  return {
    agent,
    bucket,
    dormant,
    delivered,
    suggestion,
    chip,
    context,
    daysSince,
    market: place,
    loadsCell: delivered > 0 ? `${delivered} · ${rpm?.rpm != null ? fmtRpm(rpm.rpm) : "—"}` : null,
  };
};

const matches = (a: Agent, q: string) =>
  nameOf(a).toLowerCase().includes(q) || (a.broker_name ?? "").toLowerCase().includes(q);

const Rows = ({ rows, dimmed, onOpen }: { rows: RowModel[]; dimmed?: boolean; onOpen: (id: string) => void }) => (
  <>
    {rows.map((r) => (
      <AgentRow
        key={r.agent.agent_id}
        agent={r.agent}
        chip={r.chip}
        context={r.context}
        daysSince={r.daysSince}
        market={r.market}
        loadsCell={r.loadsCell}
        dimmed={dimmed}
        onOpen={() => onOpen(r.agent.agent_id)}
      />
    ))}
  </>
);

const TiersView = () => {
  const { agents, loads, contacts, ladder, now, openAgent, loadsReady } = useRelationships();
  // ?q= prefills the search — Today's hygiene line links here by name.
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState<BookSort | null>(null); // null = the default shelf order
  const [showProspects, setShowProspects] = useState(false);
  const [showParked, setShowParked] = useState(false);

  const markets = useMemo(() => originMarketsByAgent(loads), [loads]);
  const rows = useMemo(() => {
    const m = new Map<string, RowModel>();
    for (const a of agents) m.set(a.agent_id, buildRow(a, loads, contacts, ladder, now, markets, loadsReady));
    return m;
  }, [agents, loads, contacts, ladder, now, markets, loadsReady]);

  const book = useMemo(
    () => partitionBook(agents, { loads, contacts, now, loadsReady }, sort ?? undefined),
    [agents, loads, contacts, now, loadsReady, sort],
  );

  // "k suggested in" — agents shelved elsewhere whose suggestion is this tier.
  const suggestedIn = useMemo(() => {
    const k = { tier1: 0, tier2: 0, tier3: 0 };
    for (const r of rows.values()) {
      if (r.bucket === "parked" || r.suggestion == null) continue;
      if ((r.suggestion === "tier1" || r.suggestion === "tier2" || r.suggestion === "tier3") && r.suggestion !== r.bucket) k[r.suggestion]++;
    }
    return k;
  }, [rows]);

  const q = query.trim().toLowerCase();
  const pick = (list: Agent[]) => list.filter((a) => !q || matches(a, q)).map((a) => rows.get(a.agent_id)!);
  const tier1 = pick(book.tier1);
  const tier2 = pick(book.tier2);
  const tier3 = pick(book.tier3);
  const needsTier = pick(book.needsTier);
  const prospects = pick(book.prospects);
  const parked = pick(book.parked);
  const searching = q.length > 0;

  const prospectsShown = searching || showProspects ? prospects : prospects.slice(0, PROSPECTS_FOLD);
  const prospectsHidden = prospects.length - prospectsShown.length;
  const neverRan = prospects.filter((r) => r.delivered === 0).length;
  const parkedByYou = parked.filter((r) => !r.dormant).length;

  const tierHead = (label: string, sub: string, n: number, k: number) =>
    `${label} · ${sub} · ${n}${k > 0 ? ` · ${k} suggested in` : ""}`;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
        <div className="relative flex-1 min-w-[220px] max-w-[420px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="name or code"
            aria-label="Search the book"
            className="ds-input pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-faint font-condensed">Sort</span>
          <SegmentedTabs tabs={SORT_TABS} value={sort ?? "loads"} onChange={setSort} size="sm" ariaLabel="Sort" />
        </div>
      </div>

      <div className="ds2-board overflow-hidden">
        {(tier1.length > 0 || suggestedIn.tier1 > 0) && (
          <>
            <SectionHead>{tierHead("Tier 1", "top RPM", tier1.length, suggestedIn.tier1)}</SectionHead>
            <Rows rows={tier1} onOpen={openAgent} />
          </>
        )}
        {(tier2.length > 0 || suggestedIn.tier2 > 0) && (
          <>
            <SectionHead>{tierHead("Tier 2", "mid RPM", tier2.length, suggestedIn.tier2)}</SectionHead>
            <Rows rows={tier2} onOpen={openAgent} />
          </>
        )}
        {(tier3.length > 0 || suggestedIn.tier3 > 0) && (
          <>
            <SectionHead>{tierHead("Tier 3", "lower RPM", tier3.length, suggestedIn.tier3)}</SectionHead>
            <Rows rows={tier3} onOpen={openAgent} />
          </>
        )}
        {needsTier.length > 0 && (
          <>
            <SectionHead>Needs a tier · {needsTier.length}</SectionHead>
            <Rows rows={needsTier} onOpen={openAgent} />
          </>
        )}

        {(prospects.length > 0 || !searching) && (
          <>
            <SectionHead>Prospects · {prospects.length} · courting · graduate at three loads</SectionHead>
            {prospects.length === 0 ? (
              <p className="px-3.5 pb-4 pt-1 font-condensed text-[13.5px] text-dim">No prospects yet — + Prospect above</p>
            ) : (
              <>
                <Rows rows={prospectsShown} onOpen={openAgent} />
                {prospectsHidden > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowProspects(true)}
                    className="w-full text-left px-3.5 py-3 border-t border-hairline-lo font-condensed font-semibold text-[13px] text-amber-hi hover:text-hot"
                  >
                    {prospectsHidden} more{loadsReady ? ` · ${neverRan} never ran` : ""} · sorted by loads, then last contact
                  </button>
                )}
                {showProspects && !searching && prospects.length > PROSPECTS_FOLD && (
                  <button
                    type="button"
                    onClick={() => setShowProspects(false)}
                    className="w-full text-left px-3.5 py-2.5 border-t border-hairline-lo font-condensed text-[12px] text-faint hover:text-ink"
                  >
                    show fewer
                  </button>
                )}
              </>
            )}
          </>
        )}

        {parked.length > 0 && (
          <div className="opacity-70">
            <SectionHead
              right={
                !searching ? (
                  <button type="button" onClick={() => setShowParked((v) => !v)} className="hover:text-hot">
                    {showParked ? "hide" : "show"}
                  </button>
                ) : undefined
              }
            >
              Parked · {parked.length} · hidden — foreman within 75 mi, or search
            </SectionHead>
            {searching || showParked ? (
              <Rows rows={parked} dimmed onOpen={openAgent} />
            ) : (
              <p className="px-3.5 pb-3.5 pt-0.5 font-condensed text-[13px] text-dim">
                {parked.length} parked — {parkedByYou} by you
                {loadsReady ? `, ${parked.length - parkedByYou} dormant (nothing two-way in 180 days)` : ""}
              </p>
            )}
          </div>
        )}
      </div>

      <p className="mt-3 font-condensed text-[11.5px] text-faint max-w-xl leading-snug">
        Tiers hold established agents — three or more delivered loads — graded by all-in RPM against the live rate
        ladder. A row's chip is dash's suggestion; nothing moves until the owner approves it in the sheet. * = a
        load with no deadhead logged counted loaded miles only.
      </p>
    </div>
  );
};

export default TiersView;
