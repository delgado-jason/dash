import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent } from "@/types/agent";
import type { Broker } from "@/types/broker";
import type { AgentNote } from "@/types/agentNote";
import { useLoads } from "@/hooks/useLoads";
import { useRateTargets } from "@/hooks/useRateTargets";
import { useCityCoords } from "@/hooks/useCityCoords";
import { getAgents } from "@/services/agentsService";
import { getBrokers } from "@/services/brokersService";
import { getAgentContacts, type AgentContact } from "@/services/agentContactsService";
import { getAgentCoverage, type AgentCoverage } from "@/services/agentCoverageService";
import { getAgentNotes } from "@/services/agentNotesService";
import { getTierHistory, type TierHistoryRow } from "@/services/agentTierHistoryService";
import { getRelationshipReviews, type RelationshipReview } from "@/services/relationshipReviewsService";
import { getUser } from "@/services/teamService";

// Everything the Relationships surface reads, fetched once in the layout and
// handed to the views through the outlet context. Each slice fails on its
// own: a missing coverage list degrades the sheet's Markets, a failed loads
// fetch shows a warn line and flips `loadsReady` off so the views withhold
// every loads-derived fact — never confident zeros. Today also reads the
// trusted city coordinates (the Foreman's cache, for the 150-mi capacity
// list), every agent note (for skipped nurture flags — a failed read is its
// own slice error, since an empty list would quietly reopen every skipped
// flag) and the logged-in user's display name (every draft is signed by
// whoever is on shift). Review adds the tier history (the owner's holds hide
// a suggestion — a failed read must not quietly bring every hold back) and
// the month / quarter sign-offs. The clock ticks once a minute so a tab left
// open rolls over on its own — the day plan at midnight, the cap week on
// Monday, callbacks coming due, this week's ghosting — without a hard refresh.

export interface SliceErrors {
  agents?: string;
  contacts?: string;
  brokers?: string;
  notes?: string;
  history?: string;
  reviews?: string;
}

export const CLOCK_TICK_MS = 60_000;

const messageOf = (r: PromiseSettledResult<unknown>, fallback: string): string | undefined =>
  r.status === "rejected" ? (r.reason instanceof Error ? r.reason.message : fallback) : undefined;

// The reads, settled independently — pure I/O, no React state, so the mount
// effect can call it and set state only in the promise callback.
const fetchBook = () =>
  Promise.allSettled([
    getAgents(),
    getAgentContacts(),
    getBrokers(),
    getAgentCoverage(), // never rejects — degrades to []
    getAgentNotes(), // rejects on failure — its own slice error, never a silent []
    getTierHistory(), // its own slice error — an empty trail would lift every hold
    getRelationshipReviews(), // its own slice error — an empty list would read "unsigned"
  ]);
type BookResults = Awaited<ReturnType<typeof fetchBook>>;

// Who is logged in, for the drafts' signature: the display name, or null —
// until it lands, when the read fails, or when no name is on file. Never the
// email: an address is not a signature, and the templates keep the SOP's
// [Name] bracket on null rather than guess.
const fetchSigner = async (): Promise<string | null> => {
  const selfId = localStorage.getItem("user_id");
  if (!selfId) return null;
  try {
    const me = await getUser(selfId);
    return me.display_name?.trim() || null;
  } catch {
    return null;
  }
};

export const useRelationshipsData = () => {
  const [loadsKey, setLoadsKey] = useState(0);
  // isFetching, not isLoading: a retry after a failure must read as loading
  // again, or the book would show the stale empty list as fact meanwhile.
  const { loads, isFetching: loadsLoading, error: loadsError } = useLoads(loadsKey);
  const coords = useCityCoords(loads);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [contacts, setContacts] = useState<AgentContact[]>([]);
  const [coverage, setCoverage] = useState<AgentCoverage[]>([]);
  const [notes, setNotes] = useState<AgentNote[]>([]);
  const [history, setHistory] = useState<TierHistoryRow[]>([]);
  const [reviews, setReviews] = useState<RelationshipReview[]>([]);
  const [signer, setSigner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<SliceErrors>({});
  // The clock the views compute against — refreshed with every reload so a
  // tab left open does not keep yesterday's "days since".
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());

  const applyBook = useCallback(([a, c, b, cov, n, h, r]: BookResults) => {
    if (a.status === "fulfilled") setAgents(a.value);
    if (c.status === "fulfilled") setContacts(c.value);
    if (b.status === "fulfilled") setBrokers(b.value);
    if (cov.status === "fulfilled") setCoverage(cov.value);
    if (n.status === "fulfilled") setNotes(n.value);
    if (h.status === "fulfilled") setHistory(h.value);
    if (r.status === "fulfilled") setReviews(r.value);
    setErrors({
      agents: messageOf(a, "couldn't load the agents"),
      contacts: messageOf(c, "couldn't load the contact log"),
      brokers: messageOf(b, "couldn't load the agency codes"),
      notes: messageOf(n, "couldn't load the agent notes"),
      history: messageOf(h, "couldn't load the tier history"),
      reviews: messageOf(r, "couldn't load the sign-offs"),
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
    fetchSigner().then((name) => {
      if (active) setSigner(name);
    });
    return () => {
      active = false;
    };
  }, [applyBook]);

  // The minute tick — `now` advances so everything derived from it (the day
  // plan, the cap week, callbacks due, ghosting) recomputes; cleared on unmount.
  useEffect(() => {
    const tick = setInterval(() => setRefreshedAt(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(tick);
  }, []);

  const targets = useRateTargets(loads);
  const now = useMemo(() => new Date(refreshedAt), [refreshedAt]);
  const retryLoads = useCallback(() => setLoadsKey((k) => k + 1), []);

  return {
    agents,
    brokers,
    contacts,
    coverage,
    notes,
    history,
    reviews,
    coords,
    signer,
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
