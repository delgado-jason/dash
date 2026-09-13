// The two numbers the log sheet takes off an invoice, parsed once and shared.
//
// Both exist because the box is a free-text field and a man with a greasy
// invoice types what he sees: "568,737", "1240.5", "$1,358.70". The old sheet
// stripped every non-digit BEFORE parsing, which ate the decimal point and
// multiplied the number by ten — "1240.5" became 12,405 and "568737.0" became
// 5,687,370. An odometer is a HIGH-WATER MARK (maxOdometer keeps the largest
// reading it has ever seen), so one fat-fingered decimal would have pinned the
// truck's mileage in the millions forever, with no screen to take it back.

// A meter reading. Keeps the decimal point through the strip, then TRUNCATES —
// meters read whole units, and 1240.5 hours is 1240 hours and a half he has
// not finished. A blank box is a reading nobody took: null, never 0.
export const parseReading = (v: string): number | null => {
  const cleaned = v.replace(/[^0-9.-]/g, "");
  if (cleaned.trim() === "") return null;
  const n = parseInt(cleaned, 10); // parseInt stops at the dot — 1240.5 → 1240
  return Number.isFinite(n) ? n : null;
};

// What the shop charged. The dollar sign, the thousands commas and any spaces
// are noise around the number; the decimal point is the number. Blank → null,
// because "no price on this one yet" is not "$0".
export const parseCost = (v: string): number | null => {
  const cleaned = v.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};
