import type { Grade } from "@/lib/metrics/playerCard";

// The four grade colours — one place, so every grade word wears the same ones.
// Colour is meaning and nothing else (the Redesign, phase B): prime and target
// are good, minimum (above the floor, under the target) is a caution, below is
// bad. Tokens, so the words read in both looks.
export const GRADE_META: Record<Grade, { label: string; fg: string; bg: string }> = {
  below: { label: "BELOW", fg: "var(--color-status-negative-text)", bg: "var(--color-status-negative-bg)" },
  minimum: { label: "MINIMUM", fg: "var(--color-status-aware-text)", bg: "var(--color-status-aware-bg)" },
  target: { label: "TARGET", fg: "var(--color-status-positive-text)", bg: "var(--color-status-positive-bg)" },
  prime: { label: "PRIME", fg: "var(--color-status-positive-text)", bg: "var(--color-status-positive-bg)" },
};
