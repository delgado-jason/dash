import type { SiteHit } from "@/types/siteTraffic";
import { getStateName } from "@/lib/constants/states";

// Everything the /website page draws, computed from the raw hits. Two rules
// run through the whole file:
//
// 1. A DAY IS A STRING. `day` arrives as 'YYYY-MM-DD' (Central) and leaves as
//    'YYYY-MM-DD'. It is never parsed into a Date to be compared, bucketed or
//    printed — the only arithmetic done on a day goes through Date.UTC, which
//    can't shift it into yesterday the way `new Date("2026-09-17")` read in a
//    negative-offset timezone can.
// 2. A VISITOR IS A BROWSER ON A DAY. The 24-hour hash has the day baked into
//    it, so the same person tomorrow is a different string. That makes "one
//    week's visitors" the SUM of that week's daily visitors — no double count
//    is possible across days, and none can be collapsed either.

export interface TrafficSummary {
  visitors: number;
  views: number;
  todayViews: number;
  todayVisitors: number;
  avg7Visitors: number | null;
}

export interface TrafficDay {
  day: string; // 'YYYY-MM-DD'
  visitors: number;
  views: number;
}

export interface TrafficWeek extends TrafficDay {
  from: string; // the bucket's FIRST day; `day` is its last
}

export interface PageRow {
  path: string;
  views: number;
  share: number | null; // fraction of all views, 0–1; null when there are none
}

export interface ReferrerRow {
  host: string; // "direct" when the browser sent no referrer
  views: number;
  share: number | null;
}

export interface StateRow {
  region: string; // 2-letter code
  name: string; // full state name
  visitors: number;
}

const pad = (n: number): string => String(n).padStart(2, "0");

// `day` + n days, as a day string. Parsed field by field and rebuilt through
// Date.UTC — month and day overflow ("2028-02-29" + 1) is exactly what Date.UTC
// normalises, so leap days and year ends need no special case.
export const addDays = (day: string, n: number): string => {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7));
  const d = Number(day.slice(8, 10));
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

// Every day from `from` to `today`, both ends included, ascending. A backwards
// range is empty, not an infinite loop.
export const dayRange = (from: string, today: string): string[] => {
  if (from > today) return [];
  const days: string[] = [];
  for (let d = from; d <= today; d = addDays(d, 1)) days.push(d);
  return days;
};

// Distinct visitors in a set of hits.
const distinct = (hits: SiteHit[]): number =>
  new Set(hits.map((h) => h.visitor)).size;

// The figures strip. `from` is optional and only answers one question: is this
// window even seven days long? Without it the 7-day average is still the mean
// over the seven days ending today (a missing day is a zero, not a gap) — the
// page passes it so a window shorter than a week reads "—" instead of an
// average of days the window never covered.
export const trafficSummary = (
  hits: SiteHit[],
  today: string,
  from?: string,
): TrafficSummary => {
  const todays = hits.filter((h) => h.day === today);

  let avg7Visitors: number | null = null;
  const weekFrom = addDays(today, -6);
  const longEnough = from == null || from <= weekFrom;
  if (hits.length > 0 && longEnough) {
    const perDay = new Map<string, Set<string>>();
    for (const d of dayRange(weekFrom, today)) perDay.set(d, new Set());
    for (const h of hits) perDay.get(h.day)?.add(h.visitor);
    let sum = 0;
    for (const s of perDay.values()) sum += s.size;
    avg7Visitors = sum / 7;
  }

  return {
    visitors: distinct(hits),
    views: hits.length,
    todayViews: todays.length,
    todayVisitors: distinct(todays),
    avg7Visitors,
  };
};

// One row per day in the window, zeros filled — a day nobody visited is a gap
// in the bars, and a gap you can see is information.
export const visitorsByDay = (
  hits: SiteHit[],
  from: string,
  today: string,
): TrafficDay[] => {
  const days = dayRange(from, today);
  const seen = new Map<string, Set<string>>();
  const views = new Map<string, number>();
  for (const d of days) {
    seen.set(d, new Set());
    views.set(d, 0);
  }
  for (const h of hits) {
    const s = seen.get(h.day);
    if (!s) continue; // a hit outside the window isn't this window's business
    s.add(h.visitor);
    views.set(h.day, (views.get(h.day) ?? 0) + 1);
  }
  return days.map((d) => ({
    day: d,
    visitors: seen.get(d)?.size ?? 0,
    views: views.get(d) ?? 0,
  }));
};

// 365 bars is a smear, so the 12-month window folds the days into weeks.
// Buckets are cut from the END so the last one always ends on today; the
// oldest one is short if the range doesn't divide by seven. Visitors add up
// across days for free — see the note at the top of this file.
export const visitorsByWeek = (rows: TrafficDay[]): TrafficWeek[] => {
  const weeks: TrafficWeek[] = [];
  for (let end = rows.length; end > 0; end -= 7) {
    const bucket = rows.slice(Math.max(0, end - 7), end);
    weeks.push({
      day: bucket[bucket.length - 1].day,
      from: bucket[0].day,
      visitors: bucket.reduce((sum, r) => sum + r.visitors, 0),
      views: bucket.reduce((sum, r) => sum + r.views, 0),
    });
  }
  return weeks.reverse();
};

// Count by key, then rank. Ties break on the key itself so the same data always
// draws the same list — a list that reshuffles between refreshes reads as
// movement that didn't happen.
const rankCounts = (
  counts: Map<string, number>,
  n: number,
): { key: string; count: number }[] =>
  [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, n);

export const topPages = (hits: SiteHit[], n: number): PageRow[] => {
  const counts = new Map<string, number>();
  for (const h of hits) counts.set(h.path, (counts.get(h.path) ?? 0) + 1);
  const total = hits.length;
  return rankCounts(counts, n).map((r) => ({
    path: r.key,
    views: r.count,
    share: total > 0 ? r.count / total : null,
  }));
};

// Where they came from. No referrer is not missing data — it's a browser that
// was typed into, bookmarked, or sent from an app that strips it, and that is
// worth its own row.
export const DIRECT = "direct";

export const topReferrers = (hits: SiteHit[], n: number): ReferrerRow[] => {
  const counts = new Map<string, number>();
  for (const h of hits) {
    const host = h.ref_host ?? DIRECT;
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  const total = hits.length;
  return rankCounts(counts, n).map((r) => ({
    host: r.key,
    views: r.count,
    share: total > 0 ? r.count / total : null,
  }));
};

// US states only, counted in VISITORS rather than views — "22 people in
// Alabama" is the answer; "22 page loads from Alabama" is one person reading
// four pages. A region that isn't a state code (a Canadian province, a stray
// header) is dropped rather than shown as itself.
export const topStates = (hits: SiteHit[], n: number): StateRow[] => {
  const seen = new Map<string, Set<string>>();
  const names = new Map<string, string>();
  for (const h of hits) {
    const isUS = h.country === "US" || (h.country == null && h.region != null);
    if (!isUS || !h.region) continue;
    const name = getStateName(h.region);
    if (!name) continue;
    const code = h.region.toUpperCase();
    names.set(code, name);
    if (!seen.has(code)) seen.set(code, new Set());
    seen.get(code)?.add(h.visitor);
  }
  return [...seen.entries()]
    .map(([region, visitors]) => ({
      region,
      name: names.get(region) ?? region,
      visitors: visitors.size,
    }))
    .sort((a, b) => b.visitors - a.visitors || a.name.localeCompare(b.name))
    .slice(0, n);
};

// The n most recent page views. `ts` is an instant, so it sorts as a string
// (ISO, same offset from the database every time); hit_id breaks a tie in the
// same order the rows were written.
export const latestVisits = (hits: SiteHit[], n: number): SiteHit[] =>
  [...hits]
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : b.hit_id - a.hit_id))
    .slice(0, n);
