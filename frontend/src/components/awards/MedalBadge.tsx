import type { Medal } from "@/lib/awards/medals";
import { awardIcon } from "./awardIcons";

// Metal by tier: bronze I, silver II, gold III+.
const METAL: Record<number, { face: string; edge: string; ink: string; r1: string; r2: string }> = {
  1: { face: "#c9884a", edge: "#6b3f1e", ink: "#3a230e", r1: "#c9884a", r2: "#e7cfa8" },
  2: { face: "#cdd6e3", edge: "#5a6478", ink: "#243040", r1: "#cdd6e3", r2: "#eef2f7" },
  3: { face: "#f5b03a", edge: "#7a5410", ink: "#3a2708", r1: "#f5b03a", r2: "#f5e6c8" },
};

// A real ribboned medallion. Worn on the card header (earned tiers only).
export const MedalBadge = ({ medal }: { medal: Medal }) => {
  const m = METAL[Math.min(3, Math.max(1, medal.tier))];
  const Icon = awardIcon(medal.icon);
  return (
    <div style={{ width: 46, textAlign: "center", position: "relative" }} title={`${medal.name} ${medal.tierLabel}`}>
      <div
        style={{
          width: 22,
          height: 15,
          margin: "0 auto",
          clipPath: "polygon(0 0,100% 0,100% 100%,50% 74%,0 100%)",
          background: `repeating-linear-gradient(90deg,${m.r1} 0 4px,${m.r2} 4px 8px)`,
        }}
      />
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: "50%",
          margin: "-4px auto 0",
          background: m.face,
          border: `2px solid ${m.edge}`,
          color: m.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          boxShadow: "inset 0 0 0 2px rgba(255,255,255,.22)",
        }}
      >
        <Icon size={18} />
        <span
          className="font-comic"
          style={{
            position: "absolute",
            bottom: -3,
            right: 1,
            fontSize: 9,
            lineHeight: 1,
            padding: "0 3px",
            borderRadius: 99,
            border: "1.5px solid #10151f",
            background: m.face,
            color: m.ink,
          }}
        >
          {medal.tierLabel}
        </span>
      </div>
      <div style={{ fontSize: 8.5, color: "#c8d0dc", marginTop: 4, lineHeight: 1.1 }}>{medal.name}</div>
    </div>
  );
};
