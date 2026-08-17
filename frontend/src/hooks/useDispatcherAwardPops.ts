import { useState, useEffect } from "react";
import { newAwards, type Award } from "@/lib/metrics/awards";
import {
  dispatcherEarnedAwards,
  type DispatcherAwardInput,
} from "@/lib/awards/dispatcherAwards";
import { dispatcherSeasonAwards } from "@/lib/metrics/dispatcherSeason";

// The dispatcher's awards keep their OWN per-device seen store, separate from the
// driver's — so a device that already baselined the driver set doesn't flood a
// dispatcher with every award at once (and vice-versa). Pass a fully-loaded input
// (null until the rate ladder is ready) so the baseline is computed from complete
// data.
// Keyed PER IDENTITY: an identity swap on a shared device must not diff one
// user's earned set against another's baseline — that's an award storm
// (2026-08-16). The legacy device-wide store migrates to the first identity
// that reads it, so shipping this doesn't re-storm anyone.
const BASE_KEY = "dash.dispatch.awards.v1";
const storeKey = (userId: string) => `${BASE_KEY}.${userId}`;
interface Store {
  baselined: boolean;
  seen: string[];
}
const read = (userId: string): Store => {
  try {
    const legacy = localStorage.getItem(BASE_KEY);
    if (legacy && !localStorage.getItem(storeKey(userId))) {
      localStorage.setItem(storeKey(userId), legacy);
      localStorage.removeItem(BASE_KEY);
    }
    const s = JSON.parse(localStorage.getItem(storeKey(userId)) || "");
    if (s && Array.isArray(s.seen)) return { baselined: !!s.baselined, seen: s.seen };
  } catch {
    /* fresh device */
  }
  return { baselined: false, seen: [] };
};
const write = (userId: string, s: Store) => {
  try {
    localStorage.setItem(storeKey(userId), JSON.stringify(s));
  } catch {
    /* storage disabled — pops just won't persist */
  }
};

export const useDispatcherAwardPops = (
  input: DispatcherAwardInput | null,
): Award[] => {
  const [pops, setPops] = useState<Award[]>([]);
  // Depend on the underlying DATA, not the input object (rebuilt every render).
  // Recomputing whenever her loads/streak change — rather than once per mount —
  // is what makes a freshly-earned award actually fire; the per-device seen-store
  // dedups, so a re-run never re-pops something already celebrated.
  const loads = input?.loads;
  const userId = input?.userId;
  const streak = input?.streak;
  const freeHours = input?.freeHours;
  const ladder = input?.ladder;

  useEffect(() => {
    if (!input || !loads || loads.length === 0 || !userId) return;

    // Patches + medals (incl. Backhaul Boss) plus the current-period season
    // trophies — all through one seen-store so day-one baselines silently.
    const earned = [
      ...dispatcherEarnedAwards(input),
      ...dispatcherSeasonAwards(loads, userId!, ladder!, freeHours!, new Date()),
    ];
    const currentIds = earned.map((a) => a.id);
    const store = read(userId);

    if (!store.baselined) {
      write(userId, { baselined: true, seen: currentIds }); // silent day-one baseline
      return;
    }
    const fresh = newAwards(earned, new Set(store.seen));
    if (fresh.length > 0) {
      write(userId, { baselined: true, seen: [...new Set([...store.seen, ...currentIds])] });
      setPops(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loads, userId, streak, freeHours, ladder]);

  return pops;
};
