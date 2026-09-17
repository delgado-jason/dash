import { isValidType } from "../helper.js";

// The human-facing load number as it appears on Landstar paperwork and in
// the vault's folder names — the key the DTS server speaks (it never sees
// load_id). Seven digits today; up to twenty tolerated so a future Landstar
// format can't be locked out by a regex nobody remembers. Compared exactly
// as stored, ends trimmed.
export const LOAD_NUMBER_MAX = 20;

export const validateLoadNumber = (value) => {
  const errors = [];
  if (!isValidType("string", value)) {
    errors.push("load_number must be a string");
    return errors;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) errors.push("load_number cannot be blank");
  else if (trimmed.length > LOAD_NUMBER_MAX)
    errors.push(`load_number must be ${LOAD_NUMBER_MAX} characters or fewer`);
  return errors;
};
