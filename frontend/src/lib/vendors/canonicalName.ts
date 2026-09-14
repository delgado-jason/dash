import type { Vendor } from "@/types/vendor";

// Postgres's btrim / TRIM strip ASCII spaces only; JS's trim() strips every
// Unicode space. The app must never out-trim the database, or a name pasted
// with a trailing NBSP gets one key here and another in SQL.
export const asciiTrim = (s: string): string => s.replace(/^ +| +$/g, "");

// The match key: trim the ASCII-space ends, lowercase, nothing else. The same
// key Postgres generates (`lower(btrim(name))`) and the same one the backend's
// canonicalVendorName uses — if this collapsed inner whitespace too, the box
// would say two names match where the server says they don't.
export const vendorNameKey = (s: string): string => asciiTrim(s).toLowerCase();

// The one spelling a vendor name has in dash. A typed name that matches a
// vendor's name or one of its aliases (ends trimmed, case ignored) becomes the
// vendor's own spelling; anything else is kept as typed (trimmed).
//
// This is what the log sheet's vendor box does on blur: type "Rays Tire Shop"
// after the merge and it files itself under "Ray's Tire Service". The match is
// the exact key, never a prefix — "TA" must not become "TA Petro" by itself.
export const canonicalVendorName = (
  typed: string,
  vendors: Pick<Vendor, "name" | "aliases">[],
): string => {
  if (typed.trim().length === 0) return typed.trim();
  const trimmed = asciiTrim(typed);

  const key = vendorNameKey(trimmed);
  for (const vendor of vendors) {
    if (vendorNameKey(vendor.name) === key) return vendor.name;
    if ((vendor.aliases ?? []).some((a) => vendorNameKey(a) === key))
      return vendor.name;
  }
  return trimmed;
};
