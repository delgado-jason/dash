import type { Load } from "@/types/load";

// A driver's share of a given load_type among their DELIVERED loads — the work
// actually run (booked/in-transit haven't happened; cancelled didn't). The
// "specialist" flag lights up only when the share is genuinely high, so the
// badge on the card means something instead of firing on a single load.
export interface TypeMix {
  count: number; // delivered loads of this type
  pct: number | null; // count / delivered total; null when no delivered loads
  specialist: boolean;
}

export const SPECIALIST_MIN_PCT = 0.4;
export const SPECIALIST_MIN_COUNT = 5;
// A strip only appears once the driver has run a real body of that work, so a
// one-off doesn't earn a card. (Display floor — distinct from the specialist bar.)
export const STRIP_MIN_COUNT = 10;

export const loadTypeMix = (loads: Array<Load>, loadType: string): TypeMix => {
  const delivered = loads.filter((l) => l.load_status === "delivered");
  const count = delivered.filter((l) => l.load_type === loadType).length;
  const pct = delivered.length > 0 ? count / delivered.length : null;
  return {
    count,
    pct,
    specialist:
      pct != null && pct >= SPECIALIST_MIN_PCT && count >= SPECIALIST_MIN_COUNT,
  };
};
