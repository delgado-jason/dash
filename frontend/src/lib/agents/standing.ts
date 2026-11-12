// An agent's standing: ONE value over two columns, so they cannot drift.
//
// ──────────────────────────────────────────────────────────────────────────
// THEY HAD ALREADY DRIFTED. Read off prod 2026-11-12, of ten parked agents:
//
//   1 ★   2 agents   (ROR Jones — "Blacklisted agent")
//   2 ★   1 agent    (POU Rogers — "Bad Number")
//   3 ★   4 agents   (SST Johns — "Because he's an asshole")
//   none  3 agents   (TTT Carter — "He doesnt dispatch")
//
// Four parked agents carry THE SAME 3 STARS AS 39 ACTIVE ONES, because 3 is
// the default and nobody re-rates a desk they have stopped calling. And one
// runs it the other way: BTN Zegar is rated 1 — "Blacklist" — and is still
// active. The rating and the parked flag were two places to say one thing.
//
// Jason's instruction: "the agent rating coincides with being parked. In other
// words, they can't drift. So I don't want to have to mark it in two different
// places so that it also reports clearly on the score of load."
//
// So `Standing` is the single value the UI edits — "parked" sits at the bottom
// of the rating scale — and this module is the only place that maps it onto
// the two columns underneath.
//
// THE STORED RATING SURVIVES A PARK. Parking writes work_status and leaves
// `rating` alone, so un-parking restores the stars the desk had rather than
// resetting it to the default. That is also why NO DATA MIGRATION was needed:
// the four 3-star parked agents simply read "Parked" from now on, and 3 is the
// number they come back to.
// ──────────────────────────────────────────────────────────────────────────

/** Worst to best. "parked" is a standing, not a rating — hence the union. */
export type Standing = "parked" | 1 | 2 | 3 | 4 | 5;

export interface StandingSource {
  rating?: number | null;
  work_status?: string | null;
}

/** What an agent's standing IS, from the two columns. Parked always wins. */
export const standingOf = (a: StandingSource): Standing | null => {
  if (a.work_status === "parked") return "parked";
  const r = a.rating;
  return r === 1 || r === 2 || r === 3 || r === 4 || r === 5 ? r : null;
};

export const STANDING_OPTIONS: ReadonlyArray<{
  value: Standing;
  label: string;
  hint: string;
}> = [
  { value: 5, label: "5 · Call first", hint: "first on the list" },
  { value: 4, label: "4 · Good", hint: "" },
  { value: 3, label: "3 · Default", hint: "" },
  { value: 2, label: "2 · Avoid", hint: "" },
  { value: 1, label: "1 · Blacklist", hint: "rated worst, still callable" },
  { value: "parked", label: "Parked — do not book", hint: "needs a reason" },
];

export const standingLabel = (s: Standing | null): string =>
  s == null ? "Unrated" : (STANDING_OPTIONS.find((o) => o.value === s)?.label ?? "Unrated");

/**
 * The patch that moves an agent to `next`, given what it is now.
 *
 * Parking does not touch the rating; un-parking restores it and applies
 * whatever star was chosen. Returns an empty object when nothing changes, so a
 * caller can tell "no-op" from "write this".
 */
export const standingPatch = (
  current: StandingSource,
  next: Standing,
  parkReason?: string,
): { rating?: number | null; work_status?: "active" | "parked"; park_reason?: string | null } => {
  const now = standingOf(current);
  if (now === next && !(next === "parked" && parkReason)) return {};

  if (next === "parked") {
    // The rating is deliberately absent: it is the value the desk comes back
    // to if you un-park it.
    return { work_status: "parked", park_reason: parkReason?.trim() || null };
  }
  const patch: ReturnType<typeof standingPatch> = { rating: next };
  // Only un-park when it is actually parked — otherwise an ordinary re-rating
  // would write work_status on every agent for no reason.
  if (current.work_status === "parked") {
    patch.work_status = "active";
    patch.park_reason = null;
  }
  return patch;
};

/**
 * The contradictions the old two-field model allowed, for anything that wants
 * to surface them. An agent rated 1 ("Blacklist") who is still active is not
 * an error — Jason may still take a load from a desk he thinks little of —
 * but it IS worth one look.
 */
export const standingIsContradictory = (a: StandingSource): boolean =>
  a.work_status !== "parked" && a.rating === 1;
