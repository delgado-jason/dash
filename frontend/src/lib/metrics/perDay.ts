// DOLLARS PER DAY — what the freight pays for the days it owns the truck
// (Daily Dollars and Shop Nod Sheet, decisions 1A / 2A / 3A).
//
// The rule, once, so all six surfaces say the same thing:
//
//   • Per load: gross ÷ days, gross = `loadGross` (the full customer rate —
//     linehaul + FSC + the accessorials it already carries) and days =
//     pickup_date → delivery_date INCLUSIVE. A one-day haul owns the truck
//     for a day, so a same-day pickup/delivery is 1, not 0.
//   • The days are CALENDAR days, because a load owns calendar days: the
//     truck is under it over the weekend the same as over a Tuesday. So the
//     bar it is judged against is per calendar day too — the ladder's
//     dailyBreakEvenCalendar / dailyTargetCalendar (cost spread over 365/12
//     days a month), never the dashboard's working-day pair, which spreads
//     the same cost over 22 and would call a fair Fri→Mon run a loser.
//   • Aggregates are WEIGHTED — Σgross ÷ Σdays — never a mean of ratios. A
//     two-day $2,300 load and a five-day $5,220 load earn $1,074 a day
//     together; averaging their rates gives $1,097, which neither of them
//     earned and the truck never saw.
//   • Only DELIVERED loads feed an aggregate. A booked load's own header may
//     show its PLANNED $/day (loadPerDay) when both dates exist — that is a
//     plan, not earnings, and it never joins a roll-up.
//   • No dates, no number: null, never $0. A load with no delivery date yet
//     is excluded from the aggregate and draws "—" on its own row. Bad data
//     goes the same way and never the flattering way: a delivery logged
//     before its pickup, or a delivered load with no gross on it, is dropped
//     rather than clamped or counted at $0.
//
// Dates are DATE columns: they arrive as ISO strings and are compared as day
// keys (CLAUDE.md §5) — never `new Date(dateOnly)` local math, which would
// lose or gain a day either side of a DST boundary.
import type { Load } from "@/types/load";
import { loadGross } from "./rateTargets";
import { daysBetweenKeys, keyOf } from "@/lib/relationships/dayKeys";
import { money } from "@/lib/format";

// ---------------------------------------------------------------- the figure

export interface PerDayTotals {
  perDay: number | null; // Σgross ÷ Σdays — null when Σdays is 0
  days: number; // days the counted loads owned the truck
  gross: number; // Σ loadGross over those loads
  loads: number; // how many loads actually counted
}

// Days this load owns the truck: pickup → delivery inclusive. null when it is
// cancelled or either date is missing — "we don't know", which is not the
// same as "one day".
//
// A delivery logged BEFORE its pickup is bad data, not a one-day haul:
// clamping it to 1 would hand the load the smallest possible denominator and
// the biggest possible $/day, so a typo would read as the best freight on the
// book. It returns null and drops out of every aggregate instead.
export const loadDays = (l: Load): number | null => {
  if (l.load_status === "cancelled") return null;
  if (!l.pickup_date || !l.delivery_date) return null;
  const span = daysBetweenKeys(keyOf(l.pickup_date), keyOf(l.delivery_date)) + 1;
  if (!Number.isFinite(span)) return null; // an unparseable date is not a day count
  return span < 1 ? null : span;
};

// One load's own $/day. Planned while it is booked, actual once delivered —
// the load header is the only surface that shows the planned one.
export const loadPerDay = (l: Load): number | null => {
  const days = loadDays(l);
  if (days == null) return null;
  const gross = loadGross(l);
  if (!Number.isFinite(gross)) return null;
  return gross / days;
};

// The weighted roll-up over an agent, a lane, an agency or the fleet. Only
// DELIVERED loads with a usable day span count, so a caller can hand over a
// whole book without filtering first and still get the same answer as one
// that pre-filtered. Σdays = 0 → null, never $0.
//
// A delivered load with no gross on it — 0, negative, or unparseable — is
// missing data, not free freight. It is skipped whole: it adds no days and no
// dollars, so it can neither dilute the rate nor flatter it. `loads` counts
// what actually fed the figure, which is what the surfaces gate their colour
// on — never the size of the group they were handed.
export const perDayOver = (loads: Iterable<Load>): PerDayTotals => {
  let gross = 0;
  let days = 0;
  let n = 0;
  for (const l of loads) {
    if (l.load_status !== "delivered") continue;
    const d = loadDays(l);
    if (d == null) continue;
    const g = loadGross(l);
    if (!Number.isFinite(g) || g <= 0) continue;
    gross += g;
    days += d;
    n++;
  }
  return { perDay: days > 0 ? gross / days : null, days, gross, loads: n };
};

// ------------------------------------------------------------------ the tone

export type PerDayTone = "good" | "warn" | "bad";

// The two CALENDAR-day figures `getGrossTargets` derives from your true cost —
// the shape the pages already hold as `targets.gross`. Structural on purpose:
// the rule depends on two numbers, not on the hook that produced them. The
// working-day pair (`dailyBreakEven` / `dailyTarget`, cost ÷ 22) lives on the
// same object and belongs to the dashboard's "did I earn today" board — it is
// the wrong bar for a figure whose denominator counts weekends.
export interface DailyTargets {
  dailyBreakEvenCalendar: number | null;
  dailyTargetCalendar: number | null;
}

// Decision 2A: judge $/day against the ladder's own daily target — YOUR cost
// and YOUR margin goal, per calendar day. (Not the $/mi column's fixed tiers:
// those are rates per mile and know nothing about your P&L.)
//   good ≥ dailyTargetCalendar · warn ≥ dailyBreakEvenCalendar · bad below it.
// No figure, or no targets, is no verdict: null, never a colour.
export const perDayTone = (
  perDay: number | null | undefined,
  targets: DailyTargets | null | undefined,
): PerDayTone | null => {
  if (perDay == null || targets == null) return null;
  const { dailyBreakEvenCalendar, dailyTargetCalendar } = targets;
  if (dailyBreakEvenCalendar == null || dailyTargetCalendar == null) return null;
  if (perDay >= dailyTargetCalendar) return "good";
  if (perDay >= dailyBreakEvenCalendar) return "warn";
  return "bad";
};

// The tone said in words — the sub-line under every $/day figure. One
// vocabulary, so the Foreman, the scorecard and the load header agree.
export const PER_DAY_TONE_WORD: Record<PerDayTone, string> = {
  good: "above target",
  warn: "near target",
  bad: "under break-even",
};

export const perDayToneWord = (tone: PerDayTone | null): string | null =>
  tone == null ? null : PER_DAY_TONE_WORD[tone];

// …and the tone said in colour, once, for the same reason. The value is the
// theme token each tone paints with: the load header's chip drops it straight
// into a style, and `rpmStyle.perDayTextClass` turns the same token into the
// Tailwind utility the lanes table, the Foreman and the scorecard wear
// (--color-status-positive-text → text-status-positive-text). One list — no
// surface can quietly decide green means something else.
export const PER_DAY_TONE_VAR: Record<PerDayTone, string> = {
  good: "var(--color-status-positive-text)",
  warn: "var(--color-status-aware-text)",
  bad: "var(--color-status-negative-text)",
};

// ------------------------------------------------------------- the formatter

// "$1,360" — whole dollars, because cents on a daily average is false
// precision. null → "—", so a surface never draws a $0 for no data.
export const fmtPerDay = (n: number | null | undefined): string => money(n);
