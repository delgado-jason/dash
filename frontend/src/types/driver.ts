import type { LastRenewal } from "./compliance";

export interface Driver {
  driver_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  cdl_number: string | null;
  cdl_state: string | null;
  cdl_expiration: string | null;
  endorsements: string | null;
  hire_date: string | null;
  avatar_url: string | null;
  notes: string | null;
  active: boolean;
  // The CDL's newest closed cycle, carried on GET /drivers so the compliance
  // page's CDL row draws its history line with no extra request. `?:` because
  // the create/patch responses return the driver row alone, without them.
  last_cdl_renewal?: LastRenewal | null;
  cdl_renewal_count?: number;
}
