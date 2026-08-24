export interface Obligation {
  obligation_id: string;
  label: string;
  amount: number;
  active: boolean;
  is_draw: boolean; // owner draw (distribution) — excluded from True Net
  // Draft calendar (cash-flow layer). ONE bill list, three consumers:
  // liquidity drafts (draft_amount ?? amount) on day_of_month; the break-even
  // reads `amount` only where on_pl = false (P&L bills are already inside
  // operating cost — summing them again would double-count); the forecast
  // reads neither. Loan rows: amount = principal (break-even), draft = full.
  category: "loan_lease" | "insurance" | "other";
  day_of_month: number | null; // 1–31; null = not on the draft calendar
  draft_amount: number | null; // full bank draft when it differs from amount
  on_pl: boolean; // true = already a P&L expense (insurance, subscriptions)
  // Payoff tracking — a loan/lease balance on a debt obligation (null on plain
  // obligations and draws). Balances are numbers; dates are ISO strings.
  original_balance: number | null;
  current_balance: number | null;
  balance_as_of: string | null;
  payoff_date: string | null; // contract end/maturity; null → estimate at pace
  asset_type: string | null; // 'truck' | 'trailer'
  asset_id: string | null; // the specific truck/trailer this loan is against
}
