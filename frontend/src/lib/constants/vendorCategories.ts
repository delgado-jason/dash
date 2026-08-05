// The curated vendor category vocabulary. Keep in lockstep with the backend list
// in utils/validation/vendorValidation.js (VENDOR_CATEGORIES). 'Shop' is special —
// it's the category that gets the maintenance spend readout.
export const VENDOR_CATEGORIES = [
  "Shop",
  "Escort / Pilot Car",
  "Permits",
  "Tires",
  "Parts",
  "Towing",
  "Washout",
  "Securement",
  "Scale",
  "Other",
] as const;

export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

// A lucide-react icon name per category, for the list group headers and chips.
export const CATEGORY_ICON: Record<string, string> = {
  Shop: "Wrench",
  "Escort / Pilot Car": "ShieldCheck",
  Permits: "FileText",
  Tires: "CircleDot",
  Parts: "Cog",
  Towing: "Truck",
  Washout: "Droplets",
  Securement: "Link",
  Scale: "Scale",
  Other: "Package",
};
