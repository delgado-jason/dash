// A delivered load needs its end odometer and its delivery date (Nod Sheet
// "The Protection Stage", mock 4; nodded 2026-11-05). Empty miles, the Friday
// accrual and break-even all read them, so a load can't be marked delivered
// without them. The server refuses the same case with a 400; the form says so
// first and holds its save button.
export const DELIVERED_NEEDS =
  "A delivered load needs its end odometer and its delivery date — empty miles, the Friday accrual and break-even all read them. Type the reading, or leave the load in transit until you have it.";

const blankDate = (v: unknown): boolean => v == null || String(v).trim() === "";
// A form's number input hands back 0 for an emptied box, and no truck reads 0.
const blankOdometer = (v: unknown): boolean => {
  if (v == null || (typeof v === "string" && v.trim() === "")) return true;
  const n = Number(v);
  return !Number.isFinite(n) || n <= 0;
};

// The sentence when the status is "delivered" and either field is blank; null
// when the load may be saved as it stands.
export const deliveredNeeds = (
  status: string | null | undefined,
  odometerEnd: unknown,
  deliveryDate: unknown,
): string | null =>
  status === "delivered" && (blankOdometer(odometerEnd) || blankDate(deliveryDate)) ? DELIVERED_NEEDS : null;
