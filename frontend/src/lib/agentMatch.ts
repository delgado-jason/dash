import type { Agent } from "@/types/agent";

// In dash, an agent's 3-letter Landstar code is stored as the "broker" on the
// agent record (broker_name — e.g. EWT, JVL). That's the code Jason searches by
// off the load board; the person's name identifies which agent under it.
export const agentCode = (a: Agent): string => (a.broker_name ?? "").trim();
export const agentFullName = (a: Agent): string =>
  `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();

// How an agent reads on the Scorer: "EWT · Danielle Carder" (code, then name).
export const agentLabel = (a: Agent): string => {
  const code = agentCode(a);
  const name = agentFullName(a);
  return code && name ? `${code} · ${name}` : name || code;
};

// Match by 3-letter code (prefix) or person name (contains), case-insensitive —
// so "EWT" surfaces both EWT agents and typing a name narrows to the person.
export const matchAgents = (agents: Agent[], query: string, limit = 8): Agent[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out = agents.filter((a) => {
    const code = agentCode(a).toLowerCase();
    const name = agentFullName(a).toLowerCase();
    return code.startsWith(q) || name.includes(q) || agentLabel(a).toLowerCase().includes(q);
  });
  return out.slice(0, limit);
};
