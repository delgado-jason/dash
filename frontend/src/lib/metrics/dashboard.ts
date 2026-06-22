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

// ---- MONTH KEY HELPER ---- (UTC, "YYYY-MM")
const getMonthKey = (isoDate: string): string => {
  const d = new Date(isoDate);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

// ---- BUILD CONTINUOUS MONTH RANGE ---- (ending at current month, going back N months)
const buildMonthRange = (monthsBack: number): string[] => {
  const now = new Date();
  const keys: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    // step back i months from the current UTC month
    const d = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    keys.push(`${year}-${month}`);
  }
  return keys;
};

// ---- GET MONTHLY REVENUE ---- (continuous: every month in range, zeros filled)
export const getMonthlyRevenue = (
  loads: Load[],
  monthsBack: number = 12,
): { month: string; revenue: number }[] => {
  const delivered = loads.filter(
    (load) => load.load_status === "delivered" && load.delivery_date,
  );

  // Bucket delivered loads by month key
  const buckets: Record<string, Load[]> = {};
  for (const load of delivered) {
    const key = getMonthKey(load.delivery_date as string);
    (buckets[key] ??= []).push(load);
  }

  // Walk the continuous range; months with no loads → 0
  return buildMonthRange(monthsBack).map((month) => ({
    month,
    revenue: buckets[month] ? (getLoadRevenue(buckets[month]) ?? 0) : 0,
  }));
};

// ---- GET MONTHLY RPM ---- (continuous: blended per month, no-data months → null)
export const getMonthlyRPM = (
  loads: Load[],
  monthsBack: number = 12,
): { month: string; rpm: number | null }[] => {
  const delivered = loads.filter(
    (load) => load.load_status === "delivered" && load.delivery_date,
  );

  const buckets: Record<string, Load[]> = {};
  for (const load of delivered) {
    const key = getMonthKey(load.delivery_date as string);
    (buckets[key] ??= []).push(load);
  }

  return buildMonthRange(monthsBack).map((month) => {
    const monthLoads = buckets[month];
    if (!monthLoads) return { month, rpm: null }; // no data → null (gap in line)

    const revenue = getLoadRevenue(monthLoads) ?? 0;
    const miles = monthLoads.reduce(
      (sum, load) => sum + Number(load.loaded_miles),
      0,
    );
    return { month, rpm: miles > 0 ? revenue / miles : null };
  });
};
