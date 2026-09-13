// An agent's display name from any shape that carries the two name fields —
// a full Agent, a review row's AgentLike, a call-list row.
export const nameOf = (a: { first_name: string; last_name: string }): string =>
  `${a.first_name} ${a.last_name}`.trim();
