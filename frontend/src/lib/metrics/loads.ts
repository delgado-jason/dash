import type { Load } from "@/types/load";

export const getBookedCount = (loads: Array<Load>) => {
  return loads.filter((load) => load.load_status === "booked").length;
};

export const getOutstandingTotal = (loads: Array<Load>) => {
  const outstandingLoads = loads.filter(
    (load) =>
      (load.load_status === "delivered" && load.payment_status === "unpaid") ||
      load.payment_status === "invoiced",
  );

  const outstandingLoadsTotal = outstandingLoads.reduce((total, load) => {
    return (
      total +
      Number(load.linehaul) +
      Number(load.fuel_surcharge) +
      Number(load.total_accessorials)
    );
  }, 0);

  return outstandingLoadsTotal;
};

export const deliveredThisMonth = (loads: Array<Load>, now: Date) => {
  // Filter by 'delivered' status
  const deliveredLoads = loads.filter(
    (load) => load.load_status === "delivered",
  );

  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();

  return deliveredLoads.filter((load) => {
    if (!load.delivery_date) return false;
    const loadDate = new Date(load.delivery_date);
    const loadYear = loadDate.getUTCFullYear();
    const loadMonth = loadDate.getUTCMonth();

    return loadYear === currentYear && loadMonth === currentMonth;
  });
};
