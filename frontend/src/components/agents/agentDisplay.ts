// Shared display metadata for the agents list — the freight badge by a name.
//
// The Go-to tier chips, the row tint, the ⚠ "gut vs data" flag, the trend
// glyphs and the Dwell word lived here until v1.292.0. Jason's rule (Nov 15,
// 2026): an agent is graded by his rating and nothing else, so the list stops
// drawing a second opinion. The scorecard engine that computed them is
// untouched — the Foreman still reads it to build its call queue.
import type { SpecialtyTag } from "@/lib/metrics/agentScorecard";

export const SPECIALTY_META: Record<
  Exclude<SpecialtyTag, "standard">,
  { label: string; fg: string; bg: string; border: string }
> = {
  oversize: { label: "OVERSIZE", fg: "var(--color-amber-hi)", bg: "var(--color-status-aware-bg)", border: "color-mix(in srgb, var(--color-amber-hi) 45%, transparent)" },
  specialty: { label: "SPECIALTY", fg: "var(--color-cat2)", bg: "color-mix(in srgb, var(--color-cat2) 15%, transparent)", border: "color-mix(in srgb, var(--color-cat2) 40%, transparent)" },
};
