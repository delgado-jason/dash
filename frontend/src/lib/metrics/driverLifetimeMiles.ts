// A driver's career miles = the rig's odometer, the one the rank ladder and the
// Mile Club are cut on (GL-151). The highest reading we have: a truck's current
// odometer, the latest fuel-fill odometer, or the end of any of THEIR loads.
// The Drivers list and the driver card both read this — the list used to sum
// loaded miles, so a driver at 570K on the card read 46K in the list.
import type { Load } from "@/types/load";
import { maxFuelOdometer } from "./fuelEconomy";

export const driverLifetimeMiles = (
  trucks: ReadonlyArray<{ current_odometer?: number | string | null }>,
  fuel: ReadonlyArray<{ odometer_reading: number }>,
  driverLoads: ReadonlyArray<Pick<Load, "odometer_end">>,
): number =>
  Math.max(
    0,
    ...trucks.map((t) => Number(t.current_odometer) || 0),
    maxFuelOdometer([...fuel]) ?? 0,
    ...driverLoads.map((l) => Number(l.odometer_end) || 0),
  );
