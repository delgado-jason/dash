import type { Vendor } from "@/types/vendor";
import { STATES } from "@/lib/constants/states";

export interface VendorGroup {
  category: string;
  vendors: Vendor[]; // ranked: rating desc, unrated last, then name asc
  champion: Vendor | null; // top-rated in the category; null if nobody is rated
}

// Rank two vendors: higher rating first, unrated (null) sinks to the bottom, ties
// broken by name so the order — and the champion — is deterministic.
const rankVendors = (a: Vendor, b: Vendor): number => {
  const ra = a.rating ?? -1;
  const rb = b.rating ?? -1;
  if (rb !== ra) return rb - ra;
  return a.name.localeCompare(b.name);
};

// Group vendors by category, rank within each, and crown the champion — the single
// top-rated vendor in the category (the answer to "who's my best escort?"). A
// category where nobody is rated has no champion. Categories come back sorted by
// name for a stable list.
export const groupVendorsByCategory = (vendors: Vendor[]): VendorGroup[] => {
  const byCategory = new Map<string, Vendor[]>();
  for (const v of vendors) {
    const list = byCategory.get(v.category) ?? [];
    list.push(v);
    byCategory.set(v.category, list);
  }

  const groups: VendorGroup[] = [];
  for (const [category, list] of byCategory) {
    const ranked = [...list].sort(rankVendors);
    const top = ranked[0];
    const champion = top && top.rating != null ? top : null;
    groups.push({ category, vendors: ranked, champion });
  }

  groups.sort((a, b) => a.category.localeCompare(b.category));
  return groups;
};

// The trust ledger behind the answering line: go-to's (rated 5), steer-clears
// (rated ≤2), and the unproven (never rated). 3–4s are solid and need no count.
export interface TrustCounts {
  goTo: number;
  steerClear: number;
  unproven: number;
}

export const trustCounts = (vendors: Vendor[]): TrustCounts => ({
  goTo: vendors.filter((v) => v.rating === 5).length,
  steerClear: vendors.filter((v) => v.rating != null && v.rating <= 2).length,
  unproven: vendors.filter((v) => v.rating == null).length,
});

// Parse a free-text service area ("TX, AL, GA, SC, NC,") into state chips.
// Tolerates trailing commas, punctuation, and lowercase; a token only becomes
// a chip if it's a real state code — "to" or "and" can't sneak in as states.
// Deduped, first-mention order.
export const serviceAreaStates = (area: string | null | undefined): string[] => [
  ...new Set(
    (area ?? "")
      .split(/[^A-Za-z]+/)
      .map((s) => s.toUpperCase())
      .filter((s) => s in STATES),
  ),
];
