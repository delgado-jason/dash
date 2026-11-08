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
