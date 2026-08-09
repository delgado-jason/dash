// The locked catalog of the Trophy Room — the major, once-in-a-career milestones.
// `kind` = how it's earned: manual (you mark it — the app can't detect it),
// auto (computed from data), capstone (Highway Legend, derived from the others).
// `promptIdea` seeds the AI art we generate + sign off on per trophy — kept as a
// wordless SYMBOL (no text/numbers, which image models mangle); the app draws all text.
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
    promptIdea:
      "a lone flatbed semi truck pulling out of an empty yard at first light, the long open road ahead",
  },
  {
    key: "own-authority",
    name: "Own Authority",
    form: "star",
    kind: "manual",
    blurb: "Your own MC/DOT — off the lease.",
    promptIdea:
      "a bold heraldic eagle spreading its wings over a gleaming shield badge, forged in gold and steel",
  },
  {
    key: "free-and-clear",
    name: "Free & Clear",
    form: "belt",
    kind: "manual",
    blurb: "The truck note, paid off.",
    promptIdea:
      "a heavy iron chain snapping apart in a shower of sparks across the grille of a proud semi truck",
  },
  {
    key: "trailer-paid-off",
    name: "Trailer Paid Off",
    form: "belt",
    kind: "manual",
    blurb: "The trailer, paid off.",
    promptIdea:
      "a heavy-duty steel flatbed semi-trailer built for a Class 8 truck — long drop-deck with wooden deck boards, tandem axles with dual wheels, winch tracks and chain tie-downs along the rail, fifth-wheel kingpin plate visible — a massive golden padlock bursting open with a broken shackle standing on the deck, warm amber light, no truck attached, no small utility trailer",
  },
  {
    key: "second-driver",
    name: "Second Driver",
    form: "plaque",
    kind: "auto",
    blurb: "A second driver joins the outfit.",
    promptIdea:
      "two rugged truck drivers clasping hands shoulder to shoulder in front of a rig, headlights glowing behind them",
  },
  {
    key: "second-truck",
    name: "Second Truck",
    form: "plaque",
    kind: "auto",
    blurb: "A second truck in the fleet.",
    promptIdea:
      "two heavy flatbed rigs parked nose to nose under the lot lights at night, chrome gleaming",
  },
  {
    key: "five-truck-fleet",
    name: "Five-Truck Fleet",
    form: "plaque",
    kind: "auto",
    blurb: "Five trucks rolling.",
    promptIdea:
      "a heroic low-angle lineup of five heavy rigs in a row, headlights blazing into the dark",
  },
  {
    key: "million-mile-club",
    name: "Million Mile Club",
    form: "plaque",
    kind: "auto",
    blurb: "1,000,000 lifetime miles.",
    promptIdea:
      "a lone highway stretching straight to a fiery sunset horizon, endless worn asphalt and centerline",
  },
  {
    key: "one-million-hauled",
    name: "One Million Hauled",
    form: "cup",
    kind: "auto",
    blurb: "$1,000,000 gross hauled.",
    promptIdea:
      "an oversize mountain of gleaming solid-gold ingots strapped down on a flatbed semi-trailer like a permitted heavy-haul load — heavy chains, ratchet binders and edge protectors over the gold, red oversize-load flags on the corners, low camera angle so the load towers like a monument",
  },
  {
    key: "highway-legend",
    name: "Highway Legend",
    form: "cup",
    kind: "capstone",
    blurb: "The capstone — own authority, truck free-and-clear, and the million miles.",
    promptIdea:
      "a fully custom long-nose American show semi truck in the style of a Peterbilt 389 or Kenworth W900 — long square hood, tall dual chrome exhaust stacks, full chrome front bumper and grille, drop visor, rows of glowing amber marker lights (chicken lights) outlining the cab, visor, and fenders, custom paint, show-truck stance at night in golden light with a halo of highway behind it — a semi tractor only, no motorcycle, no car",
  },
];
