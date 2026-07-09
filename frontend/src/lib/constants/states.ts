// US states → full name + freight region. Region boundaries follow the US
// Census Bureau's 9 divisions, relabeled for trucking. Region for a load is
// derived from its origin_state — there is no stored region column.
export interface StateInfo {
  name: string;
  region: string;
}

export const UNKNOWN_REGION = "Unknown";

export const STATES: Record<string, StateInfo> = {
  AL: { name: "Alabama", region: "Mid-South" },
  AK: { name: "Alaska", region: "Pacific" },
  AZ: { name: "Arizona", region: "Mountain" },
  AR: { name: "Arkansas", region: "Gulf" },
  CA: { name: "California", region: "Pacific" },
  CO: { name: "Colorado", region: "Mountain" },
  CT: { name: "Connecticut", region: "New England" },
  DE: { name: "Delaware", region: "Southeast" },
  DC: { name: "District of Columbia", region: "Southeast" },
  FL: { name: "Florida", region: "Southeast" },
  GA: { name: "Georgia", region: "Southeast" },
  HI: { name: "Hawaii", region: "Pacific" },
  ID: { name: "Idaho", region: "Mountain" },
  IL: { name: "Illinois", region: "Midwest" },
  IN: { name: "Indiana", region: "Midwest" },
  IA: { name: "Iowa", region: "Plains" },
  KS: { name: "Kansas", region: "Plains" },
  KY: { name: "Kentucky", region: "Mid-South" },
  LA: { name: "Louisiana", region: "Gulf" },
  ME: { name: "Maine", region: "New England" },
  MD: { name: "Maryland", region: "Southeast" },
  MA: { name: "Massachusetts", region: "New England" },
  MI: { name: "Michigan", region: "Midwest" },
  MN: { name: "Minnesota", region: "Plains" },
  MS: { name: "Mississippi", region: "Mid-South" },
  MO: { name: "Missouri", region: "Plains" },
  MT: { name: "Montana", region: "Mountain" },
  NE: { name: "Nebraska", region: "Plains" },
  NV: { name: "Nevada", region: "Mountain" },
  NH: { name: "New Hampshire", region: "New England" },
  NJ: { name: "New Jersey", region: "Northeast" },
  NM: { name: "New Mexico", region: "Mountain" },
  NY: { name: "New York", region: "Northeast" },
  NC: { name: "North Carolina", region: "Southeast" },
  ND: { name: "North Dakota", region: "Plains" },
  OH: { name: "Ohio", region: "Midwest" },
  OK: { name: "Oklahoma", region: "Gulf" },
  OR: { name: "Oregon", region: "Pacific" },
  PA: { name: "Pennsylvania", region: "Northeast" },
  RI: { name: "Rhode Island", region: "New England" },
  SC: { name: "South Carolina", region: "Southeast" },
  SD: { name: "South Dakota", region: "Plains" },
  TN: { name: "Tennessee", region: "Mid-South" },
  TX: { name: "Texas", region: "Gulf" },
  UT: { name: "Utah", region: "Mountain" },
  VT: { name: "Vermont", region: "New England" },
  VA: { name: "Virginia", region: "Southeast" },
  WA: { name: "Washington", region: "Pacific" },
  WV: { name: "West Virginia", region: "Southeast" },
  WI: { name: "Wisconsin", region: "Midwest" },
  WY: { name: "Wyoming", region: "Mountain" },
};

// Region for a 2-letter state code. Unrecognized / blank → UNKNOWN_REGION.
export const getRegion = (stateAbbr: string | null | undefined): string => {
  if (!stateAbbr) return UNKNOWN_REGION;
  return STATES[stateAbbr.toUpperCase()]?.region ?? UNKNOWN_REGION;
};

// Full state name for a 2-letter code (for the choropleth, which keys on the
// map topology's full names). Unrecognized / blank → null.
export const getStateName = (
  stateAbbr: string | null | undefined,
): string | null => {
  if (!stateAbbr) return null;
  return STATES[stateAbbr.toUpperCase()]?.name ?? null;
};
