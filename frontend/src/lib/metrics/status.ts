// ONE definition of "delivered" and of "never revenue" for every page and
// engine. Nothing else in src/ may spell `load_status === "delivered"` or build
// its own cancelled/tonu set — import these (a contract greps for it).
//
//   • DELIVERED — a load has delivered when its load_status says so, never on
//     a planned date. ("invoiced" / "paid" are payment_status values, not
//     load_status values, so they are never part of this test.)
//   • NEVER REVENUE — a cancelled load, and a TONU: the shipper decides what a
//     TONU pays, and that shows up on the statement, not in a projection.

type HasStatus = { load_status?: string | null };

export const isDelivered = (l: HasStatus): boolean => l.load_status === "delivered";

export const NEVER_REVENUE: ReadonlySet<string> = new Set(["cancelled", "tonu"]);

export const isNeverRevenue = (l: HasStatus): boolean => NEVER_REVENUE.has(String(l.load_status));
