export interface Obligation {
  obligation_id: string;
  label: string;
  amount: number;
  active: boolean;
  is_draw: boolean; // owner draw (distribution) — excluded from True Net
}
