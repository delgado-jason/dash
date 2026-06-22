import type { Load } from "@/types/load";

const getLoadRevenue = (loads: Load[] | null): number | null => {
  if (!loads) return null;

  return loads.reduce((total, load) => {
    return (
      total +
      Number(load.linehaul) +
      Number(load.fuel_surcharge) +
      Number(load.total_accessorials)
    );
  }, 0);
};

// ---- GET REVENUE MTD ----
export const getRevenueMTD = (loads: Load[]): number | null => {
  const currentDate = Date.now();
  const currentYear = new Date(currentDate).getUTCFullYear();
  const currentMonth = new Date(currentDate).getUTCMonth();

  // Filter loads
  const filteredLoads = loads.filter(
    (load) =>
      load.load_status === "delivered" &&
      load.delivery_date &&
      new Date(load.delivery_date).getUTCFullYear() === currentYear &&
      new Date(load.delivery_date).getUTCMonth() === currentMonth,
  );

  const grossRev = getLoadRevenue(filteredLoads);

  return grossRev;
};

// ---- GET LAST MONTHS REVENUE ----
export const getRevenueLastMonth = (loads: Load[]): number | null => {
  const now = new Date();

  const filteredLoads = loads.filter(
    (load) =>
      load.delivery_date &&
      load.load_status === "delivered" &&
      new Date(load.delivery_date).getUTCFullYear() === now.getUTCFullYear() &&
      new Date(load.delivery_date).getUTCMonth() === now.getUTCMonth() - 1,
  );

  const grossRev = getLoadRevenue(filteredLoads);

  return grossRev;
};

// ---- GET REVENUE YTD ----
export const getRevenueYTD = (loads: Load[]): number | null => {
  const now = new Date();

  const filteredLoads = loads.filter(
    (load) =>
      load.delivery_date &&
      load.load_status === "delivered" &&
      new Date(load.delivery_date).getUTCFullYear() === now.getUTCFullYear(),
  );

  const grossRev = getLoadRevenue(filteredLoads);

  return grossRev;
};

// ---- GET DEADHEAD PERCENTAGE ----
export const getDeadheadPercent = (loads: Load[]) => {
  const validLoads = loads.filter(
    (load) =>
      load.odometer_start !== null &&
      load.odometer_end !== null &&
      load.load_status === "delivered",
  );

  const totalOdometer = validLoads.reduce((sum, load) => {
    return sum + (Number(load.odometer_end) - Number(load.odometer_start));
  }, 0);

  const totalLoaded = validLoads.reduce((sum, load) => {
    return sum + Number(load.loaded_miles);
  }, 0);

  if (totalOdometer === 0) return null;

  return (totalOdometer - totalLoaded) / totalOdometer;
};
