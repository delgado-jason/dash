export interface Obligation {
  obligation_id: string;
  label: string;
  amount: number;
  active: boolean;
  is_draw: boolean; // owner draw (distribution) — excluded from True Net
  // Payoff tracking — a loan/lease balance on a debt obligation (null on plain
  // obligations and draws). Balances are numbers; dates are ISO strings.
  original_balance: number | null;
  current_balance: number | null;
  balance_as_of: string | null;
  payoff_date: string | null; // contract end/maturity; null → estimate at pace
  asset_type: string | null; // 'truck' | 'trailer'
  asset_id: string | null; // the specific truck/trailer this loan is against
}
