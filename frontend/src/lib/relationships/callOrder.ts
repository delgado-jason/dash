// THE ADVANCE ORDER — the call screen's "no index cursor" rule, pure. The
// screen keeps a session `handled` set (logged or skipped this sitting);
// next = the first row of the CURRENT filtered list not in it. THIS ROTATION
// is the graded groups (A, B, C — or the prospects list): a row in the
// RECYCLE — NEXT ROTATION fold stays listed and tappable but is never next,
// never counted, and never stands between Brandie and "List worked".

export interface OrderedRowLike {
  agent: { agent_id: string };
  recycle?: boolean; // true = in the fold (a ReactivationRow); prospects carry none
}

// The ids the advance walks, in list order — the fold left out.
export const rotationIds = <R extends OrderedRowLike>(rows: readonly R[]): string[] =>
  rows.filter((r) => !r.recycle).map((r) => r.agent.agent_id);

// Who is next: the first row of the rotation not yet handled; null when the
// rotation is empty or every row in it is handled.
export const nextUnhandled = (orderedIds: readonly string[], handled: ReadonlySet<string>): string | null =>
  orderedIds.find((id) => !handled.has(id)) ?? null;

// "List worked" — every row of the rotation is handled. An empty rotation is
// not a worked list (nobody was called), so it reads false.
export const allHandled = (orderedIds: readonly string[], handled: ReadonlySet<string>): boolean =>
  orderedIds.length > 0 && orderedIds.every((id) => handled.has(id));
