// A missing input is never zero (Jason's rule, 2026-11-04; Nod Sheet "The
// Protection Stage" P6, call 5 — nodded 2026-11-06). A projection that needs a
// planning input the owner hasn't set REFUSES the figure that needs it and says
// what is missing and where to set it, instead of running with $0 in its place
// and printing a number that looks real.
//
// requireInputs() is the one gate: hand it the inputs a figure needs and the
// words for each; it returns the numbers when every one is present, or the
// list of what is missing. A value is present when it is a finite number (the
// API hands numerics back as strings, so strings are coerced); null, undefined,
// a blank or NaN are missing. Zero is a number — a typed $0 payroll is a real
// answer, not a gap.

export interface InputWords {
  label: string; // "weekly payroll" — reads as "<label> isn't set"
  fixAt: string; // "ASSUMPTIONS" — reads as "Set it in <fixAt> ›"
  fixTo?: string; // a route when the fix lives on another page ("/status")
}

export interface MissingInput extends InputWords {
  key: string;
}

export type Required<T> =
  | { ok: true; values: { [K in keyof T]: number } }
  | { ok: false; missing: MissingInput[] };

const present = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export function requireInputs<T extends Record<string, number | string | null | undefined>>(
  inputs: T,
  words: { [K in keyof T]: InputWords },
): Required<T> {
  const values = {} as { [K in keyof T]: number };
  const missing: MissingInput[] = [];
  for (const key of Object.keys(inputs) as (keyof T)[]) {
    const n = present(inputs[key]);
    if (n == null) missing.push({ key: String(key), ...words[key] });
    else values[key] = n;
  }
  return missing.length ? { ok: false, missing } : { ok: true, values };
}

// "weekly payroll isn't set" · "weekly payroll and the fuel advance aren't set"
// · "weekly payroll, the fuel advance and the deductions aren't set"
export const missingWords = (missing: MissingInput[]): string => {
  const labels = missing.map((m) => m.label);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0] + " isn't set";
  const last = labels[labels.length - 1];
  return labels.slice(0, -1).join(", ") + " and " + last + " aren't set";
};
