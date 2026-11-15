// Maintenance's vocabularies and the hours rule, pulled out of the service
// layer so they can be tested without a database.
//
// Two vocabularies, deliberately different (migration 078):
//   ITEM units    — a schedule item belongs to exactly ONE unit, and each unit
//                   reads its own meter: tractor → odometer, trailer → hub,
//                   apu → engine hours.
//   SERVICE units — one shop visit can cover the truck and trailer together
//                   ('both'); the APU is its own visit, never folded into one.

export const MAINTENANCE_UNITS = ["tractor", "trailer", "apu"];
export const SERVICE_UNITS = ["tractor", "trailer", "both", "apu"];

export const isUnit = (u) => MAINTENANCE_UNITS.includes(u);
export const isServiceUnit = (u) => SERVICE_UNITS.includes(u);

export const UNIT_ERROR = "unit must be tractor, trailer, or apu";
export const SERVICE_UNIT_ERROR = "unit must be tractor, trailer, both, or apu";

// Which reading on a service resets an item of this unit. The APU's meter is
// hours; the truck's is the odometer; the trailer's is the hubodometer.
export const READING_FIELD = {
  tractor: "odometer",
  trailer: "trailer_hub",
  apu: "apu_hours",
};

// An hours meter reading. Optional everywhere — null/undefined means "nobody
// wrote it down", which is a real answer and NOT a zero. A TriPac that has run
// since new is somewhere under ~50,000 hours; anything past that is a typo.
export const MAX_APU_HOURS = 100000;

export const apuHoursErrors = (value, field = "apu_hours") => {
  if (value === undefined || value === null) return [];
  if (!Number.isInteger(value)) return [`${field} must be a whole number`];
  if (value < 0) return [`${field} cannot be negative`];
  if (value > MAX_APU_HOURS)
    return [`${field} cannot be more than ${MAX_APU_HOURS.toLocaleString("en-US")}`];
  return [];
};

// GL-07 (migration 097): the trailer has no hubodometer — its meter is the
// truck's odometer, by rule. So a service on BOTH units carries ONE reading.
// Given the service's unit and its two readings, fill the trailer's from the
// truck's when only the odometer is there, and refuse when both are there and
// differ (the CHECK maintenance_services_both_one_meter would refuse it too,
// but the sentence has to reach the owner first). Any other unit passes
// through untouched: a "trailer" service takes its own trailer_hub.
export const BOTH_ONE_READING_ERROR =
  "a service on both units carries one reading — the truck's odometer is the trailer's meter";

export const reconcileBothReading = ({ unit, odometer, trailer_hub } = {}) => {
  const out = { odometer: odometer ?? null, trailer_hub: trailer_hub ?? null, errors: [] };
  if (unit !== "both") return out;
  if (out.odometer !== null && out.trailer_hub === null) out.trailer_hub = out.odometer;
  else if (out.odometer !== null && out.trailer_hub !== null && Number(out.odometer) !== Number(out.trailer_hub))
    out.errors.push(BOTH_ONE_READING_ERROR);
  return out;
};

// AN APU READING THAT NO METER COULD PRODUCE (the Maintenance sheet, call 4).
// Jason's book carried 13,413 on Sep 13 and 13,540 on Sep 14 — 127 hours in a
// day, which no APU can do — and the projection learned from whichever pair it
// happened to pick. A reading is judged against its nearest neighbours on
// either side, from both sources (an APU service, a fuel-up): it may not go
// backwards and it may not gain more than a day's worth of hours per day.
// The sentence names both readings so the owner knows which two disagree.
export const MAX_APU_HOURS_PER_DAY = 24;

const dayDiff = (fromDay, toDay) =>
  Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);

const fmtHours = (n) => Number(n).toLocaleString("en-US");

// `candidate` = { day: 'YYYY-MM-DD', hours }; `others` = the readings on file
// as { day, hours }, the row being edited left out by the caller.
export const apuReadingSanity = (candidate, others = []) => {
  const errors = [];
  if (!candidate || candidate.hours == null || !candidate.day) return errors;
  const hours = Number(candidate.hours);
  const known = others.filter((o) => o && o.day && o.hours != null);
  const before = known.filter((o) => o.day < candidate.day).sort((a, b) => (a.day < b.day ? 1 : -1))[0];
  const after = known.filter((o) => o.day > candidate.day).sort((a, b) => (a.day < b.day ? -1 : 1))[0];
  const sameDay = known.filter((o) => o.day === candidate.day);

  if (before) {
    const gain = hours - Number(before.hours);
    const days = Math.max(1, dayDiff(before.day, candidate.day));
    if (gain < 0)
      errors.push(
        `APU reading ${fmtHours(hours)} on ${candidate.day} is below ${fmtHours(before.hours)} on ${before.day} — a meter cannot go backwards; check the reading`,
      );
    else if (gain > MAX_APU_HOURS_PER_DAY * days)
      errors.push(
        `APU reading ${fmtHours(hours)} on ${candidate.day} is ${fmtHours(gain)} hours above ${fmtHours(before.hours)} on ${before.day} — a meter cannot gain more than ${MAX_APU_HOURS_PER_DAY} hours a day; check the reading`,
      );
  }
  if (after) {
    const gain = Number(after.hours) - hours;
    const days = Math.max(1, dayDiff(candidate.day, after.day));
    if (gain < 0)
      errors.push(
        `APU reading ${fmtHours(hours)} on ${candidate.day} is above ${fmtHours(after.hours)} on ${after.day} — a meter cannot go backwards; check the reading`,
      );
    else if (gain > MAX_APU_HOURS_PER_DAY * days)
      errors.push(
        `APU reading ${fmtHours(hours)} on ${candidate.day} is ${fmtHours(gain)} hours below ${fmtHours(after.hours)} on ${after.day} — a meter cannot gain more than ${MAX_APU_HOURS_PER_DAY} hours a day; check the reading`,
      );
  }
  for (const o of sameDay) {
    const diff = Math.abs(hours - Number(o.hours));
    if (diff > MAX_APU_HOURS_PER_DAY)
      errors.push(
        `APU reading ${fmtHours(hours)} on ${candidate.day} differs from ${fmtHours(o.hours)} read the same day by ${fmtHours(diff)} hours; check the reading`,
      );
  }
  return errors;
};
