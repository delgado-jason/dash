// Landstar's fuel-surcharge band table — the pure rules (GL-155, Jason
// 2026-11-05: "it's a price-band table", published often, no API; General
// Items Nod Sheet mock 5, call 5 lean A, nodded 2026-11-07: keep every pasted
// table with its effective date; a past month's par uses the table in force
// then).
//
// A band: a national-average diesel price range ($/gal, inclusive) → the
// surcharge in $ per LOADED mile. The table in force on a day is the row with
// the latest effective_from on or before it. A price with no band (below the
// first band) has no par — never a guessed surcharge.
import type { FscBand, FscSchedule } from "@/types/fscSchedule";

export const sortSchedules = (s: FscSchedule[]): FscSchedule[] =>
  [...s].sort((a, b) => (a.effective_from < b.effective_from ? -1 : a.effective_from > b.effective_from ? 1 : 0));

export const scheduleInForce = (schedules: FscSchedule[], day: string): FscSchedule | null => {
  let best: FscSchedule | null = null;
  for (const s of schedules) {
    if (s.effective_from <= day && (best == null || s.effective_from > best.effective_from)) best = s;
  }
  return best;
};

export const sortBands = (bands: FscBand[]): FscBand[] => [...bands].sort((a, b) => a.low - b.low);

// ---- reading a pasted table ----

// A surcharge above $5 a loaded mile does not exist; a number that size is cents.
export const toDollarsPerMile = (n: number): number => (n >= 5 ? n / 100 : n);

// Plausible: diesel between $0 and $20 a gallon, a surcharge between $0 and $5
// a mile. Anything else on a line with digits is a header or a date, not a band.
const plausible = (b: FscBand): boolean =>
  b.low >= 0 && b.low <= 20 && (b.high == null || (b.high > b.low && b.high <= 20)) && b.cpm >= 0 && b.cpm <= 5;

const OPEN_ENDED = /\b(and\s+(up|above|over|higher)|or\s+(more|higher|above)|above|over|plus)\b|\+\s*$/i;

export interface ParsedPaste {
  bands: FscBand[]; // ascending by low
  rejected: string[]; // lines with digits dash could not read as a band — shown back, never guessed
}

// Each line with three numbers reads low, high, rate; a line that says "and up"
// (or ends in "+") with two numbers reads low, open, rate. "$" and "," are
// ignored; a rate of 5 or more is cents. Lines without digits are headers.
export const parseFscPaste = (text: string): ParsedPaste => {
  const bands: FscBand[] = [];
  const rejected: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const nums = (line.replace(/[$,]/g, "").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (nums.length === 0) continue;
    const open = OPEN_ENDED.test(line);
    let band: FscBand | null = null;
    if (open && nums.length >= 2) band = { low: nums[0], high: null, cpm: toDollarsPerMile(nums[nums.length - 1]) };
    else if (nums.length >= 3) band = { low: nums[0], high: nums[1], cpm: toDollarsPerMile(nums[2]) };
    if (band && plausible(band)) bands.push(band);
    else rejected.push(line);
  }
  return { bands: sortBands(bands), rejected };
};

// ---- words ----

// "$4.00" · "$4.049" — three decimals only when the table carries them.
export const priceWords = (n: number): string =>
  "$" + (Math.round(n * 1000) % 10 === 0 ? n.toFixed(2) : n.toFixed(3));

export const centsWords = (cpm: number): string => `${Math.round(cpm * 100)}¢`;

// "$4.00–$4.049" · "$6.00 and up"
export const bandWords = (b: FscBand): string =>
  b.high == null ? `${priceWords(b.low)} and up` : `${priceWords(b.low)}–${priceWords(b.high)}`;

// ---- judging a table before it is saved (the same sentences on the server) ----
export const bandErrors = (bands: FscBand[]): string[] => {
  const errs: string[] = [];
  if (bands.length < 2) errs.push("a surcharge table needs at least two bands");
  const sorted = sortBands(bands);
  sorted.forEach((b, i) => {
    if (b.high != null && b.high < b.low) errs.push(`the band ${bandWords(b)} runs backwards`);
    if (b.cpm < 0 || b.cpm > 5)
      errs.push(`the band ${bandWords(b)} pays $${b.cpm.toFixed(2)} a mile — outside $0–$5`);
    if (b.high == null && i !== sorted.length - 1) errs.push('only the last band can run "and up"');
    const prev = sorted[i - 1];
    if (prev && prev.high != null && b.low <= prev.high)
      errs.push(`the bands ${bandWords(prev)} and ${bandWords(b)} overlap`);
  });
  return errs;
};

// The band a price falls in. A price in a gap between two bands (tables step
// by a tenth of a cent) reads the band below it; a price below the first band
// has no band — the caller says so.
export const bandFor = (bands: FscBand[], price: number): FscBand | null => {
  const sorted = sortBands(bands);
  const exact = sorted.find((b) => price >= b.low && (b.high == null || price <= b.high));
  if (exact) return exact;
  let floor: FscBand | null = null;
  for (const b of sorted) if (b.low <= price) floor = b;
  return floor;
};

// ---- the par a month is graded against ----
export type FscPar =
  | {
      kind: "table"; // the table in force that month, at the national diesel price
      effective_from: string;
      price: number; // $/gal — the month's national average, or this week's for the running month
      priceIsThisWeek: boolean;
      cpm: number; // the band's $ per loaded mile
      expectedFsc: number; // loaded miles × cpm
    }
  | {
      kind: "scale"; // no table in force, but Landstar's weekly points fit the scale (mock 8)
      price: number;
      priceIsThisWeek: boolean;
      cpm: number;
      reports: number; // weekly reports on file
      pairs: number; // (price, cpm) pairs the fit read
      published: boolean; // the price is a report's own national average, so the cent is the printed one
    }
  | { kind: "estimate" } // no table and no scale — the peg formula, labelled
  | { kind: "unknown"; reason: string }; // a table or scale is in force but the month cannot be priced

// "Oct 1" — the effective date as the sheet prints it.
const shortDay = (key: string): string =>
  new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const fscParWords = (p: FscPar): string => {
  if (p.kind === "table")
    return `par on Landstar's table (eff. ${shortDay(p.effective_from)}) at ${p.priceIsThisWeek ? "this week's " : ""}$${p.price.toFixed(3)}: ${centsWords(p.cpm)} a loaded mile`;
  if (p.kind === "scale")
    return `par on Landstar's scale at ${p.priceIsThisWeek ? "this week's " : ""}$${p.price.toFixed(3)}: ${centsWords(p.cpm)} a loaded mile · ${p.published ? "the week's printed rate" : `fitted from ${p.reports} report${p.reports === 1 ? "" : "s"}, ${p.pairs} points`}`;
  if (p.kind === "estimate")
    return "par · estimate — the price above the ~$1.29/gal peg on loaded miles; paste this week's Landstar line in Settings for the real number";
  return `par unknown — ${p.reason}`;
};
