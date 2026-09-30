import { ValidationError } from "../error.js";

// OPS NOW (#502): the bank's Ops balance on a date, typed by the owner.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const utcDayKey = (d) => d.toISOString().slice(0, 10);

// The far edge of "today". The server's zone is not the owner's (Railway runs
// UTC, the business is Central), so the ceiling is UTC-today + 1: a full day
// of slack, which is what a Central evening needs and still refuses a month
// mis-picked in the native date picker.
const tomorrowKey = (now) =>
  utcDayKey(new Date(Date.parse(`${utcDayKey(now)}T00:00:00Z`) + 86_400_000));

export const normalizeOpsCheck = ({ as_of, balance, note } = {}, now = new Date()) => {
  const day = String(as_of ?? "").trim();
  if (!DATE_RE.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`)))
    throw new ValidationError("as_of must be a YYYY-MM-DD date");
  // A check re-bases the board from its day forward, so a future date would
  // hand the board a balance that day never had. The server holds this line
  // because the check is what gets stored.
  if (day > tomorrowKey(now))
    throw new ValidationError("a balance can only be from today or earlier");
  if (balance === undefined || balance === null || String(balance).trim() === "")
    throw new ValidationError("balance is required");
  const n = Number(String(balance).replace(/[$,]/g, ""));
  if (!Number.isFinite(n) || n < -1_000_000 || n > 10_000_000)
    throw new ValidationError("balance must be a number between -1,000,000 and 10,000,000");
  const text = note == null ? null : String(note).trim().slice(0, 200) || null;
  return { as_of: day, balance: Math.round(n * 100) / 100, note: text };
};
