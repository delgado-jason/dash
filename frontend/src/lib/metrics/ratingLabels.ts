import type { IndexRouteObject } from "react-router";

// Semantic rating labels from the DTS rating system doc
export const RATING_OPTIONS = [
  { value: 5, label: "5 - Call first" },
  { value: 4, label: "4 - Good" },
  { value: 3, label: "3 - Default" },
  { value: 2, label: "2 - Avoid" },
  { value: 1, label: "1 - Blacklist" },
];

export const getRatinglabel = (rating: number | null | undefined): string => {
  if (!rating) return "Unrated";
  const option = RATING_OPTIONS.find((o) => o.value === rating);
  return option ? option.label : "Unrated";
};
