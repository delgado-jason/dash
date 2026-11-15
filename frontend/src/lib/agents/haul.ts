// What a desk hauls, in one sentence computed from its loads.
//
// ──────────────────────────────────────────────────────────────────────────
// The dossier's "what they haul" used to print a best load and a footprint
// editor and never said what the desk actually sends. The loads already carry
// the three facts that describe a desk — the freight type, the origin and the
// shipper — and on Jason's book they tell the whole story in a line:
//
//   "Hazmat out of Carlisle, PA — all five loads from Carlisle Syntec. One
//    shipper, one origin: a customer with a lane, not a spot desk."
//
// Nothing here is a grade. It is a count of what was posted, in words.
// ──────────────────────────────────────────────────────────────────────────

import type { Load } from "@/types/load";

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve",
];

/** "five" up to twelve, digits beyond — the way a sentence counts. */
export const countWord = (n: number): string =>
  Number.isInteger(n) && n >= 0 && n < NUMBER_WORDS.length ? NUMBER_WORDS[n] : String(n);

export interface Tally {
  key: string;
  label: string;
  n: number;
}

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const normalize = (s: string): string => s.trim().replace(/\s+/g, " ").toLowerCase();

// Edit distance, only ever asked "is it within one?" — a typed shipper name is
// the same shipper when one letter is missing, doubled or swapped
// ("Carlise Syntec" is "Carlisle Syntec"). Anything further apart is two names.
const withinOne = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/**
 * Count items by key, most common first. `fuzzy` folds near-duplicate keys
 * (one edit apart, six letters or more) into the first spelling seen; the
 * label is the spelling that occurs most.
 */
export const tally = (
  items: Array<{ key: string; label: string } | null>,
  fuzzy = false,
): Tally[] => {
  const buckets: Array<{ key: string; spellings: Map<string, number>; n: number }> = [];
  for (const it of items) {
    if (!it || !it.key) continue;
    let b = buckets.find((x) => x.key === it.key);
    if (!b && fuzzy && it.key.length >= 6)
      b = buckets.find((x) => x.key.length >= 6 && withinOne(x.key, it.key));
    if (!b) {
      b = { key: it.key, spellings: new Map(), n: 0 };
      buckets.push(b);
    }
    b.n += 1;
    b.spellings.set(it.label, (b.spellings.get(it.label) ?? 0) + 1);
  }
  return buckets
    .map((b) => ({
      key: b.key,
      label: [...b.spellings.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0],
      n: b.n,
    }))
    .sort((x, y) => y.n - x.n || x.label.localeCompare(y.label));
};

export interface HaulShape {
  /** loads counted — everything on the file except a TONU, which is not a load */
  loads: number;
  types: Tally[];
  origins: Tally[];
  shippers: Tally[];
}

const typeOf = (l: Load): string => (l.load_type && l.load_type.trim()) || "standard flatbed";

export const haulShape = (loads: Load[]): HaulShape => {
  const counted = loads.filter((l) => String(l.load_status) !== "tonu");
  return {
    loads: counted.length,
    types: tally(counted.map((l) => ({ key: typeOf(l).toLowerCase(), label: typeOf(l).toLowerCase() }))),
    origins: tally(
      counted.map((l) =>
        l.origin_city && l.origin_state
          ? { key: normalize(`${l.origin_city}, ${l.origin_state}`), label: `${l.origin_city.trim()}, ${l.origin_state.trim()}` }
          : null,
      ),
    ),
    shippers: tally(
      counted.map((l) =>
        l.shipper_name && l.shipper_name.trim()
          ? { key: normalize(l.shipper_name), label: l.shipper_name.trim().replace(/\s+/g, " ") }
          : null,
      ),
      true,
    ),
  };
};

// The freight, as the sentence's head — and, when one type dominates, the
// minor type as a tail that reads after the origins ("…, hazmat too").
const typesPhrase = (types: Tally[], total: number): { head: string; tail: string | null } => {
  if (types.length === 0) return { head: "Freight", tail: null };
  if (types.length === 1) return { head: cap(types[0].label), tail: null };
  const [a, b] = types;
  if (types.length === 2 && a.n * 3 >= total * 2)
    return { head: `Mostly ${a.label} (${a.n} of ${total})`, tail: `${b.label} too` };
  const labels = types.map((t) => t.label);
  const last = labels.pop() as string;
  return { head: `${cap(labels.join(", "))} and ${last}`, tail: null };
};

const originsPhrase = (origins: Tally[]): string | null => {
  if (origins.length === 0) return null;
  if (origins.length === 1) return `out of ${origins[0].label}`;
  if (origins.length === 2) return `out of ${origins[0].label} and ${origins[1].label}`;
  return origins[0].n >= 2
    ? `out of ${countWord(origins.length)} cities, ${origins[0].label} most`
    : `out of ${countWord(origins.length)} different cities`;
};

// The shippers, counted over the loads that NAME one. A load with no shipper
// on record is said so, never folded into "every load a different shipper".
const shippersPhrase = (shippers: Tally[], named: number, total: number): string => {
  if (named === 0) return "no shipper on record";
  const top = shippers[0];
  const unnamed = total - named;
  const rest = unnamed > 0 ? `, ${countWord(unnamed)} with no shipper on record` : "";
  if (shippers.length === 1 && named === total) return `all ${countWord(total)} loads from ${top.label}`;
  if (shippers.length === 1) return `${top.label} on ${countWord(named)} of ${countWord(total)}${rest}`;
  if (top.n >= 2) return `${countWord(top.n)} of ${countWord(named)} from ${top.label}${rest}`;
  return `${countWord(named)} loads, ${countWord(named)} shippers${rest}`;
};

// Customer or spot desk — said only when at least half the loads name a
// shipper, because a verdict on the unnamed half would be a guess.
const verdictPhrase = (shape: HaulShape, named: number): string | null => {
  const { shippers, origins, loads } = shape;
  if (named === 0 || named * 2 < loads) return null;
  const top = shippers[0];
  if (shippers.length === 1 && named === loads)
    return origins.length === 1
      ? "One shipper, one origin: a customer with a lane, not a spot desk."
      : "One shipper: a customer, not a spot desk.";
  if (shippers.length === 1) return "One shipper wherever one is named: a customer, not a spot desk.";
  if (top.n >= 2 && top.n * 2 >= named) return "Mostly one customer, with others around it.";
  if (top.n >= 2) return "Some repeat business; the rest spot.";
  return "Every named load a different shipper: a spot desk.";
};

/**
 * The sentence, or null when there is nothing to generalise — a desk with one
 * load gets that load described, not a pattern claimed from a sample of one.
 */
export const haulSentence = (loads: Load[]): string | null => {
  const shape = haulShape(loads);
  if (shape.loads < 2) return null;
  const named = shape.shippers.reduce((n, t) => n + t.n, 0);
  const types = typesPhrase(shape.types, shape.loads);
  const origins = originsPhrase(shape.origins);
  const shippers = shippersPhrase(shape.shippers, named, shape.loads);
  const verdict = verdictPhrase(shape, named);
  const head = `${types.head}${origins ? ` ${origins}` : ""}${types.tail ? `, ${types.tail}` : ""}`;
  return `${head} — ${shippers}.${verdict ? ` ${verdict}` : ""}`;
};
