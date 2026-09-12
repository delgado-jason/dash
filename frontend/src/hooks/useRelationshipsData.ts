import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent } from "@/types/agent";
import type { Broker } from "@/types/broker";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { getAgents } from "@/services/agentsService";
import { getBrokers } from "@/services/brokersService";
import { getAgentContacts, type AgentContact } from "@/services/agentContactsService";
import { getAgentCoverage, type AgentCoverage } from "@/services/agentCoverageService";

// Everything the Relationships surface reads, fetched once in the layout and
// handed to the views through the outlet context. Each slice fails on its
// own: a missing coverage list degrades the sheet's Markets, a failed loads
// fetch shows a warn line and flips `loadsReady` off so the views withhold
// every loads-derived fact — never confident zeros.

export interface SliceErrors {
  agents?: string;
  contacts?: string;
  brokers?: string;
}

const messageOf = (r: PromiseSettledResult<unknown>, fallback: string): string | undefined =>
  r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : fallback) : undefined;

// The four reads, settled independently — pure I/O, no React state, so the
// mount effect can call it and set state only in the promise callback.
const fetchBook = () =>
  Promise.allSettled([
    getAgents(),
    getAgentContacts(),
    getBrokers(),
    getAgentCoverage(), // never rejects — degrades to []
  ]);
type BookResults = Awaited<ReturnType<typeof fetchBook>>;

export const useRelationshipsData = () => {
  const [loadsKey, setLoadsKey] = useState(0);
  // isFetching, not isLoading: a retry after a failure must read as loading
  // again, or the book would show the stale empty list as fact meanwhile.
  const { loads, isFetching: loadsLoading, error: loadsError } = useLoads(loadsKey);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [contacts, setContacts] = useState<AgentContact[]>([]);
  const [coverage, setCoverage] = useState<AgentCoverage[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<SliceErrors>({});
  // The clock the views compute against — refreshed with every reload so a
  // tab left open does not keep yesterday's "days since".
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());

  const applyBook = useCallback(([a, c, b, cov]: BookResults) => {
    if (a.status === "fulfilled") setAgents(a.value);
    if (c.status === "fulfilled") setContacts(c.value);
    if (b.status === "fulfilled") setBrokers(b.value);
    if (cov.status === "fulfilled") setCoverage(cov.value);
    setErrors({
      agents: messageOf(a, "couldn't load the agents"),
      contacts: messageOf(c, "couldn't load the contact log"),
      brokers: messageOf(b, "couldn't load the agency codes"),
    });
    setRefreshedAt(Date.now());
    setLoading(false);
  }, []);

  // The views' refresh after every write.
  const reload = useCallback(async () => {
    applyBook(await fetchBook());
  }, [applyBook]);

  // First fetch on mount; a slow response that lands after unmount is dropped.
  useEffect(() => {
    let active = true;
    fetchBook().then((results) => {
      if (active) applyBook(results);
    });
    return () => {
      active = false;
    };
  }, [applyBook]);

  const targets = useRateTargets(loads);
  const now = useMemo(() => new Date(refreshedAt), [refreshedAt]);
  const retryLoads = useCallback(() => setLoadsKey((k) => k + 1), []);

  return {
    agents,
    brokers,
    contacts,
    coverage,
    loads,
    loadsLoading,
    loadsError,
    // The loads slice landed and is current — the views may compute RPM, load
    // counts, dormancy and days-since from it. Otherwise they render "—".
    loadsReady: !loadsLoading && loadsError == null,
    targets,
    ladder: targets.bookingLadder,
    now,
    loading,
    errors,
    reload,
    retryLoads,
  };
};

export type RelationshipsData = ReturnType<typeof useRelationshipsData>;
