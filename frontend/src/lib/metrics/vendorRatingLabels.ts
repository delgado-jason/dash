// Vendor rating labels — the cost-side twin of the agent scale (ratingLabels.ts),
// worded for a vendor you pay: 5 you seek out, 1 you steer around.
export const VENDOR_RATING_OPTIONS = [
  { value: 5, label: "5 - Go-to" },
  { value: 4, label: "4 - Solid" },
  { value: 3, label: "3 - Fine" },
  { value: 2, label: "2 - Last resort" },
  { value: 1, label: "1 - Avoid" },
];

export const getVendorRatingLabel = (
  rating: number | null | undefined,
): string => {
  if (!rating) return "Unrated";
  const option = VENDOR_RATING_OPTIONS.find((o) => o.value === rating);
  return option ? option.label : "Unrated";
};
