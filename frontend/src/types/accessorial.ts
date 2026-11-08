export interface Accessorial {
  accessorial_id: string;
  load_id: string;
  accessorial_type: string;
  amount: number;
  created_at: string;
  updated_at: string;
  // Set by the API when the type has no pay rate ("Job-Site Delivery has no pay
  // rate — it is paid at the 73% fallback; set it in Settings").
  warning?: string;
}
