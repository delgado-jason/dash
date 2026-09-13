export interface CreateAgencyInput {
  // The agency's own 3-letter code — the one after the dash on a freight bill.
  agency_code: string;
  // The legal name, when it's known. Null until a bill names it.
  name: string | null;
  phone: string | null;
  email: string | null;
  rating: number | null;
  notes: string | null;
}
