import type { Patch } from "@/lib/awards/patches";
import { awardIcon } from "./awardIcons";

const PatchEmblem = ({ p }: { p: Patch }) => {
  const earned = p.count > 0;
  const blue = !!p.operational; // operation-specific feats read blue vs amber
  const Icon = awardIcon(p.icon);
  return (
    <div style={{ width: 96, textAlign: "center", position: "relative", opacity: earned ? 1 : 0.5 }}>
      <div
        style={{
          width: 70,
          height: 70,
          borderRadius: "50%",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: earned ? (blue ? "#0f1d33" : "#2a1e0e") : "#141a26",
          border: `3px solid ${earned ? (blue ? "#3b82f6" : "#e8940a") : "#2a3550"}`,
        }}
      >
        <Icon size={28} style={{ color: earned ? (blue ? "#60a5fa" : "#f5b03a") : "#5b6b82" }} />
      </div>
      {earned && (
        <span
          className="font-forge font-bold"
          style={{
            position: "absolute",
            top: -3,
            right: 12,
            background: blue ? "#3b82f6" : "#e8940a",
            color: blue ? "#08111f" : "#120f08",
            borderRadius: 99,
            fontSize: 11,
            padding: "0 6px",
            border: "2px solid #10151f",
          }}
        >
          ×{p.count}
        </span>
      )}
      <div style={{ fontSize: 10.5, color: earned ? "#c8d0dc" : "#7a869a", marginTop: 5, lineHeight: 1.15 }}>
        {p.name}
      </div>
      <div style={{ fontSize: 8.5, color: "#9daabb" }}>{p.hint}</div>
    </div>
  );
};

// The patch board — hard, stackable feats. Earned (lit, with ×count) sort ahead of
// locked (grayed, showing what it takes). Reusable for driver / truck / trailer.
export const PatchBoard = ({ patches }: { patches: Patch[] }) => {
  const sorted = [...patches].sort(
    (a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || b.count - a.count,
  );
  return (
    <div className="mt-6">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-forge font-bold text-lg" style={{ color: "#f5b03a" }}>
          PATCHES
        </span>
        <span className="text-[11px] text-muted-text">hard to earn · stack a ×count each time</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {sorted.map((p) => (
          <PatchEmblem key={p.key} p={p} />
        ))}
      </div>
    </div>
  );
};
