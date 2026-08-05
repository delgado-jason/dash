import type { Vendor } from "@/types/vendor";

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

// How many vendors you've marked a go-to (rated 5) — a roster KPI.
export const goToCount = (vendors: Vendor[]): number =>
  vendors.filter((v) => v.rating === 5).length;
