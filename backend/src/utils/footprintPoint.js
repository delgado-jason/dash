// The one point a load puts on its agent's footprint (decision 5A, 074).
//
// The mirror of frontend lib/loads/customerEnd.footprintPoint, kept pure and
// on its own so the stated → confirmed coverage promotion and the Foreman can
// never disagree about which city a load proves:
//   shipper   the ORIGIN is the market (the default — nothing changes)
//   receiver  the DESTINATION is; the shipper was a one-time place
//   neither   the load proves no market at all → null
//
// A missing / unknown customer_end reads as 'shipper', so a row written before
// the column existed behaves exactly as it did before 074. A point with no
// city or no state is not a point — null, never a half-filled place.
export function footprintPointOf(load) {
  if (!load) return null;
  const raw = load.customer_end;
  const end = raw === "receiver" || raw === "neither" ? raw : "shipper";
  if (end === "neither") return null;
  const city = String(
    (end === "shipper" ? load.origin_city : load.destination_city) ?? "",
  ).trim();
  const state = String(
    (end === "shipper" ? load.origin_state : load.destination_state) ?? "",
  ).trim();
  if (!city || !state) return null;
  return { city, state };
}
