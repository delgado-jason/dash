import type { RecapScope } from "@/lib/metrics/recap";

// Bronze → silver → gold. One source of truth for the prestige look so the recap
// CARD and the ceremony POP always match. Colors are theme tokens (var strings); the bronze and silver metals have no token and stay literal.
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
    cardBg: "var(--color-panel)",
  },
  quarter: {
    metal: "#aab4c4",
    inner: "var(--color-faint)",
    title: "var(--color-ink)",
    medalBg: "var(--color-plate-b)",
    medalInk: "var(--color-ink)",
    chipBg: "var(--color-plate-b)",
    chipBorder: "#cdd6e3",
    chipInk: "var(--color-ink)",
    kicker: "QUARTER RECAP",
    stars: 2,
    crown: false,
    laurels: true,
    banner: false,
    border: 3,
    cardBg: "var(--color-panel)",
  },
  year: {
    metal: "var(--color-amber-hi)",
    inner: "var(--color-amber-dark)",
    title: "var(--color-hot)",
    medalBg: "var(--color-canvas)",
    medalInk: "var(--color-amber-hi)",
    chipBg: "var(--color-status-aware-bg)",
    chipBorder: "var(--color-amber-hi)",
    chipInk: "var(--color-hot)",
    kicker: "GRAND FINALE",
    stars: 3,
    crown: true,
    laurels: true,
    banner: true,
    border: 3,
    cardBg: "var(--color-panel)",
  },
};

export const stars = (n: number): string => "★ ".repeat(n).trim();
