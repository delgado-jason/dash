// Landstar's weekly fuel-surcharge scale — the pure rules ("General Items" Nod
// Sheet mock 8, call 8 lean A, nodded 2026-11-08). The weekly Ranger report
// prints the scale's OUTPUT for the week, not a band table: "National Average
// $6.292 → .86 cents per mile · 52% of the linehaul", plus regional PADD
// points. Each (price, cents-per-mile) pair is a point; the scale is
//   cents per mile = (price − peg) ÷ base mpg, rounded to the cent,
// and every new week pins peg and base a little tighter. A fit needs at least
// two distinct prices (one report with its PADD lines already gives four);
// with fewer, there is no scale — the estimate stands, named as one.
import type { FscRegionPoint, FscScalePoint } from "@/types/fscScalePoint";

// ---- reading the report's header lines ----

export interface ParsedScalePaste {
  week_of: string | null; // from "effective 11/03/26 through 11/09/26"
  national_avg: number | null;
  cents_per_mile: number | null; // $ per loaded mile
  pct_of_linehaul: number | null;
  regions: FscRegionPoint[];
  rejected: string[]; // lines with digits dash could not place
}

// A rate of 5 or more is cents; "1.03" is already dollars a mile.
export const toDollarsPerMile = (n: number): number => (n >= 5 ? n / 100 : n);

const two = (n: number) => String(n).padStart(2, "0");

// "11/03/26" → "2026-11-03" (two- or four-digit year); null when not a date.
export const usDateKey = (s: string): string | null => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const mo = Number(m[1]);
  const d = Number(m[2]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${two(mo)}-${two(d)}`;
};

const REGION = /\((PADD\s*[0-9][A-Z]?)\)/i;

// Reads the header of the weekly report, or just its one line. Prices carry
// a "$"; a rate may read ".86", "86", "1.03" or "52%".
export const parseScalePaste = (text: string): ParsedScalePaste => {
  const out: ParsedScalePaste = { week_of: null, national_avg: null, cents_per_mile: null, pct_of_linehaul: null, regions: [], rejected: [] };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/effective/i.test(line) && usDateKey(line)) {
      out.week_of = usDateKey(line);
      continue;
    }
    const nums = (line.replace(/,/g, "").match(/\$?\d*\.?\d+/g) ?? []).filter((t) => /\d/.test(t));
    if (nums.length === 0) continue; // a header with no figures
    const prices = nums.filter((t) => t.startsWith("$")).map((t) => Number(t.slice(1)));
    const price = prices[0] ?? Number(nums[0]);
    const pctLine = /%/.test(line);
    const rest = nums.filter((t) => !t.startsWith("$")).map(Number);
    const rate = rest.length ? rest[rest.length - 1] : null;
    const region = line.match(REGION)?.[1]?.replace(/\s+/g, " ").toUpperCase() ?? null;
    if (!Number.isFinite(price) || price <= 0 || price > 20 || rate == null) {
      out.rejected.push(line);
      continue;
    }
    if (pctLine) {
      const pct = rate > 1 ? rate / 100 : rate;
      if (pct < 0 || pct > 5) out.rejected.push(line);
      else out.pct_of_linehaul = pct;
      if (out.national_avg == null) out.national_avg = price;
      continue;
    }
    const cpm = toDollarsPerMile(rate);
    if (cpm < 0 || cpm > 5) {
      out.rejected.push(line);
      continue;
    }
    if (region) out.regions.push({ region, price, cpm });
    else if (out.national_avg == null || out.cents_per_mile == null) {
      out.national_avg = price;
      out.cents_per_mile = cpm;
    } else out.rejected.push(line); // a second national line — say so rather than guess
  }
  return out;
};

// The sentences a paste needs before it can be saved (the server repeats them).
export const scalePasteErrors = (p: ParsedScalePaste): string[] => {
  const errs: string[] = [];
  if (!p.week_of) errs.push("the week needs its date — the report's \"effective\" line, or type it");
  if (p.national_avg == null) errs.push("the national average price was not found — the line reads \"National Average $6.292 .86\"");
  if (p.cents_per_mile == null) errs.push("the cents per mile was not found — the line reads \"National Average $6.292 .86\"");
  return errs;
};

// ---- the fit ----

export interface ScalePair {
  price: number;
  cpm: number;
}

export interface FscScaleFit {
  peg: number; // $/gal the surcharge does not cover
  mpg: number; // the schedule's base miles per gallon
  reports: number; // weekly points on file
  pairs: number; // (price, cpm) pairs the fit read
  maxMissCents: number; // the worst gap between a published cent and the fit, in cents
}

export const scalePairs = (points: FscScalePoint[]): ScalePair[] => {
  const out: ScalePair[] = [];
  for (const p of points) {
    out.push({ price: p.national_avg, cpm: p.cents_per_mile });
    for (const r of p.regions) out.push({ price: r.price, cpm: r.cpm });
  }
  return out;
};

// Least squares on cpm = a + b·price (b = 1/mpg, a = −peg/mpg). Needs two
// distinct prices and a rising line; null otherwise — never a guessed scale.
export const fitScale = (points: FscScalePoint[]): FscScaleFit | null => {
  const pairs = scalePairs(points);
  const distinct = new Set(pairs.map((p) => p.price.toFixed(3)));
  if (pairs.length < 2 || distinct.size < 2) return null;
  const n = pairs.length;
  const mx = pairs.reduce((s, p) => s + p.price, 0) / n;
  const my = pairs.reduce((s, p) => s + p.cpm, 0) / n;
  const sxx = pairs.reduce((s, p) => s + (p.price - mx) ** 2, 0);
  const sxy = pairs.reduce((s, p) => s + (p.price - mx) * (p.cpm - my), 0);
  if (sxx <= 0) return null;
  const b = sxy / sxx;
  if (b <= 0) return null;
  const a = my - b * mx;
  const mpg = 1 / b;
  const peg = -a / b;
  const maxMissCents = Math.max(...pairs.map((p) => Math.abs(Math.round(((p.price - peg) / mpg) * 100) - Math.round(p.cpm * 100))));
  return { peg: Math.round(peg * 1000) / 1000, mpg: Math.round(mpg * 100) / 100, reports: points.length, pairs: n, maxMissCents };
};

// The scale's cents per mile at a price, rounded to the cent like Landstar.
export const scaleCpmAt = (fit: FscScaleFit, price: number): number => Math.max(0, Math.round(((price - fit.peg) / fit.mpg) * 100) / 100);

// The report whose week holds `day` (week_of ≤ day < week_of + 7), else null.
export const pointForDay = (points: FscScalePoint[], day: string): FscScalePoint | null => {
  let best: FscScalePoint | null = null;
  for (const p of points) {
    if (p.week_of <= day && (best == null || p.week_of > best.week_of)) best = p;
  }
  if (!best) return null;
  const start = new Date(`${best.week_of}T00:00:00Z`).getTime();
  const at = new Date(`${day.slice(0, 10)}T00:00:00Z`).getTime();
  return at - start < 7 * 86_400_000 ? best : null;
};

// ---- words ----

export const centsWords = (cpm: number): string => `${Math.round(cpm * 100)}¢`;

// "Nov 3" — the week's first day as the sheet prints it.
export const shortDay = (key: string): string =>
  new Date(`${key.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// "national $6.292 → 86¢ / mi · 52% of the linehaul · PADD 1A $6.416 → 88¢ · …"
export const pointWords = (p: FscScalePoint): string => {
  const parts = [`national $${p.national_avg.toFixed(3)} → ${centsWords(p.cents_per_mile)} / mi`];
  if (p.pct_of_linehaul != null) parts.push(`${Math.round(p.pct_of_linehaul * 1000) / 10}% of the linehaul`);
  for (const r of p.regions) parts.push(`${r.region} $${r.price.toFixed(3)} → ${centsWords(r.cpm)}`);
  return parts.join(" · ");
};

// "cents per mile = (price − $1.29) ÷ 5.81 mpg · 1 report, 4 points · worst miss 0¢"
export const fitWords = (f: FscScaleFit): string =>
  `cents per mile = (price − $${f.peg.toFixed(2)}) ÷ ${f.mpg.toFixed(2)} mpg · ${f.reports} report${f.reports === 1 ? "" : "s"}, ${f.pairs} point${f.pairs === 1 ? "" : "s"} · worst miss ${f.maxMissCents}¢`;
