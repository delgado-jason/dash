// Per-load fuel estimate. Until the fuel page feeds real numbers, MPG and price
// are explicit assumptions (Jason's working figures). The mileage basis is what
// changes: before a load is closed out we estimate from loaded + deadhead miles;
// once both odometer readings are entered we use the actual miles driven.
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
    // Estimate: loaded miles, plus deadhead when we have it.
    miles = (Number(load.loaded_miles) || 0) + (Number(load.deadhead_miles) || 0);
    basis = "estimated";
  }

  if (miles <= 0 || mpg <= 0) return null;

  const gallons = miles / mpg;
  return { miles, gallons, cost: gallons * price, basis };
};
