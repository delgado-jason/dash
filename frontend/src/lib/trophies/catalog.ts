// The locked catalog of the Trophy Room — the major, once-in-a-career milestones.
// `kind` = how it's earned: manual (you mark it — the app can't detect it),
// auto (computed from data), capstone (Highway Legend, derived from the others).
// `promptIdea` seeds the AI art we generate + sign off on per trophy.
export type TrophyForm = "medallion" | "plaque" | "cup" | "belt" | "star";
export type TrophyKind = "manual" | "auto" | "capstone";

export interface TrophyDef {
  key: string;
  name: string;
  form: TrophyForm;
  kind: TrophyKind;
  blurb: string;
  promptIdea: string;
}

export const TROPHY_CATALOG: TrophyDef[] = [
  {
    key: "owner-operator",
    name: "Owner Operator",
    form: "medallion",
    kind: "manual",
    blurb: "The origin — you went out on your own.",
    promptIdea: "keys to your first rig; a lone flatbed pulling out of the yard at dawn",
  },
  {
    key: "own-authority",
    name: "Own Authority",
    form: "star",
    kind: "manual",
    blurb: "Your own MC/DOT — off the lease.",
    promptIdea: "your name on the door; an MC certificate sealed in gold",
  },
  {
    key: "free-and-clear",
    name: "Free & Clear",
    form: "belt",
    kind: "manual",
    blurb: "The truck note, paid off.",
    promptIdea: "a semi with a snapped chain; PAID stamped across the title",
  },
  {
    key: "trailer-paid-off",
    name: "Trailer Paid Off",
    form: "belt",
    kind: "manual",
    blurb: "The trailer, paid off.",
    promptIdea: "a flatbed trailer wrapped in a gold 'paid' ribbon",
  },
  {
    key: "second-driver",
    name: "Second Driver",
    form: "plaque",
    kind: "auto",
    blurb: "A second driver joins the outfit.",
    promptIdea: "two drivers shoulder to shoulder at the truck",
  },
  {
    key: "second-truck",
    name: "Second Truck",
    form: "plaque",
    kind: "auto",
    blurb: "A second truck in the fleet.",
    promptIdea: "two rigs parked side by side under the lights",
  },
  {
    key: "five-truck-fleet",
    name: "Five-Truck Fleet",
    form: "plaque",
    kind: "auto",
    blurb: "Five trucks rolling.",
    promptIdea: "a lineup of five rigs, headlights on",
  },
  {
    key: "million-mile-club",
    name: "Million Mile Club",
    form: "plaque",
    kind: "auto",
    blurb: "1,000,000 lifetime miles.",
    promptIdea: "an odometer rolling past 1,000,000 on a brass plaque",
  },
  {
    key: "one-million-hauled",
    name: "One Million Hauled",
    form: "cup",
    kind: "auto",
    blurb: "$1,000,000 gross hauled.",
    promptIdea: "a gold vault door with $1,000,000 across it",
  },
  {
    key: "highway-legend",
    name: "Highway Legend",
    form: "cup",
    kind: "capstone",
    blurb: "The capstone — own authority, truck free-and-clear, and the million miles.",
    promptIdea: "a chromed-out legend rig in golden-hour light, a halo of road behind it",
  },
];
