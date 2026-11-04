// "Today" is the operator's LOCAL calendar day on every page, and it rolls at
// midnight (Nod Sheet 2026-11-04, call 13). The Dashboard and the player card
// used to read `new Date()` through UTC getters, so from 6 pm Central the pay
// week, the month and the quarter were already tomorrow's while the statusbar
// still said Tuesday.
//
// Every metric function in lib/metrics reads its clock through UTC getters
// (the house rule — a DATE column is a UTC midnight). So the local day is
// handed to them ANCHORED: the local day key re-read as a UTC-midnight Date.
// Through UTC getters that Date IS the local calendar day; the same trick the
// cash flow page has used since stage 1 (utc(asOfKey)).
//
// Never read an anchored day through local getters or a zone-less
// toLocaleDateString — in Central it would print the evening before. The
// relationship, trip-total and compliance-renewal libs keep their own local
// clocks and are not handed anchored days.
import { localDayKey } from "@/lib/relationships/dayKeys";

export { localDayKey };

// A day key as a UTC-midnight Date — the shape every UTC-getter function wants.
export const anchorDay = (key: string): Date => new Date(`${String(key).slice(0, 10)}T00:00:00Z`);

// The operator's local day, anchored. Pure when `now` is given.
export const localToday = (now: Date = new Date()): Date => anchorDay(localDayKey(now));
