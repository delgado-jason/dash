import { spellingKey, normalizedWords } from "@/lib/maintenance/spellingKey";
import { vendorNameKey } from "./canonicalName";
import type { Vendor } from "@/types/vendor";

export interface LooksLikeHit {
  target: string;
  kind: "vendor" | "unfiled";
}

// Two spellings of one stop. Two ways in:
//   • the same spellingKey — the first two words match, so "Rays Tire Shop" and
//     "Ray's Tire Service" are the same tire man (punctuation and case are noise);
//   • one of them is a SINGLE word that is the other's first word — "TA" beside
//     "TA Petro", "Loves" beside "Love's Travel Stop". spellingKey deliberately
//     won't join those (two letters are not enough evidence to merge on its own),
//     but a pill is a question put to a human, not an automatic merge.
const twins = (a: string, b: string): boolean => {
  const wa = normalizedWords(a);
  const wb = normalizedWords(b);
  if (wa.length === 0 || wb.length === 0) return false;
  if (spellingKey(a) === spellingKey(b)) return true;
  if (wa.length === 1 && wa[0] === wb[0]) return true;
  if (wb.length === 1 && wb[0] === wa[0]) return true;
  return false;
};

// Which name a bridge row looks like — the amber "looks like" pill.
//
// The rolodex wins: if a vendor already owns a twin spelling (its own name or
// one a merge filed), the answer is that vendor, because merging into it is the
// door that ends the split. Otherwise, two unfiled names that are twins of each
// other get ONE pill between them, on the shorter name pointing at the longer:
// the fuller spelling is the one worth filing, and two pills pointing at each
// other would just be a loop.
export const looksLike = (
  name: string,
  rolodex: Pick<Vendor, "name" | "aliases">[],
  otherUnfiled: string[],
): LooksLikeHit | null => {
  for (const vendor of rolodex) {
    if (
      twins(name, vendor.name) ||
      (vendor.aliases ?? []).some((a) => twins(name, a))
    )
      return { target: vendor.name, kind: "vendor" };
  }

  const key = vendorNameKey(name);
  for (const other of otherUnfiled) {
    if (vendorNameKey(other) === key) continue; // never point at yourself
    if (!twins(name, other)) continue;
    // The shorter name wears the pill — fewer characters, and on a tie the one
    // that sorts first, so exactly one of the pair speaks.
    const iAmShorter =
      name.length < other.length ||
      (name.length === other.length && name < other);
    if (iAmShorter) return { target: other, kind: "unfiled" };
  }

  return null;
};
