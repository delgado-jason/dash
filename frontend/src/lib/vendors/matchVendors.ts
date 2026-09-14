import type { Vendor } from "@/types/vendor";

export interface VendorMatch {
  vendor: Vendor;
  // The alias the text actually hit, when the vendor's own name didn't — the
  // row shows it so a match on a spelling he doesn't see isn't a mystery.
  alias: string | null;
}

// The rolodex rows a typed fragment offers, name first then aliases, ordered by
// name. Empty text offers everything (the merge picker opens with the whole
// rolodex); the log sheet's box asks for a character first.
export const matchVendors = (
  text: string,
  vendors: Vendor[],
  limit = 8,
): VendorMatch[] => {
  const q = text.trim().toLowerCase();
  const hits: VendorMatch[] = [];

  for (const vendor of vendors) {
    if (q.length === 0) {
      hits.push({ vendor, alias: null });
      continue;
    }
    if (vendor.name.toLowerCase().includes(q)) {
      hits.push({ vendor, alias: null });
      continue;
    }
    const alias = (vendor.aliases ?? []).find((a) =>
      a.toLowerCase().includes(q),
    );
    if (alias) hits.push({ vendor, alias });
  }

  return hits
    .sort((a, b) => a.vendor.name.localeCompare(b.vendor.name))
    .slice(0, limit);
};
