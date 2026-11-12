// Which P&L categories have a vendor directory behind them.
//
// Repairs & maintenance is $21,437 over ten months — the third-largest cost
// after fuel and payroll — and the Expenses page contained the word "vendor"
// exactly zero times. The spend and the people you paid it to lived on two
// pages that never mentioned each other.
//
// A MAP, NOT A GUESS. Matching on substrings would quietly link "Trailer
// Plates" to a tyre shop the first time someone renamed a category. These are
// the pairs that are actually true, and anything unlisted simply gets no link
// — a missing link is a small loss, a wrong one sends you to the wrong page.
//
// Keys are compared case-insensitively and trimmed, because P&L category names
// arrive from a QuickBooks export and have carried stray whitespace before.
const PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["repairs & maintenance", "Shop"],
  ["repairs and maintenance", "Shop"],
  ["permits - truck", "Permits"],
  ["permits", "Permits"],
  ["escort", "Escort / Pilot Car"],
  ["pilot car", "Escort / Pilot Car"],
];

const BY_KEY = new Map(PAIRS);

/**
 * The vendor category a P&L category is paid to, or null when there isn't one.
 *
 * Null is the common answer and the right one: fuel, payroll, insurance and
 * most of the ledger have no vendor directory behind them.
 */
export const vendorCategoryFor = (expenseCategory: string | null | undefined): string | null => {
  const key = String(expenseCategory ?? "").trim().toLowerCase();
  if (key === "") return null;
  return BY_KEY.get(key) ?? null;
};
