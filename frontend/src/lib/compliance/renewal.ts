// "Mark renewed" — the pure half. The cadence's next expiry, the history line
// under the row, and the sheet's own validation, all as string→string work on
// day keys so no Date ever crosses a timezone on the way to a DATE column.
import type { ComplianceRenewal, LastRenewal } from "@/types/compliance";
import { keyOf, localDayKey } from "@/lib/relationships/dayKeys";

// The day the sheet opens on: the OWNER's today, not UTC's. After ~7pm Central
// toISOString is already tomorrow, and "renewed on" is a calendar fact.
export const todayKey = (now: Date): string => localDayKey(now);

// The ceiling on "renewed on" — the owner's tomorrow, in their own calendar.
const tomorrowKey = (now: Date): string =>
  localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// A well-shaped key that is also a real day: Feb 30 parses (it rolls into
// March), so the only honest test is to format the parsed day back.
export const isDayKey = (v: string | null | undefined): v is string => {
  if (typeof v !== "string" || !DAY_KEY.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === v;
};

/**
 * The expiry a cadence implies: calendar months from the renewal day, clamped
 * to the end of the month it lands in — Jan 31 + 1 mo is Feb 28 (Feb 29 in a
 * leap year), never March 3 by day-overflow. The same clamp the touch chips'
 * `addMonth` uses, done on keys instead of Dates so the year rolls with it.
 *
 * null in (no cadence, no date, a date that isn't real) → null out; the sheet
 * then asks for the expiry instead of guessing.
 */
export const nextExpiry = (
  renewedOn: string | null | undefined,
  renewalMonths: number | null | undefined,
): string | null => {
  if (!isDayKey(renewedOn) || !renewalMonths || !Number.isInteger(renewalMonths))
    return null;
  const [y, m, d] = renewedOn.split("-").map(Number);
  // 0-based absolute months, so adding rolls the year without a Date.
  const abs = (y - 1) * 12 + (m - 1) + renewalMonths;
  const year = Math.floor(abs / 12) + 1;
  const month = (abs % 12) + 1;
  // Day 0 of the FOLLOWING month is the last day of this one.
  const lastOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(Math.min(d, lastOfMonth))}`;
};

/**
 * "Oct 2, 2024" — a day read back in UTC, so the day never shifts.
 *
 * What arrives is not always a bare day key. `to_char`-ed columns (a renewal's
 * renewed_on / expired_on) are, but a raw DATE — compliance_items.expires_on,
 * drivers.cdl_expiration — comes through node-postgres as a local-midnight
 * timestamp and lands here as "2026-10-02T04:00:00.000Z". So the day is sliced
 * off FIRST and validated after: the alternative was `isDayKey` refusing a real
 * expiry and the sheet printing "· due null".
 *
 * Slicing here covers every reader — `renewalLine` and the sheet both format
 * through this one function. `isDayKey` itself stays strict: it is the form
 * check for what the owner typed, where a timestamp IS wrong.
 */
export const fmtDay = (value: string | null | undefined): string | null => {
  const key = typeof value === "string" ? keyOf(value) : value;
  return isDayKey(key)
    ? new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
};

/**
 * The line under the row: "renewed Oct 2, 2024 · was due Oct 2, 2026".
 * A cycle that never carried an expiry drops the second half rather than
 * printing an empty one. Nothing to say → null, and the row shows no line.
 */
export const renewalLine = (
  renewal: LastRenewal | ComplianceRenewal | null | undefined,
): string | null => {
  const renewed = fmtDay(renewal?.renewed_on);
  if (!renewed) return null;
  const wasDue = fmtDay(renewal?.expired_on);
  return wasDue ? `renewed ${renewed} · was due ${wasDue}` : `renewed ${renewed}`;
};

// "2 earlier" — the fold under the newest cycle. One cycle IS the line, so
// there is nothing to fold until there are two.
export const earlierCount = (renewalCount: number | null | undefined): number =>
  Math.max(0, (renewalCount ?? 0) - 1);

// A problem per field, so the sheet can print it under the box that caused it
// rather than in one heap at the bottom.
export interface RenewalFormErrors {
  renewedOn?: string;
  nextExpiry?: string;
}

/**
 * The sheet's own gate, before the request goes out. The sentences are the
 * server's own, so a user never hears two voices for one mistake. No key set =
 * good to send.
 */
export const renewalSheetErrors = (
  form: { renewedOn: string; nextExpiry: string },
  now: Date,
): RenewalFormErrors => {
  const errors: RenewalFormErrors = {};

  if (!form.renewedOn) errors.renewedOn = "A renewal needs the day it was renewed.";
  else if (!isDayKey(form.renewedOn))
    errors.renewedOn = "That isn't a real date.";
  else if (form.renewedOn > tomorrowKey(now))
    errors.renewedOn = "A renewal can't be dated in the future.";

  // The expiry is what the whole sheet is for: a cadence may prefill it, but it
  // can't be sent empty.
  if (!form.nextExpiry) errors.nextExpiry = "A renewal needs the next expiry date.";
  else if (!isDayKey(form.nextExpiry)) errors.nextExpiry = "That isn't a real date.";
  else if (isDayKey(form.renewedOn) && form.nextExpiry <= form.renewedOn)
    errors.nextExpiry = "The next expiry has to come after the renewal date.";

  return errors;
};

export const hasRenewalErrors = (errors: RenewalFormErrors): boolean =>
  Boolean(errors.renewedOn || errors.nextExpiry);

/**
 * The server's own sentence for a failed write. The compliance service lets the
 * axios error through untouched precisely so this can read it, and the page
 * prints it verbatim under the sheet — "The next expiry has to come after the
 * renewal date." rather than a house-brand shrug. Anything without a sentence (a
 * dropped connection, a 500 with no body, a thrown string) falls back.
 */
export const errText = (e: unknown): string =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
  "Could not save";
