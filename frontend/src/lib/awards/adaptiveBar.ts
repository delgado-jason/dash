// Adaptive, ratcheting difficulty for the "impressive feat" awards (patches).
// The bar is set from the user's OWN history — their ~N-th best result for the
// metric — so it's hard but attainable, and it only ever gets HARDER (a downturn
// can never make it easier). Earns lock in: an event that cleared the bar in
// effect at its time stays counted forever, so the ×N count never rolls backward.

export interface Stack {
  count: number; // times earned (×N) — monotonic, never decreases
  bar: number; // the level a NEW event must clear now
  active: boolean; // true once there's enough history for the personal bar
}

export interface BarOpts {
  n: number; // "top N" that sets the bar (5 → your 5th-best clears it)
  floor: number; // conservative starter bar until history builds
  minHistory?: number; // events before the personal bar takes over (default n)
  lowerIsBetter?: boolean; // deadhead % etc. — a SMALLER value clears the bar
}

// Walk the metric's values in CHRONOLOGICAL order. For each value, the bar is the
// personal bar established by everything before it (ratcheted — running hardest);
// a value that clears the bar in effect at that moment earns, permanently.
export const computeStack = (chrono: number[], opts: BarOpts): Stack => {
  const { n, floor, lowerIsBetter = false } = opts;
  const minHistory = opts.minHistory ?? n;
  const better = (v: number, bar: number) => (lowerIsBetter ? v <= bar : v >= bar);
  const harder = (a: number, b: number) => (lowerIsBetter ? Math.min(a, b) : Math.max(a, b));

  const seen: number[] = [];
  let bar = floor;
  let count = 0;

  for (const v of chrono) {
    if (seen.length >= minHistory) {
      const sorted = [...seen].sort((a, b) => (lowerIsBetter ? a - b : b - a));
      const candidate = sorted[Math.min(n, sorted.length) - 1]; // N-th best so far
      bar = harder(bar, candidate); // ratchet — the bar can only get tougher
    }
    if (better(v, bar)) count++;
    seen.push(v);
  }

  return { count, bar, active: seen.length >= minHistory };
};
