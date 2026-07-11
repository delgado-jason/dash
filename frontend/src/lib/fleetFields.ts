import type { FormField } from "@/components/fleet/EntityForm";

// Turn an entity into the string map the form prefills from (dates → date-only).
export const toFormValues = (
  obj: Record<string, unknown>,
  fields: FormField[],
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = obj[f.name];
    if (v === null || v === undefined) continue;
    out[f.name] = f.type === "date" ? String(v).slice(0, 10) : String(v);
  }
  return out;
};

// Shared field definitions so the create form (list page) and the edit form
// (detail page) stay in sync.

export const TRUCK_FIELDS: FormField[] = [
  { name: "unit_number", label: "Unit #", required: true, placeholder: "580991" },
  { name: "make", label: "Make", placeholder: "International" },
  { name: "model", label: "Model", placeholder: "LT625" },
  { name: "year", label: "Year", type: "number", placeholder: "2019" },
  { name: "vin", label: "VIN (17 chars)", placeholder: "3HSDZAPR…" },
  { name: "plate_number", label: "Plate", placeholder: "DTS625" },
  { name: "plate_state", label: "State", placeholder: "AL" },
  { name: "current_odometer", label: "Odometer", type: "number", placeholder: "568737" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ["active", "maintenance", "out_of_service", "inactive"],
  },
  { name: "in_service_date", label: "In service", type: "date" },
];

// CDL (number, state, expiration, endorsements) is intentionally absent here —
// it's managed on the Compliance page and shown read-only on the driver page.
export const DRIVER_FIELDS: FormField[] = [
  { name: "first_name", label: "First name", required: true },
  { name: "last_name", label: "Last name", required: true },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email" },
  { name: "hire_date", label: "Hire date", type: "date" },
];

export const TRAILER_FIELDS: FormField[] = [
  { name: "unit_number", label: "Unit #", required: true, placeholder: "780991" },
  {
    name: "trailer_type",
    label: "Type",
    type: "select",
    options: ["flatbed", "step deck", "RGN", "lowboy", "double drop", "conestoga"],
  },
  { name: "length_ft", label: "Length (ft)", type: "number", placeholder: "48" },
  { name: "make", label: "Make", placeholder: "Utility" },
  { name: "model", label: "Model" },
  { name: "year", label: "Year", type: "number", placeholder: "2019" },
  { name: "vin", label: "VIN" },
  { name: "plate_number", label: "Plate", placeholder: "DTS780" },
  { name: "plate_state", label: "State", placeholder: "AL" },
  { name: "current_hub", label: "Hubodometer", type: "number", placeholder: "456123" },
  {
    name: "status",
    label: "Status",
    type: "select",
    options: ["active", "maintenance", "out_of_service", "inactive"],
  },
  { name: "in_service_date", label: "In service", type: "date" },
];
