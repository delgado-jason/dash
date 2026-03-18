export function isValidType(type = "string", value) {
  if (type === "integer") {
    return Number.isInteger(value);
  }

  if (type === "number") {
    return typeof value === "number" && !Number.isNaN(value);
  }

  return typeof value === type;
}

// Validate Dates
export function isDateValid(dateStr) {
  return !isNaN(new Date(dateStr));
}
