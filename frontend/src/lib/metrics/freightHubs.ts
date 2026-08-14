import type { CityCoord } from "./foreman";
import { haversineMiles } from "./foreman";

// Seeded national freight hubs — the cities a Landstar agent would reference
// (ports, rail/intermodal, distribution clusters, border crossings, steel /
// project-cargo origins). Powers the recommender's tier-5 "nearest hub" rung:
// a load in a new city near one of these suggests "[Hub] Market".
export interface FreightHub {
  city: string;
  state: string; // 2-letter USPS
  lat: number;
  lng: number;
  kind:
    | "port"
    | "rail-intermodal"
    | "distribution"
    | "manufacturing"
    | "border"
    | "metro";
}

export const FREIGHT_HUBS: FreightHub[] = [
  { city: "Chicago", state: "IL", lat: 41.8781, lng: -87.6298, kind: "rail-intermodal" },
  { city: "Atlanta", state: "GA", lat: 33.749, lng: -84.388, kind: "distribution" },
  { city: "Dallas", state: "TX", lat: 32.7767, lng: -96.797, kind: "metro" },
  { city: "Los Angeles", state: "CA", lat: 34.0522, lng: -118.2437, kind: "port" },
  { city: "Houston", state: "TX", lat: 29.7604, lng: -95.3698, kind: "port" },
  { city: "Memphis", state: "TN", lat: 35.1495, lng: -90.049, kind: "rail-intermodal" },
  { city: "Kansas City", state: "MO", lat: 39.0997, lng: -94.5786, kind: "rail-intermodal" },
  { city: "Laredo", state: "TX", lat: 27.5306, lng: -99.4803, kind: "border" },
  { city: "Joliet", state: "IL", lat: 41.525, lng: -88.0817, kind: "rail-intermodal" },
  { city: "Fort Worth", state: "TX", lat: 32.7555, lng: -97.3308, kind: "rail-intermodal" },
  { city: "Ontario", state: "CA", lat: 34.0633, lng: -117.6509, kind: "distribution" },
  { city: "Elizabeth", state: "NJ", lat: 40.664, lng: -74.2107, kind: "port" },
  { city: "Savannah", state: "GA", lat: 32.0809, lng: -81.0912, kind: "port" },
  { city: "Columbus", state: "OH", lat: 39.9612, lng: -82.9988, kind: "distribution" },
  { city: "Charlotte", state: "NC", lat: 35.2271, lng: -80.8431, kind: "rail-intermodal" },
  { city: "Indianapolis", state: "IN", lat: 39.7684, lng: -86.1581, kind: "distribution" },
  { city: "Harrisburg", state: "PA", lat: 40.2732, lng: -76.8867, kind: "distribution" },
  { city: "Allentown", state: "PA", lat: 40.6084, lng: -75.4902, kind: "distribution" },
  { city: "Louisville", state: "KY", lat: 38.2527, lng: -85.7585, kind: "distribution" },
  { city: "Nashville", state: "TN", lat: 36.1627, lng: -86.7816, kind: "distribution" },
  { city: "Phoenix", state: "AZ", lat: 33.4484, lng: -112.074, kind: "distribution" },
  { city: "Detroit", state: "MI", lat: 42.3314, lng: -83.0458, kind: "manufacturing" },
  { city: "Salt Lake City", state: "UT", lat: 40.7608, lng: -111.891, kind: "rail-intermodal" },
  { city: "Baltimore", state: "MD", lat: 39.2904, lng: -76.6122, kind: "port" },
  { city: "Norfolk", state: "VA", lat: 36.8508, lng: -76.2859, kind: "port" },
  { city: "Charleston", state: "SC", lat: 32.7765, lng: -79.9311, kind: "port" },
  { city: "Jacksonville", state: "FL", lat: 30.3322, lng: -81.6557, kind: "port" },
  { city: "Miami", state: "FL", lat: 25.7617, lng: -80.1918, kind: "port" },
  { city: "Seattle", state: "WA", lat: 47.6062, lng: -122.3321, kind: "port" },
  { city: "Oakland", state: "CA", lat: 37.8044, lng: -122.2712, kind: "port" },
  { city: "Denver", state: "CO", lat: 39.7392, lng: -104.9903, kind: "metro" },
  { city: "Philadelphia", state: "PA", lat: 39.9526, lng: -75.1652, kind: "port" },
  { city: "Pittsburgh", state: "PA", lat: 40.4406, lng: -79.9959, kind: "manufacturing" },
  { city: "Cleveland", state: "OH", lat: 41.4993, lng: -81.6944, kind: "manufacturing" },
  { city: "Cincinnati", state: "OH", lat: 39.1031, lng: -84.512, kind: "distribution" },
  { city: "St. Louis", state: "MO", lat: 38.627, lng: -90.1994, kind: "rail-intermodal" },
  { city: "Minneapolis", state: "MN", lat: 44.9778, lng: -93.265, kind: "distribution" },
  { city: "Milwaukee", state: "WI", lat: 43.0389, lng: -87.9065, kind: "manufacturing" },
  { city: "San Antonio", state: "TX", lat: 29.4241, lng: -98.4936, kind: "metro" },
  { city: "Austin", state: "TX", lat: 30.2672, lng: -97.7431, kind: "manufacturing" },
  { city: "El Paso", state: "TX", lat: 31.7619, lng: -106.485, kind: "border" },
  { city: "Oklahoma City", state: "OK", lat: 35.4676, lng: -97.5164, kind: "distribution" },
  { city: "Tulsa", state: "OK", lat: 36.154, lng: -95.9928, kind: "manufacturing" },
  { city: "Little Rock", state: "AR", lat: 34.7465, lng: -92.2896, kind: "distribution" },
  { city: "Bentonville", state: "AR", lat: 36.3729, lng: -94.2088, kind: "distribution" },
  { city: "New Orleans", state: "LA", lat: 29.9511, lng: -90.0715, kind: "port" },
  { city: "Baton Rouge", state: "LA", lat: 30.4515, lng: -91.1871, kind: "manufacturing" },
  { city: "Birmingham", state: "AL", lat: 33.5186, lng: -86.8104, kind: "manufacturing" },
  { city: "Mobile", state: "AL", lat: 30.6954, lng: -88.0399, kind: "port" },
  { city: "Knoxville", state: "TN", lat: 35.9606, lng: -83.9207, kind: "distribution" },
  { city: "Chattanooga", state: "TN", lat: 35.0456, lng: -85.3097, kind: "manufacturing" },
  { city: "Greensboro", state: "NC", lat: 36.0726, lng: -79.792, kind: "distribution" },
  { city: "Spartanburg", state: "SC", lat: 34.9496, lng: -81.932, kind: "manufacturing" },
  { city: "Tampa", state: "FL", lat: 27.9506, lng: -82.4572, kind: "port" },
  { city: "Orlando", state: "FL", lat: 28.5383, lng: -81.3792, kind: "distribution" },
  { city: "Richmond", state: "VA", lat: 37.5407, lng: -77.436, kind: "distribution" },
  { city: "Gary", state: "IN", lat: 41.5934, lng: -87.3464, kind: "manufacturing" },
  { city: "Toledo", state: "OH", lat: 41.6528, lng: -83.5379, kind: "manufacturing" },
  { city: "Boston", state: "MA", lat: 42.3601, lng: -71.0589, kind: "metro" },
  { city: "Stockton", state: "CA", lat: 37.9577, lng: -121.2908, kind: "rail-intermodal" },
  { city: "Fresno", state: "CA", lat: 36.7378, lng: -119.7871, kind: "distribution" },
  { city: "Las Vegas", state: "NV", lat: 36.1699, lng: -115.1398, kind: "distribution" },
  { city: "Reno", state: "NV", lat: 39.5296, lng: -119.8138, kind: "distribution" },
  { city: "Portland", state: "OR", lat: 45.5152, lng: -122.6784, kind: "port" },
  { city: "Tacoma", state: "WA", lat: 47.2529, lng: -122.4443, kind: "port" },
  { city: "Omaha", state: "NE", lat: 41.2565, lng: -95.9345, kind: "rail-intermodal" },
  { city: "Des Moines", state: "IA", lat: 41.5868, lng: -93.625, kind: "distribution" },
  { city: "Corpus Christi", state: "TX", lat: 27.8006, lng: -97.3964, kind: "port" },
  { city: "Beaumont", state: "TX", lat: 30.0802, lng: -94.1266, kind: "port" },
  { city: "Midland", state: "TX", lat: 31.9974, lng: -102.0779, kind: "manufacturing" },
  { city: "Lake Charles", state: "LA", lat: 30.2266, lng: -93.2174, kind: "manufacturing" },
  { city: "Shreveport", state: "LA", lat: 32.5252, lng: -93.7502, kind: "distribution" },
  { city: "Huntsville", state: "AL", lat: 34.7304, lng: -86.5861, kind: "manufacturing" },
  { city: "Albuquerque", state: "NM", lat: 35.0844, lng: -106.6504, kind: "distribution" },
  { city: "Wichita", state: "KS", lat: 37.6872, lng: -97.3301, kind: "manufacturing" },
  { city: "Buffalo", state: "NY", lat: 42.8864, lng: -78.8784, kind: "border" },
  { city: "Syracuse", state: "NY", lat: 43.0481, lng: -76.1474, kind: "rail-intermodal" },
  { city: "Albany", state: "NY", lat: 42.6526, lng: -73.7562, kind: "port" },
  { city: "Scranton", state: "PA", lat: 41.409, lng: -75.6624, kind: "distribution" },
  { city: "Carlisle", state: "PA", lat: 40.2015, lng: -77.1889, kind: "distribution" },
  { city: "Hartford", state: "CT", lat: 41.7658, lng: -72.6734, kind: "distribution" },
  { city: "New York", state: "NY", lat: 40.7128, lng: -74.006, kind: "metro" },
  { city: "Washington", state: "DC", lat: 38.9072, lng: -77.0369, kind: "metro" },
  { city: "Portland", state: "ME", lat: 43.6591, lng: -70.2568, kind: "port" },
  { city: "Jackson", state: "MS", lat: 32.2988, lng: -90.1848, kind: "metro" },
  { city: "Sacramento", state: "CA", lat: 38.5816, lng: -121.4944, kind: "metro" },
  { city: "San Diego", state: "CA", lat: 32.7157, lng: -117.1611, kind: "metro" },
  { city: "Tucson", state: "AZ", lat: 32.2226, lng: -110.9747, kind: "manufacturing" },
  { city: "Nogales", state: "AZ", lat: 31.3404, lng: -110.9343, kind: "border" },
  { city: "Duluth", state: "MN", lat: 46.7867, lng: -92.1005, kind: "port" },
  { city: "Boise", state: "ID", lat: 43.615, lng: -116.2023, kind: "metro" },
  { city: "Billings", state: "MT", lat: 45.7833, lng: -108.5007, kind: "metro" },
  { city: "Cheyenne", state: "WY", lat: 41.14, lng: -104.8202, kind: "rail-intermodal" },
  { city: "Fargo", state: "ND", lat: 46.8772, lng: -96.7898, kind: "distribution" },
  { city: "Sioux Falls", state: "SD", lat: 43.546, lng: -96.7313, kind: "distribution" },
];

// Full state names for the regional fallback market name ("[Direction] [State]
// Market" uses the full name, e.g. "Eastern Kentucky Market").
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington DC",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// Approximate geographic center of each state — used only to decide which part
// of the state a city sits in for the regional fallback name. Precision isn't
// critical: the fallback is rare and always editable.
export const STATE_CENTERS: Record<string, CityCoord> = {
  AL: { lat: 32.8, lng: -86.8 }, AZ: { lat: 34.3, lng: -111.7 },
  AR: { lat: 34.8, lng: -92.4 }, CA: { lat: 37.2, lng: -119.5 },
  CO: { lat: 39.0, lng: -105.5 }, CT: { lat: 41.6, lng: -72.7 },
  DE: { lat: 39.0, lng: -75.5 }, FL: { lat: 28.6, lng: -82.4 },
  GA: { lat: 32.6, lng: -83.4 }, ID: { lat: 44.4, lng: -114.6 },
  IL: { lat: 40.0, lng: -89.2 }, IN: { lat: 39.9, lng: -86.3 },
  IA: { lat: 42.0, lng: -93.5 }, KS: { lat: 38.5, lng: -98.4 },
  KY: { lat: 37.5, lng: -85.3 }, LA: { lat: 31.1, lng: -92.0 },
  ME: { lat: 45.4, lng: -69.2 }, MD: { lat: 39.0, lng: -76.8 },
  MA: { lat: 42.3, lng: -71.8 }, MI: { lat: 44.3, lng: -85.4 },
  MN: { lat: 46.3, lng: -94.3 }, MS: { lat: 32.7, lng: -89.7 },
  MO: { lat: 38.4, lng: -92.5 }, MT: { lat: 47.0, lng: -109.6 },
  NE: { lat: 41.5, lng: -99.8 }, NV: { lat: 39.3, lng: -116.6 },
  NH: { lat: 43.7, lng: -71.6 }, NJ: { lat: 40.2, lng: -74.7 },
  NM: { lat: 34.4, lng: -106.1 }, NY: { lat: 42.9, lng: -75.5 },
  NC: { lat: 35.5, lng: -79.4 }, ND: { lat: 47.5, lng: -100.5 },
  OH: { lat: 40.3, lng: -82.8 }, OK: { lat: 35.6, lng: -97.5 },
  OR: { lat: 44.0, lng: -120.6 }, PA: { lat: 40.9, lng: -77.8 },
  RI: { lat: 41.7, lng: -71.6 }, SC: { lat: 33.9, lng: -80.9 },
  SD: { lat: 44.4, lng: -100.2 }, TN: { lat: 35.9, lng: -86.4 },
  TX: { lat: 31.5, lng: -99.3 }, UT: { lat: 39.3, lng: -111.7 },
  VT: { lat: 44.1, lng: -72.7 }, VA: { lat: 37.5, lng: -78.9 },
  WA: { lat: 47.4, lng: -120.5 }, WV: { lat: 38.6, lng: -80.6 },
  WI: { lat: 44.6, lng: -89.9 }, WY: { lat: 43.0, lng: -107.6 },
};

export const MARKET_RADIUS_MI = 75;

// Nearest seeded hub to a coordinate, within the market radius. Null if none.
export const nearestHub = (
  here: CityCoord,
): { hub: FreightHub; distanceMi: number } | null => {
  let best: { hub: FreightHub; distanceMi: number } | null = null;
  for (const hub of FREIGHT_HUBS) {
    const d = haversineMiles(here, { lat: hub.lat, lng: hub.lng });
    if (d > MARKET_RADIUS_MI) continue;
    if (!best || d < best.distanceMi) best = { hub, distanceMi: d };
  }
  return best;
};

export type Direction =
  | "Northern"
  | "Southern"
  | "Eastern"
  | "Western"
  | "Central";

// Which part of its state a city sits in, from the offset to the state center.
const CENTRAL_DEG = 0.7; // ~48 mi N/S; a rough "near the middle" band
export const regionalDirection = (
  here: CityCoord,
  state: string,
): Direction | null => {
  const center = STATE_CENTERS[String(state).trim().toUpperCase()];
  if (!center) return null;
  const dLat = here.lat - center.lat; // + = north
  const dLng = here.lng - center.lng; // + = east
  if (Math.abs(dLat) < CENTRAL_DEG && Math.abs(dLng) < CENTRAL_DEG) return "Central";
  if (Math.abs(dLat) >= Math.abs(dLng)) return dLat > 0 ? "Northern" : "Southern";
  return dLng > 0 ? "Eastern" : "Western";
};

// The regional fallback market name for a city with no hub within 75 mi:
// "[Direction] [State] Market" (e.g. "Western Texas Market"). Null if the state
// is unknown.
export const regionalMarketName = (
  here: CityCoord,
  state: string,
): string | null => {
  const dir = regionalDirection(here, state);
  const name = STATE_NAMES[String(state).trim().toUpperCase()];
  if (!dir || !name) return null;
  return `${dir} ${name} Market`;
};
