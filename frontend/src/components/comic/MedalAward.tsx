import type { LucideIcon } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";

// Metal by tier: bronze I, silver II, gold III+.
const METAL: Record<number, { face: string; edge: string; ink: string; r1: string; r2: string }> = {
  1: { face: "#c9884a", edge: "#6b3f1e", ink: "#3a230e", r1: "#c9884a", r2: "#e7cfa8" },
  2: { face: "#cdd6e3", edge: "#5a6478", ink: "#243040", r1: "#cdd6e3", r2: "#eef2f7" },
  3: { face: "#f5b03a", edge: "#7a5410", ink: "#3a2708", r1: "#f5b03a", r2: "#f5e6c8" },
};

const CONFETTI = [
  { left: "20%", color: "#e8940a", delay: ".1s" },
  { left: "40%", color: "#4ade80", delay: ".5s" },
  { left: "60%", color: "#f5b03a", delay: ".9s" },
  { left: "80%", color: "#60a5fa", delay: ".3s" },
];

// A medal tier-up — a screen takeover with the ribboned medallion in its metal.
export const MedalAward = ({
  award,
  Icon,
  onDismiss,
}: {
  award: Award;
  Icon: LucideIcon;
  onDismiss: () => void;
}) => {
  const m = METAL[Math.min(3, Math.max(1, award.medalTier ?? 3))];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden" style={{ background: "rgba(6,9,15,0.76)" }}>
      {CONFETTI.map((c, i) => (
        <span
          key={i}
          className="absolute rounded-[1px]"
          style={{ left: c.left, top: "-10px", width: 7, height: 7, background: c.color, animation: `award-fall 2.4s linear ${c.delay} infinite` }}
        />
      ))}
      <div
        className="relative w-[320px] max-w-[92vw] rounded-[18px] px-6 pt-5 pb-4 text-center"
        style={{ background: "#10151f", border: `2px solid ${m.face}`, animation: "award-pop .6s cubic-bezier(.2,.9,.25,1.2) both" }}
      >
        <div
          style={{
            width: 30,
            height: 20,
            margin: "0 auto",
            clipPath: "polygon(0 0,100% 0,100% 100%,50% 74%,0 100%)",
            background: `repeating-linear-gradient(90deg,${m.r1} 0 5px,${m.r2} 5px 10px)`,
          }}
        />
        <div
          className="mx-auto -mt-1.5 rounded-full flex items-center justify-center"
          style={{ width: 76, height: 76, background: m.face, border: `3px solid ${m.edge}`, color: m.ink, boxShadow: "inset 0 0 0 3px rgba(255,255,255,.22)" }}
        >
          <Icon size={36} />
        </div>
        <div className="font-comic mt-3" style={{ color: m.face, letterSpacing: "3px", fontSize: 14 }}>
          ★ MEDAL UNLOCKED ★
        </div>
        <div className="font-comic mt-1" style={{ fontSize: 26, letterSpacing: "1px", lineHeight: 1 }}>
          {award.name}
        </div>
        <div className="text-sm text-muted-text mt-2.5">{award.detail}</div>
        <button
          onClick={onDismiss}
          className="mt-4 font-comic cursor-pointer"
          style={{ background: m.face, color: m.ink, border: "none", borderRadius: 9, padding: "9px 22px", fontSize: 15, letterSpacing: "1px" }}
        >
          LET'S ROLL
        </button>
      </div>
    </div>
  );
};
