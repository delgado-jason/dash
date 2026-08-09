import { AvatarFallback } from "@/components/fleet/AvatarFallback";

type Kind = "truck" | "driver" | "trailer";

// Foil frame by career-rank tier (0 Rookie → 4 Highway Legend). Higher rank =
// richer metal; the top tier goes holographic.
const FOIL = [
  { frame: "#586074", banner: "#1b202b", name: "#c3ccd9" }, // steel
  { frame: "#a97142", banner: "#241a10", name: "#e8c39a" }, // bronze
  { frame: "#9aa4b2", banner: "#1c2029", name: "#e9eef5" }, // silver
  { frame: "#caa24a", banner: "#241a06", name: "#f5d488" }, // gold
  {
    frame:
      "linear-gradient(135deg,#f5b03a,#4ade80,#3b82f6,#a855f7,#f87171,#f5b03a)",
    banner: "#141024",
    name: "#f4f7fb",
  }, // holographic
] as const;

export interface RigCardProps {
  kind: Kind;
  name: string;
  subtitle: string;
  rankName: string;
  rankIndex: number; // 0–4
  avatarUrl: string | null;
  specialty?: string | null;
  stats: { label: string; value: string }[];
}

export const RigCard = ({
  kind,
  name,
  subtitle,
  rankName,
  rankIndex,
  avatarUrl,
  specialty,
  stats,
}: RigCardProps) => {
  const foil = FOIL[Math.max(0, Math.min(FOIL.length - 1, rankIndex))];
  const stars = "★".repeat(rankIndex + 1) + "☆".repeat(FOIL.length - rankIndex - 1);
  return (
    <div
      style={{
        width: 260,
        borderRadius: 16,
        padding: 5,
        background: foil.frame,
        boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
      }}
    >
      <div
        style={{
          borderRadius: 12,
          background: "#10151f",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* foil sheen */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "-40%",
            width: "40%",
            height: "100%",
            background: "#fff",
            opacity: 0.05,
            transform: "skewX(-18deg)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            background: foil.banner,
          }}
        >
          <span
            className="font-forge font-bold"
            style={{ fontSize: 15, letterSpacing: 1.5, color: foil.name }}
          >
            {rankName}
          </span>
          <span style={{ color: "#f5b03a", fontSize: 11, letterSpacing: 1 }}>{stars}</span>
        </div>

        <div
          style={{
            height: 158,
            background: "#161d2b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            borderBottom: `2px solid ${typeof foil.frame === "string" && foil.frame.startsWith("linear") ? "#caa24a" : foil.frame}`,
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              crossOrigin="anonymous"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: 132, height: 132 }}>
              <AvatarFallback kind={kind} />
            </div>
          )}
          {specialty && (
            <span
              style={{
                position: "absolute",
                bottom: 6,
                right: 8,
                background: "#3a2a0a",
                border: "1px solid #e8940a",
                color: "#f5b03a",
                fontSize: 8,
                padding: "1px 6px",
                borderRadius: 99,
                letterSpacing: 0.5,
              }}
            >
              {specialty}
            </span>
          )}
        </div>

        <div style={{ padding: "10px 12px" }}>
          <div
            className="font-condensed"
            style={{ fontSize: 21, color: "#f4f7fb", lineHeight: 1, textTransform: "uppercase" }}
          >
            {name}
          </div>
          <div style={{ fontSize: 10, color: "#7d8ba3", marginTop: 2 }}>{subtitle}</div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}
          >
            {stats.map((s) => (
              <div key={s.label} style={{ background: "#141b28", borderRadius: 7, padding: "6px 8px" }}>
                <div style={{ fontSize: 8, color: "#7d8ba3", letterSpacing: 0.5 }}>{s.label}</div>
                <div className="font-forge font-bold" style={{ fontSize: 16, color: "#f5b03a" }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
