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

export function isValidUUID(uuid) {
  return !!uuid.match(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
}
