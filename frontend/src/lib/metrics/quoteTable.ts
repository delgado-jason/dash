// WHAT TO QUOTE — every rung of the ladder priced on THIS load, the pass-throughs
// folded in, and where the offer fell against each.
//
// The Score a Load sheet (C4, nodded 2026-11-12): "a verdict tells you whether
// to book; it does not tell you what to counter with." So the result carries
// the whole ladder in dollars — break-even, minimum, target, prime — with the
// margin each rung earns, the rate per driven mile it needs, the quote (the
// rung × driven miles + the grossed-up permits and escorts) and the gap to the
// offer. "Ask $170 more and you are on target" is a sentence you can say on
// the phone; "PROFITABLE" is not. It shows on EVERY result (Call 7.2: show the
// breakdown, always) — above target it says what the offer clears by.
import { marginAtMarkup, RATE_TIERS, type RateTiers } from "@/lib/constants/targets";
import { counterRates } from "./loadScore";

export type Rung = "breakEven" | "minimum" | "target" | "prime";

export interface QuoteRow {
  rung: Rung;
  label: string;
  markup: number; // over break-even; 0 at break-even
  margin: number; // what the rung earns — marginAtMarkup(markup); 0 at break-even
  rpm: number; // $ per DRIVEN mile the rung needs, before pass-throughs
  quote: number; // what to say out loud: rung × driven miles + the pass-through ask
  gap: number | null; // offer − quote; null without an offer
  cleared: boolean; // the offer meets this rung
}

export interface QuoteTable {
  rows: QuoteRow[]; // break-even first, prime last
  cleared: QuoteRow | null; // the highest rung the offer clears
  next: QuoteRow | null; // the first rung it does not
}

const LABELS: Record<Rung, string> = {
  breakEven: "Break-even",
  minimum: "Minimum",
  target: "Target",
  prime: "Prime",
};

// Quotes print in whole dollars, so an offer typed as the printed quote must
// read as clearing it — half a dollar of grace, not a cent.
const TOLERANCE = 0.5;

export const quoteTable = (
  breakevenRpm: number | null,
  drivenMiles: number,
  tiers: RateTiers = RATE_TIERS,
  passThroughAsk = 0,
  offer: number | null = null,
): QuoteTable | null => {
  const c = counterRates(breakevenRpm, drivenMiles, tiers);
  if (!c || breakevenRpm == null) return null;
  const ask = passThroughAsk > 0 ? passThroughAsk : 0;

  const row = (rung: Rung, markup: number, amount: number): QuoteRow => {
    const quote = amount + ask;
    const gap = offer == null ? null : offer - quote;
    return {
      rung,
      label: LABELS[rung],
      markup,
      margin: markup > 0 ? marginAtMarkup(markup) : 0,
      rpm: breakevenRpm * (1 + markup),
      quote,
      gap,
      cleared: gap != null && gap >= -TOLERANCE,
    };
  };

  const rows = [
    row("breakEven", 0, c.floor),
    row("minimum", tiers.minimum, c.minimum),
    row("target", tiers.target, c.take),
    row("prime", tiers.prime, c.steal),
  ];
  const clearedRows = rows.filter((r) => r.cleared);
  return {
    rows,
    cleared: clearedRows.length ? clearedRows[clearedRows.length - 1] : null,
    next: offer == null ? null : (rows.find((r) => !r.cleared) ?? null),
  };
};

const dollars = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

// The sentence under the verdict word: "clears your specialized minimum by
// $145 · ask $170 more to hit target". Break-even is one number for both tier
// sets (it is the cost), so it carries no tier word. null without an offer.
export const quoteSentence = (t: QuoteTable | null, tierWord: string): string | null => {
  if (!t) return null;
  const first = t.rows[0];
  if (first.gap == null) return null;
  if (!t.cleared) return `short of break-even by ${dollars(first.gap)}`;
  const rung =
    t.cleared.rung === "breakEven" ? "break-even" : `your ${tierWord} ${t.cleared.label.toLowerCase()}`;
  const clears = `clears ${rung} by ${dollars(t.cleared.gap as number)}`;
  return t.next
    ? `${clears} · ask ${dollars(t.next.gap as number)} more to hit ${t.next.label.toLowerCase()}`
    : clears;
};
