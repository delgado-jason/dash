// Settlement timing. The carrier settles weekly on a configured day of week
// (settlement_day on the settlement schedule; Landstar = Wednesday). Pure and
// UTC-anchored like every other date in the lib — date-only math, no clock.

// The next date the weekly settlement lands, counting `from` itself when it IS
// the settlement day (the check hits today, not next week).
export const nextSettlementDate = (from: Date, settlementDay: number): Date => {
  const d = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const delta = (settlementDay - d.getUTCDay() + 7) % 7;
  d.setUTCDate(d.getUTCDate() + delta);
  return d;
};
