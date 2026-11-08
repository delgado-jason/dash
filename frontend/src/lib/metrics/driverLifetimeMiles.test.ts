import { describe, it, expect } from "vitest";
import { driverLifetimeMiles } from "./driverLifetimeMiles";

describe("driverLifetimeMiles — the odometer, not loaded miles (GL-151)", () => {
  it("takes the highest of the truck odometer, the latest fuel fill and the driver's last load", () => {
    expect(
      driverLifetimeMiles([{ current_odometer: 568_737 }], [{ odometer_reading: 572_503 }], [{ odometer_end: 570_000 } as never]),
    ).toBe(572_503);
  });
  it("loaded miles never enter: a driver with a rig at 568,737 is not 46K", () => {
    expect(driverLifetimeMiles([{ current_odometer: 568_737 }], [], [])).toBe(568_737);
  });
  it("no readings at all is 0, not NaN", () => {
    expect(driverLifetimeMiles([], [], [])).toBe(0);
  });
});
