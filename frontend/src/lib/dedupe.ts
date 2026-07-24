// Share one in-flight promise across concurrent identical requests.
//
// The dashboard mounts three hooks that each independently fetch the same two
// endpoints (useGrind, useRateTargets, useAwardPops) — six network round-trips
// for two answers, every load. This collapses each burst to one request.
//
// It is a burst-dedupe, NOT a cache: the entry is dropped the moment the promise
// settles, so the next call still hits the network and sees fresh data. Nothing
// goes stale after a save.
const inflight = new Map<string, Promise<unknown>>();

export const dedupe = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = fn();
  inflight.set(key, p);
  // Drop the entry on settle. Two handlers rather than .finally() so the derived
  // promise is fully handled — .finally() would re-reject with no one listening.
  // Callers still receive the original promise, rejection and all.
  p.then(
    () => inflight.delete(key),
    () => inflight.delete(key),
  );
  return p;
};
