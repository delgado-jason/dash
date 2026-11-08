import { toNumber } from "./moneyFields.js";

// NET-06 · the settlement schedule (the carrier's cut that turns gross into
// net), refused at the door. Lifted out of settlementScheduleServices.js so the
// rules are testable without a database.
//
// Partial, like the PUT: only the fields present are checked and returned. A
// numeric field that is null, '' or not a number is REFUSED — never read as
// Number(null) = 0, which would zero every load's net.
//   pcts            linehaul_pct, trailer_pct, fuel_surcharge_pct,
//                   accessorial_pct: 0–1 (tightened from 0–2, 2026-11-05)
//   linehaul_pct + trailer_pct ≤ 1
//   tiers           0–3, each set ascending (min ≤ target ≤ strong)
//   margin_goal     [0,1)    settlement_day 0–6    deposit_lag_days 0–6
//   per_diem_rate   0–500    per_diem_deduct_pct 0–1
//   hometime_threshold_days 1–365    detention_free_hours 0–24
//
// `current` is the stored (or default) schedule: the cross-field rules (the
// pct sum and the tier order) judge the merge of `current` and the incoming
// values. Without it they judge only what arrives, and skip a rule whose other
// half is not known.
export const OPERATIONS = [
  "flatbed",
  "heavy haul",
  "oversize",
  "tank",
  "van",
  "reefer",
  "dump",
  "car hauler",
  "other",
];
export const PCT_FIELDS = ["linehaul_pct", "trailer_pct", "fuel_surcharge_pct", "accessorial_pct"];
export const STD_TIER_FIELDS = ["rate_tier_std_min", "rate_tier_std_target", "rate_tier_std_strong"];
export const SPEC_TIER_FIELDS = ["rate_tier_spec_min", "rate_tier_spec_target", "rate_tier_spec_strong"];
export const TIER_FIELDS = [...STD_TIER_FIELDS, ...SPEC_TIER_FIELDS];

export const validateSchedule = (data, current = null) => {
  const d = data ?? {};
  const values = {};
  const errors = [];

  // A present numeric field must be a real number; returns it, or null after
  // recording the refusal.
  const numeric = (f, blankWhy) => {
    const n = toNumber(d[f]);
    if (n == null) {
      errors.push(`${f} needs a number — ${blankWhy}`);
      return null;
    }
    return n;
  };
  const set = (f, n, ok, sentence) => {
    if (n == null) return;
    if (!ok(n)) errors.push(sentence);
    else values[f] = n;
  };

  for (const f of PCT_FIELDS) {
    if (d[f] === undefined) continue;
    const n = numeric(f, "a blank would zero every load's net");
    set(f, n, (x) => x >= 0 && x <= 1, `${f} must be a fraction between 0 and 1`);
  }

  if (d.carrier_name !== undefined) values.carrier_name = (d.carrier_name ?? "").trim() || null;

  if (d.detention_free_hours !== undefined) {
    const n = numeric("detention_free_hours", "a blank would read as zero free hours");
    set("detention_free_hours", n, (x) => x >= 0 && x <= 24, "detention_free_hours must be between 0 and 24");
  }

  if (d.settlement_day !== undefined) {
    const n = numeric("settlement_day", "a blank would move every settlement to Sunday");
    set(
      "settlement_day",
      n,
      (x) => Number.isInteger(x) && x >= 0 && x <= 6,
      "settlement_day must be a day of week, 0 (Sunday) through 6 (Saturday)",
    );
  }

  if (d.deposit_lag_days !== undefined) {
    const n = numeric("deposit_lag_days", "a blank would read as same-day deposits");
    set(
      "deposit_lag_days",
      n,
      (x) => Number.isInteger(x) && x >= 0 && x <= 6,
      "deposit_lag_days must be a whole number of days, 0 through 6",
    );
  }

  if (d.per_diem_rate !== undefined) {
    const n = numeric("per_diem_rate", "a blank would read as no per diem");
    set("per_diem_rate", n, (x) => x >= 0 && x <= 500, "per_diem_rate must be between 0 and 500");
  }

  if (d.per_diem_deduct_pct !== undefined) {
    const n = numeric("per_diem_deduct_pct", "a blank would read as 0%");
    set("per_diem_deduct_pct", n, (x) => x >= 0 && x <= 1, "per_diem_deduct_pct must be a fraction 0–1");
  }

  if (d.hometime_threshold_days !== undefined) {
    const n = numeric("hometime_threshold_days", "a blank would read as zero days");
    set(
      "hometime_threshold_days",
      n,
      (x) => Number.isInteger(x) && x >= 1 && x <= 365,
      "hometime_threshold_days must be a whole number between 1 and 365",
    );
  }

  if (d.operation !== undefined) {
    if (!OPERATIONS.includes(d.operation))
      errors.push(`operation must be one of: ${OPERATIONS.join(", ")}`);
    else values.operation = d.operation;
  }

  for (const f of TIER_FIELDS) {
    if (d[f] === undefined) continue;
    const n = numeric(f, "a blank would read as a 0% tier");
    set(f, n, (x) => x >= 0 && x <= 3, `${f} must be a fraction between 0 and 3`);
  }

  if (d.margin_goal !== undefined) {
    const n = numeric("margin_goal", "a blank would read as no margin goal");
    set("margin_goal", n, (x) => x >= 0 && x < 1, "margin_goal must be a fraction between 0 and 1");
  }

  // ---- cross-field, on the merge ----
  const merged = { ...(current ?? {}), ...values };
  const known = (f) => toNumber(merged[f]) != null;
  const m = (f) => Number(merged[f]);

  if (known("linehaul_pct") && known("trailer_pct") && m("linehaul_pct") + m("trailer_pct") > 1 + 1e-9)
    errors.push(
      `linehaul_pct (${m("linehaul_pct")}) + trailer_pct (${m("trailer_pct")}) add to more than 1 — the carrier and the trailer can't take more than 100% of the linehaul`,
    );

  const ascends = (fields) => {
    if (!fields.every(known)) return true;
    const [a, b, c] = fields.map(m);
    return a <= b && b <= c;
  };
  if (!ascends(STD_TIER_FIELDS))
    errors.push("standard rate tiers must ascend: minimum ≤ target ≤ strong");
  if (!ascends(SPEC_TIER_FIELDS))
    errors.push("specialized rate tiers must ascend: minimum ≤ target ≤ strong");

  return { values, errors };
};
