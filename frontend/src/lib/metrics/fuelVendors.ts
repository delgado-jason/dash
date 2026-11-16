// Where you buy — the vendor line on the Fuel page, and the fold that keeps
// one truck stop from being three vendors.
//
// On Jason's book (2026-11-15) the same three chains were spelled "TA·Petro",
// "TA" and "Petro"; "Love's" and "Loves"; "Pilot Flying J" and "Pilot" — and
// the page had no vendor line at all. Folded, the receipts say Love's runs
// 22 cents a gallon over TA. The fold runs at the form's boundary (a typed
// variant lands canonical) and over the book (so old rows group).

interface VendorFillLike {
  company_name?: string | null;
  gallons: number | string;
  price_per_gallon: number | string;
  kind?: string | null; // diesel | def — DEF is not fuel bought by the gallon of diesel
}

const squash = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase().replace(/[.'’`]/g, "");

/**
 * The canonical spelling of a vendor, or the trimmed name when it is nobody's
 * known chain. null and blank stay null — "no vendor" is a fact, not a chain.
 */
export const canonicalVendor = (name: string | null | undefined): string | null => {
  const raw = (name ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const k = squash(raw).replace(/[·\-–—/]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(ta|petro|ta petro|travelcenters? of america|travel ?centers?)( .*)?$/.test(k)) return "TA·Petro";
  if (/^loves?( .*)?$/.test(k)) return "Love's";
  if (/^(pilot|flying j|pilot flying j)( .*)?$/.test(k)) return "Pilot Flying J";
  return raw;
};

export interface VendorLine {
  vendor: string | null; // null = no vendor on the fill
  fills: number;
  gallons: number;
  spend: number;
  ppg: number | null; // spend ÷ gallons, diesel only
}

/** Diesel fills grouped by canonical vendor, most gallons first; "no vendor" last. */
export const vendorLines = (entries: VendorFillLike[]): VendorLine[] => {
  const m = new Map<string | null, VendorLine>();
  for (const e of entries) {
    if (e.kind === "def") continue;
    const vendor = canonicalVendor(e.company_name);
    const gal = Number(e.gallons) || 0;
    const spend = gal * (Number(e.price_per_gallon) || 0);
    const row = m.get(vendor) ?? { vendor, fills: 0, gallons: 0, spend: 0, ppg: null };
    row.fills += 1;
    row.gallons += gal;
    row.spend += spend;
    m.set(vendor, row);
  }
  return [...m.values()]
    .map((r) => ({ ...r, ppg: r.gallons > 0 ? r.spend / r.gallons : null }))
    .sort((a, b) => {
      if (a.vendor == null) return 1;
      if (b.vendor == null) return -1;
      return b.gallons - a.gallons || a.vendor.localeCompare(b.vendor);
    });
};
