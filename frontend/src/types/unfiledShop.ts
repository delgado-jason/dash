// A vendor name seen on maintenance services that has no vendor row yet — the
// bridge row the rolodex offers to file. numeric comes back as a STRING.
export interface UnfiledShop {
  name: string;
  service_count: number;
  total_spend: string | null;
  last_service: string | null;
}
