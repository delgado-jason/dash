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

// ---- LOAD COUNT ----
export const getLoadCount = (loads: Load[] | null): number => {
  if (!loads) {
    return 0;
  }

  const notCancelled = loads.filter((load) => load.load_status !== "cancelled");

  return notCancelled.length;
};

// ---- CANCELLED COUNT ----
export const getCancelledCount = (loads: Load[] | null): number => {
  if (!loads) return 0;

  const cancelled = loads.filter((load) => load.load_status === "cancelled");

  return cancelled.length;
};

// ---- GROSS REVENUE ---- (excludes cancelled loads, filters only delivered loads)
export const getGrossRevenue = (loads: Load[] | null): number | null => {
  if (!loads) return null;

  const filteredLoads = loads.filter(
    (load) => load.load_status === "delivered",
  );

  const grossRev = getLoadRevenue(filteredLoads);

  return grossRev;
};

// ---- AVERAGE RPM ---- (Gross revenue / total 'paid' miles)
export const getAverageRPM = (loads: Load[] | null): number | null => {
  if (!loads) return null;

  const filteredLoads = loads.filter(
    (load) => load.load_status === "delivered",
  );

  const grossRev = getLoadRevenue(filteredLoads);

  if (!grossRev) return null;

  const loadedMiles = filteredLoads.reduce((total, load) => {
    return total + Number(load.loaded_miles);
  }, 0);

  return loadedMiles > 0 ? grossRev / loadedMiles : null;
};

// ---- GET THE DATE LAST LOAD WAS DELIVERED ----
export const getLastLoadDate = (loads: Load[] | null): string | null => {
  if (!loads) return null;

  const filteredLoads = loads.filter(
    (load) => load.load_status === "delivered",
  );

  const deliveryDates: string[] = [];

  filteredLoads.map((load) => {
    if (!load.delivery_date) return;

    const date = load.delivery_date;
    deliveryDates.push(date);
  });

  if (deliveryDates.length === 0) return null;

  return deliveryDates.reduce((current, latest) => {
    return current > latest ? current : latest;
  });
};

// ---- GET TOTAL LOADS ---- should be getLoadCount + getCancelledCount === total loads
export const getTotalLoads = (loads: Load[] | null): number | null => {
  if (!loads) return null;

  return getLoadCount(loads) + getCancelledCount(loads);
};
