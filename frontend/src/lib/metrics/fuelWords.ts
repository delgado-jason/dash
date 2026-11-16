// The Fuel page's sentences (the Fuel page sheet, 2026-11-15): the last tank
// as one sentence with the figures the scorecard used to carry, the vendor
// line's one sentence, the fuel-tax line. Pure, so the words are pinned.
import type { FuelStats, TankRecap } from "./fuelEconomy";
import type { VendorLine } from "./fuelVendors";
import type { FuelTaxMonth } from "./fuelTax";

const money0 = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;
const dayWords = (iso: string): string =>
  new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const monthLong = (iso: string): string =>
  new Date(`${String(iso).slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
const monthShort = (ym: string): string =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });

// "0.65 above your lifetime" · "0.04 under the tank before it" · a hair either
// way reads level.
const vs = (delta: number, what: string): string =>
  Math.abs(delta) < 0.005 ? `level with ${what}` : `${Math.abs(delta).toFixed(2)} ${delta > 0 ? "above" : "under"} ${what}`;

/**
 * The last tank, as the mock read it:
 * "The last tank closed Nov 14 at Tuscumbia, AL: 982 miles on 137 gallons,
 * 7.17 MPG — 0.65 above your lifetime, 0.04 under the tank before it. $712
 * for the tank, $0.73 a mile against $0.74 over the last thirty days, $5.19 a
 * gallon against the EIA's $6.21 for November."
 */
export const lastTankSentence = (
  recap: TankRecap | null,
  place: string | null,
  stats: FuelStats,
  national: { month: string; value: number }[],
): string => {
  if (!recap) return "No full tank has closed yet — the first tank reads here once two fulls are on the log.";
  const t = recap.tank;
  const life = recap.mpgVsAvg == null ? "your first full tank" : vs(recap.mpgVsAvg, "your lifetime");
  const last = recap.mpgVsLast == null ? "" : `, ${vs(recap.mpgVsLast, "the tank before it")}`;
  const def = t.defCost > 0 ? ` (${money0(t.defCost)} of it DEF)` : "";
  // cpmVsAvg is null when this tank is the only window in thirty days — the
  // thirty-day rate would be this tank again, and "against itself" says nothing.
  const rate =
    recap.cpmVsAvg != null && stats.costPerMile30 != null
      ? ` against $${stats.costPerMile30.toFixed(2)} over the last thirty days`
      : stats.windows30 <= 1
        ? " — the only tank in the last thirty days"
        : "";
  const nat = national.find((n) => n.month === String(t.date).slice(0, 7));
  const eia = nat ? ` against the EIA's $${nat.value.toFixed(2)} for ${monthLong(t.date)}` : ` — no EIA figure for ${monthLong(t.date)} yet`;
  return (
    `The last tank closed ${dayWords(t.date)}${place ? ` at ${place}` : ""}: ` +
    `${Math.round(t.miles).toLocaleString("en-US")} miles on ${Math.round(t.gallons)} gallons, ${t.mpg.toFixed(2)} MPG — ${life}${last}. ` +
    `${money0(t.cost + t.defCost)} for the tank${def}, $${recap.costPerMile.toFixed(2)} a mile${rate}, ` +
    `$${recap.pricePerGallon.toFixed(2)} a gallon${eia}.`
  );
};

/**
 * The vendor line's sentence: the dearest named vendor against the cheapest,
 * both with at least three fills, and what the gap cost across the dearest
 * one's gallons — "Love's runs 22¢ a gallon over TA·Petro on your own
 * receipts — about $370 across those 14 fills". null until two vendors earn it.
 */
export const vendorSentence = (lines: VendorLine[]): string | null => {
  const named = lines.filter((l) => l.vendor != null && l.ppg != null && l.fills >= 3);
  if (named.length < 2) return null;
  const byPrice = [...named].sort((a, b) => (a.ppg as number) - (b.ppg as number));
  const cheap = byPrice[0];
  const dear = byPrice[byPrice.length - 1];
  const gap = (dear.ppg as number) - (cheap.ppg as number);
  const cents = Math.round(gap * 100);
  if (cents < 1) return `${dear.vendor} and ${cheap.vendor} price within a cent of each other on your own receipts`;
  const dollars = Math.round((gap * dear.gallons) / 10) * 10;
  const perGal = cents < 100 ? `${cents}¢` : `$${gap.toFixed(2)}`;
  return `${dear.vendor} runs ${perGal} a gallon over ${cheap.vendor} on your own receipts — about $${dollars.toLocaleString("en-US")} across those ${dear.fills} fills`;
};

/**
 * Landstar's fuel-tax line over the state strip: "Landstar's FUEL TAX on the
 * settlements: Sep $91 · Aug $58 · Jul $23 — the gallons below are what it is
 * figured from". Only months since the log began; the newest eight.
 */
export const fuelTaxLine = (months: FuelTaxMonth[], logFrom: string | null): string => {
  const since = logFrom ? months.filter((m) => m.month >= logFrom.slice(0, 7)) : months;
  if (since.length === 0) return "no FUEL TAX line on the settlements yet — Landstar files IFTA and takes it monthly; the gallons below are what it is figured from";
  const list = since
    .slice(0, 8)
    .map((m) => `${monthShort(m.month)} ${money0(m.amount)}`)
    .join(" · ");
  return `Landstar's FUEL TAX on the settlements: ${list} — the gallons below are what it is figured from`;
};

/** "17 fills unassigned — May 24 to Jul 8, the import — 1,975 gal · $8,213" */
export const unassignedLine = (u: { fills: number; gal: number; spend: number; from: string | null; to: string | null }): string => {
  const span = u.from && u.to ? (u.from === u.to ? dayWords(u.from) : `${dayWords(u.from)} to ${dayWords(u.to)}`) : null;
  return `${u.fills} fill${u.fills === 1 ? "" : "s"} unassigned${span ? ` — ${span}, the import —` : " —"} ${Math.round(u.gal).toLocaleString("en-US")} gal · ${money0(u.spend)}`;
};
