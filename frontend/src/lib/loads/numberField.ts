// WHAT AN EMPTIED NUMBER BOX MEANS.
//
// A form's number input hands back "" for a box the user cleared and NaN for
// junk typed into it. `Number("")` is 0, so the obvious `Number(e.target.value)`
// saves an ERASURE as a measured zero — and downstream, zero is not a shrug.
// loadScore.ts is explicit about it:
//
//   "null = unknown (no odometer, nothing typed). Never 0: zero is 'the truck
//    is already at the shipper', a real answer; unknown is a refusal to grade."
//
// So clearing Deadhead Miles on a load with no odometer window used to turn
// "no grade" into a confident SCRAP / THIN / SOLID / PRIME — the app asserting
// a fact the user had just deleted. Same trap on Weight, Loaded Miles, the
// odometers, Linehaul and Fuel Surcharge.
//
// deliveredNeeds.ts already named this class ("a form's number input hands
// back 0 for an emptied box, and no truck reads 0") and guarded exactly one
// field. This is the general rule, applied where the value is written.
//
// NOTE it is deliberately NOT the same as that file's `blankOdometer`, which
// also treats <= 0 as blank: no truck reads 0 miles on its odometer, but a 0
// deadhead is a real answer (the truck was already at the shipper). Odometer
// semantics stay odometer-local.
export const numberFieldValue = (raw: string): number | null => {
  if (raw.trim() === "") return null; // the box was cleared
  const n = Number(raw);
  return Number.isFinite(n) ? n : null; // letters are not a measurement either
};
