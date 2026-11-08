// An agent's display name from any shape that carries the two name fields —
// a full Agent, a review row's AgentLike, a call-list row. Stray spaces in the
// data (19 prod names had them, GL-220) never reach the screen or a join key:
// each part is trimmed and runs of whitespace collapse to one space, so
// "Jane  Doe " reads "Jane Doe".
export const cleanName = (s: string | null | undefined): string =>
  (s ?? "").replace(/\s+/g, " ").trim();

export const nameOf = (a: { first_name: string; last_name: string }): string =>
  `${cleanName(a.first_name)} ${cleanName(a.last_name)}`.trim();
