import api from "./api";
import type { MaintenanceItem, MaintenanceService } from "@/types/maintenance";

/* eslint-disable @typescript-eslint/no-explicit-any */
const numOrNull = (v: any): number | null =>
  v == null || v === "" ? null : Number(v);
const dateOrNull = (v: any): string | null =>
  v == null ? null : String(v).slice(0, 10);

const coerceItem = (i: any): MaintenanceItem => ({
  item_id: i.item_id,
  unit: i.unit,
  name: i.name,
  category: i.category,
  interval_miles: numOrNull(i.interval_miles),
  interval_months: numOrNull(i.interval_months),
  interval_hours: numOrNull(i.interval_hours),
  last_done_miles: numOrNull(i.last_done_miles),
  last_done_date: dateOrNull(i.last_done_date),
  warn_lead_days: numOrNull(i.warn_lead_days) ?? 14,
  truck_id: i.truck_id ?? null,
  trailer_id: i.trailer_id ?? null,
  active: i.active,
  notes: i.notes ?? null,
});

const coerceService = (s: any): MaintenanceService => ({
  service_id: s.service_id,
  unit: s.unit,
  service_date: dateOrNull(s.service_date) as string,
  odometer: numOrNull(s.odometer),
  trailer_hub: numOrNull(s.trailer_hub),
  vendor: s.vendor ?? null,
  location: s.location ?? null,
  description: s.description,
  cost: numOrNull(s.cost),
  invoice_number: s.invoice_number ?? null,
  notes: s.notes ?? null,
  item_ids: Array.isArray(s.item_ids) ? s.item_ids : [],
});
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---- schedule items ----
export const getMaintenanceItems = async (): Promise<MaintenanceItem[]> => {
  const res = await api.get("/maintenance/items");
  return res.data.items.map(coerceItem);
};

export const seedMaintenanceItems = async (): Promise<MaintenanceItem[]> => {
  const res = await api.post("/maintenance/items/seed");
  return res.data.items.map(coerceItem);
};

export type ItemInput = Partial<Omit<MaintenanceItem, "item_id">>;

export const createMaintenanceItem = async (
  data: ItemInput,
): Promise<MaintenanceItem> => {
  const res = await api.post("/maintenance/items", data);
  return coerceItem(res.data.item);
};

export const patchMaintenanceItem = async (
  id: string,
  data: ItemInput,
): Promise<MaintenanceItem> => {
  const res = await api.patch(`/maintenance/items/${id}`, data);
  return coerceItem(res.data.item);
};

export const deleteMaintenanceItem = async (id: string): Promise<void> => {
  await api.delete(`/maintenance/items/${id}`);
};

// ---- services log ----
export const getMaintenanceServices = async (): Promise<MaintenanceService[]> => {
  const res = await api.get("/maintenance/services");
  return res.data.services.map(coerceService);
};

export interface ServiceInput {
  unit: string;
  service_date: string;
  odometer?: number | null; // truck reading (tractor / both)
  trailer_hub?: number | null; // trailer reading (trailer / both)
  vendor?: string | null;
  location?: string | null;
  description: string;
  cost?: number | null;
  invoice_number?: string | null;
  notes?: string | null;
  item_ids?: string[];
}

export const createMaintenanceService = async (
  data: ServiceInput,
): Promise<MaintenanceService> => {
  const res = await api.post("/maintenance/services", data);
  return coerceService(res.data.service);
};

export const patchMaintenanceService = async (
  id: string,
  data: Partial<ServiceInput>,
): Promise<void> => {
  await api.patch(`/maintenance/services/${id}`, data);
};

export const deleteMaintenanceService = async (id: string): Promise<void> => {
  await api.delete(`/maintenance/services/${id}`);
};
