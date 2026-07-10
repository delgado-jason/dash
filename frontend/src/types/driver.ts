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
}
