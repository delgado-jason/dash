import type { LucideIcon } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";

// Ray endpoints for the sunburst behind the medallion.
const RAYS: [number, number][] = [
  [50, 2], [83, 17], [98, 50], [83, 83], [50, 98], [17, 83], [2, 50], [17, 17],
  [67, 6], [94, 33], [94, 67], [67, 94], [33, 94], [6, 67], [6, 33], [33, 6],
];

const CONFETTI = [
  { left: "22%", color: "#e8940a", delay: ".1s" },
  { left: "38%", color: "#4ade80", delay: ".5s" },
  { left: "54%", color: "#f5b03a", delay: ".9s" },
  { left: "68%", color: "#60a5fa", delay: ".3s" },
  { left: "80%", color: "#e8940a", delay: ".7s" },
];

const kicker = (id: string): string =>
  id.startsWith("rank:")
    ? "RANK UP"
    : id.startsWith("mileclub:")
      ? "MILE CLUB"
      : id.startsWith("strong-season:")
        ? "STRONG SEASON"
        : "AWARD UNLOCKED";

// A rare, big win — takes over the screen with the card flying in, a shine
// sweep, a slow ray-burst, and confetti.
export const MarqueeAward = ({
  award,
  Icon,
  onDismiss,
}: {
  award: Award;
  Icon: LucideIcon;
  onDismiss: () => void;
}) => (
  <div
    className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
    style={{ background: "rgba(6,9,15,0.74)" }}
  >
    {CONFETTI.map((c, i) => (
      <span
        key={i}
        className="absolute rounded-[1px]"
        style={{
          left: c.left,
          top: "-10px",
          width: 7,
          height: 7,
          background: c.color,
          animation: `award-fall 2.4s linear ${c.delay} infinite`,
        }}
      />
    ))}
    <div
      className="relative w-[330px] max-w-[92vw] rounded-[18px] px-6 pt-5 pb-4 text-center overflow-hidden"
      style={{
        background: "#10151f",
        border: "2px solid #e8940a",
        animation: "award-pop .6s cubic-bezier(.2,.9,.25,1.2) both",
      }}
    >
      <div
        className="absolute top-0 h-full pointer-events-none"
        style={{
          left: "-60%",
          width: "45%",
          background: "rgba(245,176,58,.16)",
          transform: "skewX(-20deg)",
          animation: "award-shine 1.6s ease-in-out .5s infinite",
        }}
      />
      <svg
        className="absolute left-1/2 -ml-[75px] top-1.5"
        width="150"
        height="150"
        viewBox="0 0 100 100"
        style={{ animation: "award-spin 14s linear infinite", opacity: 0.5 }}
        aria-hidden="true"
      >
        <g stroke="#e8940a" strokeWidth="2.5">
          {RAYS.map((r, i) => (
            <line key={i} x1="50" y1="50" x2={r[0]} y2={r[1]} />
          ))}
        </g>
      </svg>
      <div
        className="relative mx-auto w-[78px] h-[78px] rounded-full flex items-center justify-center"
        style={{ background: "#3a2a0a", border: "3px solid #e8940a", color: "#f5b03a" }}
      >
        <Icon size={38} />
      </div>
      <div className="font-comic mt-3" style={{ color: "#f5b03a", letterSpacing: "3px", fontSize: 15 }}>
        ★ {kicker(award.id)} ★
      </div>
      <div className="font-comic mt-1" style={{ fontSize: 28, letterSpacing: "1px", lineHeight: 1 }}>
        {award.name.replace(/^Rank up — /, "")}
      </div>
      <div className="text-sm text-muted-text mt-2.5">{award.detail}</div>
      <button
        onClick={onDismiss}
        className="mt-4 font-comic cursor-pointer"
        style={{
          background: "#e8940a",
          color: "#10151f",
          border: "none",
          borderRadius: 9,
          padding: "9px 22px",
          fontSize: 15,
          letterSpacing: "1px",
        }}
      >
        LET'S ROLL
      </button>
    </div>
  </div>
);
