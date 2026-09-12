// Holiday notes (REL-01 v2.0 §5D, decision 6A): 1–2 a year, genuine gratitude,
// no ask. dash SURFACES the list inside a window and Dispatch sends each one
// by hand; the Owner personalizes the Tier 1 versions.
//   Thanksgiving  the 4th Thursday of November; window = 10 days before → the day
//   New Year      Jan 1; window = Dec 22 → Jan 2
// One flag per active agent per holiday-year, tracked by a marker written into
// the contact's note — `[holiday:thanksgiving-2026]` — so a sent (or skipped)
// note never comes back. Pure; the clock is injected as a local Date.
import { localDayKey } from "./dayKeys";
import { hasMarker, type MarkerContactLike, type MarkerNoteLike } from "./markers";

export type HolidayKind = "thanksgiving" | "newyear";

export interface HolidayWindow {
  kind: HolidayKind;
  year: number; // the holiday-year the marker carries (New Year → the year that begins)
  day: string; // 'YYYY-MM-DD' — the holiday itself
  start: string; // first day the flag shows
  end: string; // last day the flag shows
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

// The 4th Thursday of November, as a day key. Built from a local calendar
// date — no toISOString, so the weekday can't slip a day.
export const thanksgivingOf = (year: number): string => {
  const first = new Date(year, 10, 1); // Nov 1, local
  const offset = (4 - first.getDay() + 7) % 7; // days to the first Thursday
  return key(year, 11, 1 + offset + 21);
};

const shiftKey = (k: string, days: number): string => {
  const [y, m, d] = k.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return localDayKey(dt);
};

// The two windows that can touch a given calendar year: that year's
// Thanksgiving, and the New Year window straddling its December.
export const holidayWindows = (year: number): HolidayWindow[] => {
  const tg = thanksgivingOf(year);
  return [
    { kind: "thanksgiving", year, day: tg, start: shiftKey(tg, -10), end: tg },
    { kind: "newyear", year: year + 1, day: key(year + 1, 1, 1), start: key(year, 12, 22), end: key(year + 1, 1, 2) },
  ];
};

// The window `now` (local) falls inside, if any. Early January belongs to the
// PREVIOUS calendar year's New Year window.
export const activeHoliday = (now: Date): HolidayWindow | null => {
  const today = localDayKey(now);
  const y = now.getFullYear();
  for (const w of [...holidayWindows(y - 1), ...holidayWindows(y)]) {
    if (today >= w.start && today <= w.end) return w;
  }
  return null;
};

export const holidayMarker = (kind: HolidayKind, year: number): string => `[holiday:${kind}-${year}]`;

export const HOLIDAY_LABEL: Record<HolidayKind, string> = {
  thanksgiving: "Thanksgiving",
  newyear: "New Year",
};

export interface HolidayFlag<A> {
  agent: A;
  kind: HolidayKind;
  year: number;
  day: string;
  marker: string;
}

// One flag per ACTIVE agent (the caller passes the active book — tiered or
// prospect, never parked) that has not yet carried this holiday-year's marker,
// sent or skipped. Outside a window there are no flags at all.
export const holidayFlags = <A extends { agent_id: string }>(
  activeAgents: A[],
  contacts: MarkerContactLike[],
  notes: MarkerNoteLike[],
  now: Date,
): HolidayFlag<A>[] => {
  const w = activeHoliday(now);
  if (!w) return [];
  const marker = holidayMarker(w.kind, w.year);
  return activeAgents
    .filter((a) => !hasMarker(a.agent_id, marker, contacts, notes))
    .map((agent) => ({ agent, kind: w.kind, year: w.year, day: w.day, marker }));
};
