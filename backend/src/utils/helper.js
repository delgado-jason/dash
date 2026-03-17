export function isValidType(type = "string", value) {
  if (typeof value !== type) {
    return false;
  }
  return true;
}

// Validate Dates
export function isDateValid(dateStr) {
  return !isNaN(new Date(dateStr));
}
