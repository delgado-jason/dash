import type { ReactNode } from "react";

// The Forge — a struck challenge coin: radial metal, reeded edge, engraved
// face. First minted for the agent trophy case (S10); the driver card and
// ceremonies inherit it.
export type CoinMetal = "gold" | "silver" | "bronze";

const METAL: Record<CoinMetal, { bg: string; ink: string }> = {
  gold: {
    bg: "radial-gradient(circle at 35% 28%, #f8d97b, #dfa32c 55%, #8a5f10)",
    ink: "#4a3305",
  },
  silver: {
    bg: "radial-gradient(circle at 35% 28%, #eef2f8, #b9c4d4 55%, #6f7c92)",
    ink: "#2c3546",
  },
  bronze: {
    bg: "radial-gradient(circle at 35% 28%, #e8b083, #b5713a 55%, #6e401a)",
    ink: "#3a2008",
  },
};

export const Coin = ({
  metal,
  size = 46,
  className = "",
  children,
}: {
  metal: CoinMetal;
  size?: number;
  className?: string;
  children?: ReactNode; // the engraved face — initials, numeral, tiny label
}) => {
  const m = METAL[metal];
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-full font-forge font-bold select-none ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.3),
        background: m.bg,
        color: m.ink,
        boxShadow:
          "0 3px 8px rgba(0,0,0,.5), inset 0 2px 2px rgba(255,255,255,.35), inset 0 -2px 4px rgba(0,0,0,.35)",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "repeating-conic-gradient(rgba(0,0,0,.3) 0 3deg, transparent 3deg 7deg)",
          WebkitMask: "radial-gradient(circle, transparent 60%, #000 61%)",
          mask: "radial-gradient(circle, transparent 60%, #000 61%)",
        }}
      />
      <span className="relative">{children}</span>
    </span>
  );
};
