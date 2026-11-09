import { useEffect, useMemo, useState } from "react";
import type { Load } from "@/types/load";
import { useAgents } from "@/hooks/useAgents";
import { useAgencies } from "@/hooks/useAgencies";
import { getAgentContacts, type AgentContact } from "@/services/agentContactsService";
import { buildLeaderboard, type Leaderboard } from "@/lib/metrics/leaderboard";
import type { AgencyWindow } from "@/lib/agencies/agencyMetrics";
import type { RateLadder } from "@/lib/metrics/rateTargets";
import type { Agent } from "@/types/agent";

// Everything the desk leaderboard needs, fetched once and owned in one place:
// the agents, the agencies and the contact log, rolled into the board.
//
// It exists because TWO screens show the board now — the owner's Agents tab and
// Brandie's dispatcher dashboard (the Redesign, phase C, call 8). She books the
// freight and her board never told her which desks pay. Without this hook the
// second mount would have had to copy the contacts fetch and the buildLeaderboard
// wiring, and the two boards could then drift apart.
export interface DeskBoard {
  board: Leaderboard;
  agents: Agent[];
  contactsFailed: boolean; // the contact log failed — never read as "never contacted"
  failed: { onRetry: () => void } | null; // agents or agencies failed to load
}

export const useDeskBoard = (
  loads: Load[],
  ladder: RateLadder | null,
  now: Date,
  window: AgencyWindow = "12m",
): DeskBoard => {
  const [retryKey, setRetryKey] = useState(0);
  const { agents, error: agentsError } = useAgents(retryKey);
  const { agencies, error: agenciesError } = useAgencies(retryKey);

  const [contactsState, setContactsState] = useState<{
    contacts: AgentContact[];
    failed: boolean;
  }>({ contacts: [], failed: false });
  useEffect(() => {
    let active = true;
    getAgentContacts()
      .then((contacts) => active && setContactsState({ contacts, failed: false }))
      .catch(() => active && setContactsState({ contacts: [], failed: true }));
    return () => {
      active = false;
    };
  }, [retryKey]);

  const board = useMemo(
    () =>
      buildLeaderboard({
        agencies,
        agents,
        loads,
        contacts: contactsState.contacts,
        ladder,
        now,
        window,
      }),
    [agencies, agents, loads, contactsState.contacts, ladder, now, window],
  );

  return {
    board,
    agents: agents ?? [],
    contactsFailed: contactsState.failed,
    failed:
      agentsError || agenciesError
        ? { onRetry: () => setRetryKey((k) => k + 1) }
        : null,
  };
};
