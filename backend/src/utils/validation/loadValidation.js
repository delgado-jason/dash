import { isValidType, isDateValid, isValidUUID } from "../helper.js";

const rules = {
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
  broker_id: (value, errors) => {
    if (!isValidUUID(value)) {
      errors.push("not a valid UUID");
    }
  },
  agent_id: (value, errors) => {
    if (!isValidUUID(value)) {
      errors.push("not a valid UUID");
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
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("shipper_name must be a string");
    }
  },
  receiver_name: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("receiver_name must be a string");
    }
  },
  commodity: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("commodity must be a string");
    }
  },
  weight: (value, errors) => {
    if (!value) return;

    if (!isValidType("integer", value)) {
      errors.push("weight must be an integer");
    }

    if (value < 1) {
      errors.push("weight must be greater than 0");
    }
  },
  dimensions: (value, errors) => {
    if (!value) return;

    if (!isValidType("string", value)) {
      errors.push("dimensions must be a string");
    }
  },
  deadhead_miles: (value, errors) => {
    if (!value) return;

    if (!isValidType("integer", value)) {
      errors.push("deadhead_miles must be an integer");
    }

    if (value < 0) {
      errors.push("deadhead_miles must be greater than or equal to 0");
    }
  },
  odometer_start: (value, errors) => {
    if (!value) return;

    if (!isValidType("integer", value)) {
      errors.push("odometer_start must be an integer");
    }

    if (value < 1) {
      errors.push("odometer_start must be greater than 0");
    }
  },
  odometer_end: (value, errors) => {
    if (!value) return;

    if (!isValidType("integer", value)) {
      errors.push("odometer_end must be an integer");
    }

    if (value < 1) {
      errors.push("odometer_end must be greater than 0");
    }
  },
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
  if (data.broker_id === undefined) errors.push("Missing broker_id");
  if (data.agent_id === undefined) errors.push("Missing agent_id");
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

  return errors;
};

// ---- PATCH LOAD VALIDATION ----
export const validateLoadPatch = (data) => {
  const errors = [];

  for (const field in data) {
    if (rules[field]) {
      rules[field](data[field], errors);
    }
  }

  return errors;
};
