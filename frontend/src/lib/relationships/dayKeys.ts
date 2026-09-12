// Day-key helpers for the relationship libs. Two clocks, deliberately:
//   utcDayKey   — for DATE columns and ISO timestamps from the API. A DATE
//                 arrives as an ISO string; slice(0, 10) is the day, and every
//                 diff anchors both ends at UTC midnight so a DST hour can't
//                 leak in (the house rule, CLAUDE.md).
//   localDayKey — for the SOP's calendar ("this week", Monday–Sunday), which
//                 is Brandie's week, not UTC's. Never toISOString here: after
//                 ~7pm Central toISOString is already tomorrow.

export const DAY_MS = 86_400_000;

const pad2 = (n: number): string => String(n).padStart(2, "0");

export const utcDayKey = (d: Date): string => d.toISOString().slice(0, 10);

export const localDayKey = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

// The day inside any DATE / timestamp string the API hands back.
export const keyOf = (v: string): string => v.slice(0, 10);

const atUtcMidnight = (key: string): number => Date.parse(`${key}T00:00:00Z`);

// Whole days from one day key to another (negative when `to` is earlier).
export const daysBetweenKeys = (fromKey: string, toKey: string): number =>
  Math.round((atUtcMidnight(toKey) - atUtcMidnight(fromKey)) / DAY_MS);

// "Aug 31" — for the row's context line. null in → null out.
export const shortDate = (key: string | null | undefined): string | null =>
  key
    ? new Date(`${keyOf(key)}T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;
