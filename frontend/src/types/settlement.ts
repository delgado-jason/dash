// A weekly Landstar Contractor Statement, fed by the DTS server's parser —
// which refuses any statement that doesn't reconcile against its own
// printed totals. Read-only in dash; a week is never overwritten.
// One adjusted load's CUMULATIVE effect within a settlement week — a
// reversal+rebill pair reports its net, never the scary half alone.
export interface SettlementAdjustment {
  load_number: string | null;
  agent_code: string | null;
  load_id: string | null;
  amount: string | number; // signed net effect on the load this week
  description: string | null; // the adjustment lines' descriptions joined
}

export interface SettlementSummary {
  settlement_id: string;
  period_ending: string; // 'YYYY-MM-DD'
  revenue: string | number;
  refunds: string | number;
  deductions: string | number;
  net: string | number;
  escrow_tractor: string | number | null;
  escrow_trailer: string | number | null;
  ytd_earnings: string | number | null;
  server_url: string;
  loads: number;
  advances: string | number; // Σ advance-class deduction lines
  adjustments: SettlementAdjustment[];
  unmatched_loads: string[];
}

export interface SettlementLine {
  line_id: string;
  kind: "trip" | "recurring";
  line_class: string;
  is_adjustment: boolean;
  description: string;
  revenue: string | number | null;
  refunds: string | number | null;
  deductions: string | number | null;
  net: string | number | null;
  unit: string | null;
  period_ending: string;
  server_url: string;
}

// Per-load rollup for the loads-table flag and the last-statement link.
export interface LoadSettlementSummary {
  load_id: string;
  gross_settled: string | number;
  last_period_ending: string;
  last_server_url: string;
  has_adjustments: boolean;
}
