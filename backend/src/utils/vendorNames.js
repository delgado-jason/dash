import { nameKey, asciiTrim } from "./validation/vendorValidation.js";

// The one spelling a vendor name has in dash. A typed name that matches a
// vendor's name or one of its aliases (ends trimmed, case ignored) becomes the
// vendor's own spelling; anything else is kept as typed (trimmed).
//
// This is the mechanism behind "every board adds up the same way": the log's
// vendor column is free text, so the moment a merge files "Rays Tire Shop" as
// an alias of "Ray's Tire Service", the next service typed under the old
// spelling lands in the log under the new one — no second bridge row, no split
// total. The match is the exact key, never a prefix: "TA" must not become
// "TA Petro" on its own.
export function canonicalVendorName(typed, vendors = []) {
  if (typeof typed !== "string") return null;
  if (typed.trim().length === 0) return null;
  const trimmed = asciiTrim(typed); // trimmed the way SQL trims, so keys agree

  const key = nameKey(trimmed);
  for (const vendor of vendors) {
    if (!vendor || typeof vendor.name !== "string") continue;
    if (nameKey(vendor.name) === key) return vendor.name;
    const aliases = Array.isArray(vendor.aliases) ? vendor.aliases : [];
    if (aliases.some((a) => typeof a === "string" && nameKey(a) === key))
      return vendor.name;
  }
  return trimmed;
}
