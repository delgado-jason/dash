// Synthetic fixtures for the money-write contracts (protection stage 4b).
// Plain objects, no database, no real names, phones or emails. Each builder
// returns a fresh copy so a test can break one field without leaking into the
// next. A valid fixture must pass its validator with no errors; the contract
// suite breaks one field at a time.

export const validSchedule = () => ({
  settlement_day: 3,
  deposit_lag_days: 1,
  detention_free_hours: 3,
  per_diem_deduct_pct: 0.8,
  margin_goal: 0.26,
});

export const validSplit = () => ({
  effective_from: "2026-02-03",
  linehaul_pct: 0.65,
  trailer_pct: 0.08,
  fuel_surcharge_pct: 1,
  accessorial_pct: 0.73,
  note: "the trailer's share began with the trailer",
});

export const validAssumptions = () => ({
  weekly_revenue: 4647,
  weekly_payroll: 1908,
  monthly_depreciation: 2000,
  fed_tax_rate: 0.15,
  state_tax_rate: 0.05,
  financing_floor: -2318,
  tax_catchup_owed: 0,
  weekly_fuel_advance: 2000,
  weekly_settlement_deductions: 361.99,
});

export const validObligation = () => ({
  label: "Truck note",
  amount: 1250,
  active: true,
  is_draw: false,
  on_pl: false,
  category: "loan",
  day_of_month: 15,
  draft_amount: 1250,
  original_balance: 60000,
  current_balance: 42000,
  balance_as_of: "2026-10-31",
  payoff_date: "2029-06-15",
});

export const validExpensePeriod = () => ({
  period_month: "2026-10-01",
  totals: { income_total: 20000, cogs_total: 3000, expense_total: 7500.5 },
  lines: [
    { category: "Fuel", amount: 2000, type: "variable", section: "cogs" },
    { category: "Tolls", amount: 1000, type: "variable", section: "cogs" },
    { category: "Insurance", amount: 5000.25, type: "fixed", section: "expenses" },
    { category: "Repairs", amount: 2500.25, type: "variable", section: "expenses" },
    { category: "Freight revenue", amount: 20000, type: "variable", section: "income" },
  ],
});

export const validDeliveredLoad = () => ({
  load_number: "9100001",
  pickup_date: "2026-10-12",
  delivery_date: "2026-10-14",
  load_status: "delivered",
  linehaul: 2000,
  fuel_surcharge: 600,
  loaded_miles: 800,
  payment_status: "unpaid",
  odometer_start: 500000,
  odometer_end: 500850,
});

export const validSnapshotAccounts = () => [
  { account_id: "acct-ops", name: "Ops", active: true },
  { account_id: "acct-tax", name: "Tax", active: true },
  { account_id: "acct-maint", name: "Maintenance", active: true },
  { account_id: "acct-vault", name: "Vault", active: true },
];

export const validSnapshotBalances = () => [
  { account_id: "acct-ops", balance: 4200 },
  { account_id: "acct-tax", balance: 1800 },
  { account_id: "acct-maint", balance: 950.5 },
  { account_id: "acct-vault", balance: 12000 },
];

export const validPerDiemRate = () => ({
  effective_from: "2026-10-01",
  rate: 86,
  note: "IRS FY2027",
});

export const validFscSchedule = () => ({
  effective_from: "2026-11-01",
  bands: [
    { low: 4.0, high: 4.049, cpm: 0.58 },
    { low: 4.05, high: 4.099, cpm: 0.59 },
    { low: 4.1, high: null, cpm: 0.6 },
  ],
  note: "Landstar table",
});

export const validFscScalePoint = () => ({
  week_of: "2026-11-03",
  national_avg: 6.292,
  cents_per_mile: 0.86,
  pct_of_linehaul: 0.52,
  regions: [
    { region: "PADD 1A", price: 6.416, cpm: 0.88 },
    { region: "PADD 4", price: 6.445, cpm: 0.89 },
    { region: "PADD 5", price: 7.272, cpm: 1.03 },
  ],
});
