import type { GrindPatch } from "@/lib/awards/dispatcherAwards";
import { awardIcon } from "./awardIcons";

// The grind board — dispatcher patches that climb toward milestones. Earned
// (lit, amber, with its badge + progress) sort ahead of locked (grayed).
const Emblem = ({ p }: { p: GrindPatch }) => {
  const Icon = awardIcon(p.icon);
  return (
    <div style={{ width: 96, textAlign: "center", position: "relative", opacity: p.earned ? 1 : 0.5 }}>
      <div
        style={{
          width: 70,
          height: 70,
          borderRadius: "50%",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: p.earned ? "#2a1e0e" : "#141a26",
          border: `3px solid ${p.earned ? "#e8940a" : "#2a3550"}`,
        }}
      >
        <Icon size={28} style={{ color: p.earned ? "#f5b03a" : "#5b6b82" }} />
      </div>
      {p.earned && (
        <span
          className="font-comic"
          style={{
            position: "absolute",
            top: -3,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#e8940a",
            color: "#120f08",
            borderRadius: 99,
            fontSize: 11,
            padding: "0 7px",
            border: "2px solid #10151f",
            whiteSpace: "nowrap",
          }}
        >
          {p.badge}
        </span>
      )}
      <div style={{ fontSize: 10.5, color: p.earned ? "#c8d0dc" : "#7a869a", marginTop: 6, lineHeight: 1.15 }}>
        {p.name}
      </div>
      <div style={{ fontSize: 8.5, color: "#9daabb" }}>{p.hint}</div>
      {p.earned && p.progress < 1 && (
        <div style={{ height: 3, borderRadius: 2, background: "#232c3f", marginTop: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${p.progress * 100}%`, background: "#e8940a" }} />
        </div>
      )}
    </div>
  );
};

export const DispatcherPatchBoard = ({ patches }: { patches: GrindPatch[] }) => {
  const sorted = [...patches].sort(
    (a, b) => (b.earned ? 1 : 0) - (a.earned ? 1 : 0) || b.reached - a.reached,
  );
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-comic text-lg" style={{ color: "#f5b03a" }}>
          PATCHES
        </span>
        <span className="text-[11px] text-muted-text">the grind · they climb as she books</span>
      </div>
      <div className="flex gap-3 flex-wrap">
        {sorted.map((p) => (
          <Emblem key={p.key} p={p} />
        ))}
      </div>
    </div>
  );
};
