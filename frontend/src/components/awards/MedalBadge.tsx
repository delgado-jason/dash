import type { Medal } from "@/lib/awards/medals";
import { Coin, type CoinMetal } from "@/components/forge/Coin";

const METALS: CoinMetal[] = ["bronze", "bronze", "silver", "gold", "platinum"];

// A struck coin worn on the card header (earned tiers only) — tier picks the
// metal, bronze through the platinum foil.
export const MedalBadge = ({ medal }: { medal: Medal }) => (
  <div
    style={{ width: 46, textAlign: "center" }}
    title={`${medal.name} ${medal.tierLabel}`}
  >
    <Coin metal={METALS[Math.min(medal.tier, 4)]} size={36}>
      {medal.tierLabel}
    </Coin>
    <div style={{ fontSize: 8.5, color: "#c8d0dc", marginTop: 4, lineHeight: 1.1 }}>
      {medal.name}
    </div>
  </div>
);
