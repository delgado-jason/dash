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
const KEY = "dash.dispatch.awards.v1";
interface Store {
  baselined: boolean;
  seen: string[];
}
const read = (): Store => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "");
    if (s && Array.isArray(s.seen)) return { baselined: !!s.baselined, seen: s.seen };
  } catch {
    /* fresh device */
  }
  return { baselined: false, seen: [] };
};
const write = (s: Store) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage disabled — pops just won't persist */
  }
};

export const useDispatcherAwardPops = (
  input: DispatcherAwardInput | null,
): Award[] => {
  const [pops, setPops] = useState<Award[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!input || input.loads.length === 0 || done) return;
    setDone(true);

    // Patches + medals (incl. Backhaul Boss) plus the current-period season
    // trophies — all through one seen-store so day-one baselines silently.
    const earned = [
      ...dispatcherEarnedAwards(input),
      ...dispatcherSeasonAwards(
        input.loads,
        input.userId,
        input.ladder,
        input.freeHours,
        new Date(),
      ),
    ];
    const currentIds = earned.map((a) => a.id);
    const store = read();

    if (!store.baselined) {
      write({ baselined: true, seen: currentIds }); // silent day-one baseline
      return;
    }
    const fresh = newAwards(earned, new Set(store.seen));
    if (fresh.length > 0) {
      write({ baselined: true, seen: [...new Set([...store.seen, ...currentIds])] });
      setPops(fresh);
    }
  }, [input, done]);

  return pops;
};
