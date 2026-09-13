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
