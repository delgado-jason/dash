// Markers — the bracketed tokens that make a nurture flag stay down once it
// has been acted on. A flag is OPEN until its marker appears somewhere on the
// agent's record:
//   sent     the note of the contact that carried it — as the message's own
//            type ("[milestone:loads-5] …") or folded into the week's first
//            message, where mergeNote appends it ("… · [milestone:loads-5]")
//   skipped  an agent note "[milestone:loads-5:skipped]" (never a contact — a
//            skip is not a touch and must not count against the cap)
// A plain substring test covers both placements; the tokens are unique enough
// that nothing else on a record can spell them by accident.

export interface MarkerContactLike {
  agent_id: string;
  note?: string | null;
}

export interface MarkerNoteLike {
  agent_id: string;
  note: string;
}

export const skippedMarker = (marker: string): string => `${marker.slice(0, -1)}:skipped]`;

// Every marker-shaped token on the agent's record, contacts and notes alike.
export const markersOf = (
  agentId: string,
  contacts: MarkerContactLike[],
  notes: MarkerNoteLike[],
): Set<string> => {
  const out = new Set<string>();
  const scan = (text: string | null | undefined) => {
    if (!text) return;
    for (const m of text.matchAll(/\[(milestone|holiday):[a-z]+-\d+(?::skipped)?\]/g)) out.add(m[0]);
  };
  for (const c of contacts) if (c.agent_id === agentId) scan(c.note);
  for (const n of notes) if (n.agent_id === agentId) scan(n.note);
  return out;
};

// Sent OR skipped — either way the flag is closed.
export const hasMarker = (
  agentId: string,
  marker: string,
  contacts: MarkerContactLike[],
  notes: MarkerNoteLike[],
): boolean => {
  const all = markersOf(agentId, contacts, notes);
  return all.has(marker) || all.has(skippedMarker(marker));
};
