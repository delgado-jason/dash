import type { Facility } from "@/types/facility";

// Common legal suffixes to drop when comparing names — so "ABC Manufacturing
// Inc", "ABC Manufacturing, LLC", and "ABC Manufacturing" all match.
const SUFFIXES = [
  "incorporated",
  "corporation",
  "company",
  "limited",
  "inc",
  "llc",
  "llp",
  "lp",
  "ltd",
  "corp",
  "co",
  "plc",
];

// Normalize a facility's identity string for MATCHING only — never for display.
// lowercase, punctuation → space, collapse whitespace, drop trailing legal
// suffixes (which can stack, e.g. "Foundry Co Inc").
export const normalizeFacilityName = (s: string): string => {
  let out = s
    .toLowerCase()
    .replace(/[.,'"&/\\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suf of SUFFIXES) {
      if (out.endsWith(" " + suf)) {
        out = out.slice(0, out.length - suf.length - 1).trim();
        changed = true;
      }
    }
  }
  return out;
};

interface Identity {
  kind: string;
  name: string | null;
  address: string | null;
  city: string;
  state: string;
}

// The key a facility dedups on: normalized name (business) or address (job
// site), plus city + state. Empty when there's no basis yet.
export const facilityKey = (f: Identity): string => {
  const basis = f.kind === "job_site" ? (f.address ?? "") : (f.name ?? "");
  const norm = normalizeFacilityName(basis);
  if (!norm || !f.city?.trim() || !f.state?.trim()) return "";
  return `${norm}|${f.city.trim().toLowerCase()}|${f.state.trim().toLowerCase()}`;
};

// An existing facility the proposed one would duplicate (same kind-appropriate
// key), or null. Powers the soft "did you mean" warning.
export const findDuplicate = (
  facilities: Facility[],
  proposed: Identity,
): Facility | null => {
  const key = facilityKey(proposed);
  if (!key) return null;
  return facilities.find((f) => facilityKey(f) === key) ?? null;
};

// What to show for a facility — its name, or its address for a nameless job site.
export const facilityLabel = (f: {
  name: string | null;
  address: string | null;
}): string => f.name || f.address || "Unnamed";

// Cluster facilities that share a dedup key — the likely-duplicate groups (2+).
// Generic so it preserves the caller's row type (with load counts).
export const possibleDuplicates = <T extends Identity>(facilities: T[]): T[][] => {
  const groups = new Map<string, T[]>();
  for (const f of facilities) {
    const key = facilityKey(f);
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
};
