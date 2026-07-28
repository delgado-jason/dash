import { BREAK_EVEN_RPM } from "@/lib/constants/targets";
import { rpm } from "@/lib/format";

// A lane is "strong" comfortably above break-even, "thin" between break-even
// and strong, "below" under break-even. Mirrors the mockup's three tiers.
const STRONG_RPM = 3.2;

export const fmtRpm = rpm;

export const rpmTextClass = (n: number | null): string => {
  if (n === null) return "text-muted-text";
  if (n >= STRONG_RPM) return "text-status-positive-text";
  if (n >= BREAK_EVEN_RPM) return "text-status-aware-text";
  return "text-status-negative-text";
};
