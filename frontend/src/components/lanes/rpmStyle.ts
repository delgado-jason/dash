import { BREAK_EVEN_RPM } from "@/lib/constants/targets";
import { rpm } from "@/lib/format";
import { PER_DAY_TONE_VAR, type PerDayTone } from "@/lib/metrics/perDay";

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

// The $/day figure's colour, as a Tailwind class. The RULE lives in
// lib/metrics/perDay (perDayTone) and so does the COLOUR (PER_DAY_TONE_VAR);
// this only spells that one token the way a className wants it, because
// Tailwind's utility for a theme token is the token's own name:
// --color-status-positive-text → text-status-positive-text. Derived, not
// re-listed, so the lanes table, the Foreman, the scorecard and the load
// header can never disagree about what green means. (Those three utilities
// are written out literally just above, so the scanner still emits them.)
//
// No verdict is NOT a colour: "" inherits whatever ink the row already wears.
// Greying it would say "thin data" about a figure that may be perfectly solid
// — it just has no daily target to be judged against yet. The under-the-bar
// grey is the caller's call, not this function's.
const classOfToken = (cssVar: string): string =>
  cssVar.replace("var(--color-", "text-").replace(")", "");

export const perDayTextClass = (tone: PerDayTone | null): string =>
  tone == null ? "" : classOfToken(PER_DAY_TONE_VAR[tone]);
