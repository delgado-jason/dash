// Per-load fuel estimate. Until the fuel page feeds real numbers, MPG and price
// are explicit assumptions (Jason's working figures). The mileage basis is what
// changes: before a load is closed out we estimate from loaded + deadhead miles;
// once both odometer readings are entered we use the actual miles driven.
//
// It returns null rather than guessing: no odometer window AND no logged
// deadhead means the miles driven are unknown, and an unknown is not zero.
import { knownNumber } from "./loadScore";
export const ASSUMED_MPG = 6.5;
export const ASSUMED_FUEL_PRICE = 5.5; // dollars per gallon

export interface FuelEstimate {
  miles: number;
  gallons: number;
  cost: number;
  basis: "estimated" | "actual";
}

interface FuelInput {
  loaded_miles: number | null;
  deadhead_miles: number | null;
  odometer_start?: number | null;
  odometer_end?: number | null;
}

export const estimateLoadFuel = (
  load: FuelInput,
  mpg: number = ASSUMED_MPG,
  price: number = ASSUMED_FUEL_PRICE,
): FuelEstimate | null => {
  const { odometer_start: start, odometer_end: end } = load;

  let miles: number;
  let basis: FuelEstimate["basis"];
  if (start != null && end != null && end > start) {
    miles = end - start;
    basis = "actual";
  } else {
    // Estimate: loaded + empty, and BOTH have to be known.
    //
    // This used to coalesce each side to zero when it was missing, so an
    // unknown deadhead became zero empty miles and quietly undercounted the
    // fuel — two inches below a KPI that refuses the very same input with
    // "Deadhead — needs the odometer". One page, two policies; now one.
    //
    // A deadhead of 0 is still a real answer (the truck was already at the
    // shipper) and estimates fine. Only null is a refusal, which is exactly
    // what knownNumber distinguishes.
    const loaded = knownNumber(load.loaded_miles);
    const empty = knownNumber(load.deadhead_miles);
    if (loaded == null || empty == null) return null;
    miles = loaded + empty;
    basis = "estimated";
  }

  if (miles <= 0 || mpg <= 0) return null;

  const gallons = miles / mpg;
  return { miles, gallons, cost: gallons * price, basis };
};
