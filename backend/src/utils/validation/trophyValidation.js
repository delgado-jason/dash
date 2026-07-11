import { isValidType, isDateValid } from "../helper.js";

// The locked catalog of major trophies. The backend only validates the key set;
// the frontend catalog carries the display metadata + earn conditions.
export const TROPHY_KEYS = [
  "owner-operator",
  "highway-legend",
  "million-mile-club",
  "free-and-clear",
  "trailer-paid-off",
  "own-authority",
  "second-driver",
  "second-truck",
  "five-truck-fleet",
  "one-million-hauled",
];

export const isTrophyKey = (k) => TROPHY_KEYS.includes(k);

const rules = {
  earned: (v, errors) => {
    if (v !== undefined && typeof v !== "boolean") errors.push("earned must be a boolean");
  },
  earned_on: (v, errors) => {
    if (v === null || v === undefined) return;
    if (!isValidType("string", v) || v.trim().length !== 10 || !isDateValid(v.trim()))
      errors.push("earned_on must be yyyy-mm-dd");
  },
  image_url: (v, errors) => {
    if (v === null || v === undefined) return;
    if (!isValidType("string", v)) errors.push("image_url must be a string");
    else if (v.trim().length > 2000) errors.push("image_url too long");
  },
  notes: (v, errors) => {
    if (v === null || v === undefined) return;
    if (!isValidType("string", v)) errors.push("notes must be a string");
    else if (v.trim().length > 500) errors.push("notes too long");
  },
};

export const validateTrophy = (data) => {
  const errors = [];
  for (const f in data) if (rules[f]) rules[f](data[f], errors);
  return errors;
};
