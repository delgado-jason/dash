import type { RecapScope } from "@/lib/metrics/recap";

// Bronze → silver → gold. One source of truth for the prestige look so the recap
// CARD and the ceremony POP always match. Colors are the dash comic palette.
export interface RecapTier {
  metal: string; // border + primary accent
  inner: string | null; // inner foil line (quarter/year)
  title: string; // big title text
  medalBg: string; // medallion disc bg
  medalInk: string; // medallion icon color
  chipBg: string;
  chipBorder: string;
  chipInk: string;
  kicker: string; // "MONTH RECAP" / "QUARTER RECAP" / "GRAND FINALE"
  stars: number; // rank pips: 1 / 2 / 3
  crown: boolean; // year only
  laurels: boolean; // quarter + year (flank the title)
  banner: boolean; // year only — the truck-avatar hero
  border: number; // border weight px
  cardBg: string;
}

export const RECAP_TIERS: Record<RecapScope, RecapTier> = {
  month: {
    metal: "#b3763f",
    inner: null,
    title: "#c9884a",
    medalBg: "#2a1d0e",
    medalInk: "#d9a05c",
    chipBg: "#2a1d0e",
    chipBorder: "#b3763f",
    chipInk: "#e7cfa8",
    kicker: "MONTH RECAP",
    stars: 1,
    crown: false,
    laurels: false,
    banner: false,
    border: 2,
    cardBg: "#10151f",
  },
  quarter: {
    metal: "#aab4c4",
    inner: "#5a6478",
    title: "#dfe6f0",
    medalBg: "#1a2130",
    medalInk: "#dfe6f0",
    chipBg: "#1a2130",
    chipBorder: "#cdd6e3",
    chipInk: "#dfe6f0",
    kicker: "QUARTER RECAP",
    stars: 2,
    crown: false,
    laurels: true,
    banner: false,
    border: 3,
    cardBg: "#10151f",
  },
  year: {
    metal: "#f5b03a",
    inner: "#7a5410",
    title: "#ffe08a",
    medalBg: "#0a0d13",
    medalInk: "#f5b03a",
    chipBg: "#3a2a0a",
    chipBorder: "#f5b03a",
    chipInk: "#ffe08a",
    kicker: "GRAND FINALE",
    stars: 3,
    crown: true,
    laurels: true,
    banner: true,
    border: 3,
    cardBg: "#120f08",
  },
};

export const stars = (n: number): string => "★ ".repeat(n).trim();
