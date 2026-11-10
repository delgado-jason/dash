import { isValidType, isDateValid, isValidUUID } from "../helper.js";

// Decision 5A (074): whose customer a load is. Mirrors the column's CHECK.
export const CUSTOMER_ENDS = ["shipper", "receiver", "neither"];

// GL-106 (Jason, 2026-11-06): every load has its booker. The scoreboard, the
// dispatcher card and the Recap all split loads by who booked them, so a load
// without one silently drops out of all three. The same sentence the load form
// shows.
export const BOOKER_REQUIRED =
  "Every load needs its booker — the scoreboard, the card and the Recap all split loads by who booked them.";

const rules = {
  booked_by: (value, errors) => {
    // undefined = not part of this patch (a create checks presence below).
    if (value === undefined) return;
    if (value === null || (typeof value === "string" && value.trim() === "")) {
      errors.push(BOOKER_REQUIRED);
      return;
    }
    if (!isValidType("string", value) || !isValidUUID(value)) {
      errors.push("booked_by is not a valid UUID");
    }
  },
  load_number: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("load_number must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length > 20) {
      errors.push("load_number cannot be greater than 20 chars");
    }

    if (trimmed.length === 0) {
      errors.push("load_number cannot be blank");
    }
  },
  pickup_date: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("pickup_date must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("pickup_date cannot be blank");
    }

    if (trimmed.length !== 10) {
      // valid date format xxxx-xx-xx
      errors.push("pickup_date must be 10 chars long (xxxx-xx-xx)");
    }

    // Validate date
    const date = isDateValid(trimmed);
    if (!date) {
      errors.push(`${value} is an invalid date`);
    }
  },
  delivery_date: (value, errors) => {
    if (value === undefined) return;

    if (!isValidType("string", value)) {
      errors.push("delivery_date must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("delivery_date cannot be blank");
    }

    if (trimmed.length !== 10) {
      // valid date format xxxx-xx-xx
      errors.push("delivery_date must be 10 chars long (xxxx-xx-xx)");
    }

    // Validate date
    const date = isDateValid(trimmed);
    if (!date) {
      errors.push(`${value} is an invalid date`);
    }
  },
  booked_via: (value, errors) => {
    // Attribution enum — null/undefined legal (legacy loads; edits must not
    // be forced to invent history). A present value must be one of the two.
    if (value == null) return;
    if (!["agent_reached_out", "i_reached_out"].includes(value))
      errors.push(`${value} is not an allowed booked_via value`);
  },
  load_status: (value, errors) => {
    const allowedStatusValues = [
      "booked",
      "in_transit",
      "delivered",
      "cancelled",
      "tonu",
    ];

    if (!isValidType("string", value)) {
      errors.push("load_status must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("load_status cannot be blank");
    }

    if (!allowedStatusValues.includes(trimmed)) {
      errors.push(`${value} is not an allowed load_status type`);
    }
  },
  linehaul: (value, errors) => {
    if (!isValidType("number", value)) {
      errors.push("linehaul must be a number");
      return;
    }

    if (value <= 0) {
      errors.push("linehaul must be greater than 0");
    }
  },
  fuel_surcharge: (value, errors) => {
    if (!isValidType("number", value)) {
      errors.push("fuel_surcharge must be a number");
      return;
    }

    if (value < 0) {
      errors.push("fuel_surcharge must be greater than or equal to 0");
    }
  },
  loaded_miles: (value, errors) => {
    if (!isValidType("integer", value)) {
      errors.push("loaded_miles must be an integer");
      return;
    }

    if (value <= 0) {
      errors.push("loaded_miles has to be greater than 0");
    }

    if (value > 10000) {
      errors.push("loaded_miles cannot be greater than 10000");
    }
  },
  payment_status: (value, errors) => {
    const paymentStatusValues = ["unpaid", "invoiced", "paid", "cancelled"];

    if (!isValidType("string", value)) {
      errors.push("payment_status must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("payment_status cannot be blank");
    }

    if (!paymentStatusValues.includes(trimmed)) {
      errors.push(`${value} is not a valid payment_status value`);
    }
  },
  load_type: (value, errors) => {
    const load_types = ["standard flatbed", "oversize", "heavy haul", "hazmat"];
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("load type must not be blank");
    }

    if (!load_types.includes(value)) {
      errors.push(`${value} is not a valid load type`);
    }
  },
  // loads.agency_id is nullable since 075, so a PATCH may clear it with null.
  // A create still REQUIRES one — validateLoadCreate says so below. Anything
  // that is neither null nor a uuid string is refused (and isValidUUID would
  // throw on a non-string, so the type is checked first).
  agency_id: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidType("string", value) || !isValidUUID(value)) {
      errors.push("agency_id is not a valid UUID");
    }
  },
  agent_id: (value, errors) => {
    if (!isValidType("string", value) || !isValidUUID(value)) {
      errors.push("agent_id is not a valid UUID");
    }
  },
  origin_city: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("origin_city must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("origin_city cannot be blank");
    }
  },
  origin_state: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("origin_state must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("origin_state cannot be blank");
    }

    if (trimmed.length !== 2) {
      errors.push("origin_state must be two chars");
    }
  },
  destination_city: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("destination_city must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("destination_city cannot be blank");
    }
  },
  destination_state: (value, errors) => {
    if (!isValidType("string", value)) {
      errors.push("destination_state must be a string");
      return;
    }

    const trimmed = value.trim();

    if (trimmed.length === 0) {
      errors.push("destination_state cannot be blank");
    }

    if (trimmed.length !== 2) {
      errors.push("destination_state must be two chars");
    }
  },
  origin_market_id: (value, errors) => {
    if (!isValidUUID(value)) {
      errors.push("not a valid UUID");
    }
  },
  destination_market_id: (value, errors) => {
    if (!isValidUUID(value)) {
      errors.push("not a valid UUID");
    }
  },
  shipper_name: (value, errors) => {
    // ODO-05: only a missing value is skipped — a typed 0 is refused below.
    if (value == null) return;

    if (!isValidType("string", value)) {
      errors.push("shipper_name must be a string");
    }
  },
  receiver_name: (value, errors) => {
    // ODO-05: only a missing value is skipped — a typed 0 is refused below.
    if (value == null) return;

    if (!isValidType("string", value)) {
      errors.push("receiver_name must be a string");
    }
  },
  commodity: (value, errors) => {
    // ODO-05: only a missing value is skipped — a typed 0 is refused below.
    if (value == null) return;

    if (!isValidType("string", value)) {
      errors.push("commodity must be a string");
    }
  },
  weight: (value, errors) => {
    // ODO-05: only a missing value is skipped — a typed 0 is refused below.
    if (value == null) return;

    if (!isValidType("integer", value)) {
      errors.push("weight must be an integer");
    }

    if (value < 1) {
      errors.push("weight must be greater than 0");
    }
  },
  length_in: (value, errors) => {
    if (value == null) return;
    if (!isValidType("integer", value) || value < 1)
      errors.push("length_in must be a positive integer (inches)");
  },
  width_in: (value, errors) => {
    if (value == null) return;
    if (!isValidType("integer", value) || value < 1)
      errors.push("width_in must be a positive integer (inches)");
  },
  height_in: (value, errors) => {
    if (value == null) return;
    if (!isValidType("integer", value) || value < 1)
      errors.push("height_in must be a positive integer (inches)");
  },
  deadhead_miles: (value, errors) => {
    // ODO-05: only a missing value is skipped — a typed 0 is refused below.
    if (value == null) return;

    if (!isValidType("integer", value)) {
      errors.push("deadhead_miles must be an integer");
    }

    if (value < 0) {
      errors.push("deadhead_miles must be greater than or equal to 0");
    }
  },
  // null = undecided (recommend), true = owed, false = dismissed.
  detention_billable: (value, errors) => {
    if (value === null || value === undefined) return;
    if (typeof value !== "boolean")
      errors.push("detention_billable must be true, false, or null");
  },
  // Decision 4 (073): set by Dispatch when an OS&D or damage claim lands. A
  // plain boolean — the column is NOT NULL DEFAULT false, so null is refused.
  claim_filed: (value, errors) => {
    if (value === undefined) return;
    if (typeof value !== "boolean")
      errors.push("claim_filed must be true or false");
  },
  // Decision 5A (074): which end of the load the agent's customer sits on.
  // Optional on create and on patch — the column is NOT NULL DEFAULT
  // 'shipper', so null is refused along with every other non-member. The
  // three strings are the same set the CHECK constraint enforces.
  customer_end: (value, errors) => {
    if (value === undefined) return;
    if (!CUSTOMER_ENDS.includes(value))
      errors.push("customer_end must be one of: shipper, receiver, neither");
  },
  odometer_start: (value, errors) => {
    // ODO-05: only a missing value is skipped — a typed 0 is refused below.
    if (value == null) return;

    if (!isValidType("integer", value)) {
      errors.push("odometer_start must be an integer");
    }

    if (value < 1) {
      errors.push("odometer_start must be greater than 0");
    }
  },
  odometer_end: (value, errors) => {
    // ODO-05: only a missing value is skipped — a typed 0 is refused below.
    if (value == null) return;

    if (!isValidType("integer", value)) {
      errors.push("odometer_end must be an integer");
    }

    if (value < 1) {
      errors.push("odometer_end must be greater than 0");
    }
  },
  // Fleet links are optional; null/absent means unassigned. When present they
  // must be a UUID.
  truck_id: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidUUID(value)) errors.push("truck_id must be a valid UUID");
  },
  driver_id: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidUUID(value)) errors.push("driver_id must be a valid UUID");
  },
  trailer_id: (value, errors) => {
    if (value === null || value === undefined) return;
    if (!isValidUUID(value)) errors.push("trailer_id must be a valid UUID");
  },
  // The console's stop stamps (106) — the first timestamptz the loads writer
  // accepts. Shape only: a string Postgres can parse as a moment. An
  // unparseable one would otherwise reach the driver and come back a 500 with
  // a Postgres parse error, which tells the caller nothing.
  //
  // ORDER is left to the DB: `loads_stop_stamps_forward` refuses a release
  // before its arrival. The console cannot produce that pair (it stamps
  // Date.now(), and time moves one way), and a constraint holds for every
  // writer, forever, where a check here holds only for this one.
  ...Object.fromEntries(
    ["shipper_in_at", "shipper_out_at", "receiver_in_at", "receiver_out_at"].map((f) => [
      f,
      (value, errors) => {
        if (value === null || value === undefined) return;
        const t = new Date(String(value)).getTime();
        if (Number.isNaN(t)) errors.push(`${f} must be a timestamp`);
      },
    ]),
  ),
};

// ---- CROSS-FIELD: a load can't deliver before it picks up ----
// Both come in as 'YYYY-MM-DD', so a string compare is the whole check — no
// Date parsing, no timezone to get wrong. On a PATCH the caller merges the
// incoming value over the stored one before calling this, since only the
// changed field arrives.
//
// A delivery date earlier than the pickup date parks a load's earnings in the
// wrong pay week. One of these (Jul 14 delivery on a Jul 21 pickup) silently
// broke three dashboard cards: it inflated the grind streak to 8 weeks, emptied
// the current week's earned total, and mis-sorted Recent Loads.
export const validateDateOrder = (pickup_date, delivery_date, errors) => {
  if (!pickup_date || !delivery_date) return;
  const p = String(pickup_date).trim().slice(0, 10);
  const d = String(delivery_date).trim().slice(0, 10);
  if (p.length !== 10 || d.length !== 10) return; // shape errors already reported
  if (d < p) {
    errors.push(
      `delivery_date (${d}) cannot be earlier than pickup_date (${p})`,
    );
  }
};

// ---- CROSS-FIELD: the odometer window and the delivered load ----
// ODO-05: odometer_end must be greater than odometer_start when both are
// present. ODO-06: a delivered load needs its delivery_date and BOTH readings —
// empty miles, the Friday accrual and break-even all read them (Jason nodded the
// sentence).
//
// `pick(field)` answers {known, value}: a create knows every field (an absent
// one is blank); a PATCH knows what it carries, then what `existing` carries,
// and skips a rule whose half it cannot see.
export const DELIVERED_NEEDS =
  "a delivered load needs its end odometer and its delivery date — empty miles, the Friday accrual and break-even all read them";

const blankValue = (v) => v == null || (typeof v === "string" && v.trim() === "");

export const validateReadings = (pick, errors) => {
  const s = pick("odometer_start");
  const e = pick("odometer_end");
  if (
    s.known && e.known &&
    Number.isInteger(s.value) && Number.isInteger(e.value) &&
    s.value >= 1 && e.value >= 1 && e.value <= s.value
  ) {
    errors.push(`odometer_end (${e.value}) must be greater than odometer_start (${s.value})`);
  }
  const status = pick("load_status");
  if (status.known && typeof status.value === "string" && status.value.trim() === "delivered") {
    const needs = ["delivery_date", "odometer_start", "odometer_end"].map(pick);
    if (needs.some((f) => f.known && blankValue(f.value))) errors.push(DELIVERED_NEEDS);
  }
};

// ---- CREATE LOAD VALIDATION ----
export const validateLoadCreate = (data) => {
  const errors = [];

  // Check for mandatory fields
  if (data.load_number === undefined) errors.push("Missing load_number");
  if (data.pickup_date === undefined) errors.push("Missing pickup_date");
  if (data.load_status === undefined) errors.push("Missing load_status");
  if (data.linehaul === undefined) errors.push("Missing linehaul");
  if (data.fuel_surcharge === undefined) errors.push("Missing fuel_surcharge");
  if (data.loaded_miles === undefined) errors.push("Missing loaded_miles");
  if (data.payment_status === undefined) errors.push("Missing payment_status");
  // A new load is always posted through an agency; only a PATCH may clear it.
  if (data.agency_id === undefined || data.agency_id === null)
    errors.push("Missing agency_id");
  if (data.agent_id === undefined) errors.push("Missing agent_id");
  // GL-106: the booker is required on a create (the rule above handles a
  // present-but-blank value; this handles a missing one).
  if (data.booked_by === undefined) errors.push(BOOKER_REQUIRED);
  if (data.origin_city === undefined) errors.push("Missing origin_city");
  if (data.origin_state === undefined) errors.push("Missing origin_state");
  if (data.destination_city === undefined)
    errors.push("Missing destination_city");
  if (data.destination_state === undefined)
    errors.push("Missing destination_state");
  if (data.origin_market_id === undefined)
    errors.push("Missing origin_market_id");
  if (data.destination_market_id === undefined)
    errors.push("Missing destination_market_id");

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  validateDateOrder(data.pickup_date, data.delivery_date, errors);
  validateReadings((f) => ({ known: true, value: data[f] }), errors);

  return errors;
};

// ---- PATCH LOAD VALIDATION ----
// `existing` is the stored row's { pickup_date, delivery_date } as 'YYYY-MM-DD'
// strings, and — when the caller has them — { load_status, odometer_start,
// odometer_end } for the delivered/odometer rules. A PATCH may change only one of the two, so the date-order check has
// to compare the incoming value against what's already saved.
export const validateLoadPatch = (data, existing = {}) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  validateDateOrder(
    data.pickup_date ?? existing.pickup_date,
    data.delivery_date ?? existing.delivery_date,
    errors,
  );
  validateReadings((f) => {
    if (data[f] !== undefined) return { known: true, value: data[f] };
    if (f in existing) return { known: true, value: existing[f] };
    return { known: false, value: undefined };
  }, errors);

  return errors;
};
