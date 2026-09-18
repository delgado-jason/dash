import { ValidationError } from "../error.js";

// The windows the /website page offers, and the number of days each one reaches
// back — today included, so "7d" is today and the six days before it. 12 months
// is 365 days rather than a calendar year: the page folds those days into weeks,
// and a fixed day count keeps every bar the same width.
export const WINDOWS = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };

export const DEFAULT_WINDOW = "30d";

// One question asked of the query string: which window? Nothing else on this
// route is user input. `undefined` (no ?window=) and `""` are "didn't ask" and
// get the default; anything the map doesn't hold is a 400 rather than a silent
// fallback, so a typo in a link is visible instead of quietly showing 30 days.
// Express hands back an ARRAY for a repeated param (?window=7d&window=30d) and
// an object for a bracketed one — the typeof gate refuses both before the
// lookup, which would otherwise coerce them to a string.
export function parseWindow(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return { key: DEFAULT_WINDOW, days: WINDOWS[DEFAULT_WINDOW] };
  }

  if (typeof raw !== "string" || !Object.hasOwn(WINDOWS, raw)) {
    throw new ValidationError(
      `window must be one of ${Object.keys(WINDOWS).join(", ")}`,
    );
  }

  return { key: raw, days: WINDOWS[raw] };
}
