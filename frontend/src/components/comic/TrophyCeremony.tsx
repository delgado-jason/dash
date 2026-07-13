import { useNavigate } from "react-router-dom";
import { Trophy, Crown } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";

// The grandest celebration — a once-in-a-career Hall trophy. Full gold, a confetti
// storm, and the approved AI art front and center; its button opens the Hall.
const CONFETTI = [
  { left: "12%", color: "#f5b03a", delay: ".1s" },
  { left: "26%", color: "#4ade80", delay: ".5s" },
  { left: "40%", color: "#60a5fa", delay: ".9s" },
  { left: "56%", color: "#f5b03a", delay: ".3s" },
  { left: "70%", color: "#e8940a", delay: ".7s" },
  { left: "84%", color: "#4ade80", delay: ".2s" },
  { left: "92%", color: "#60a5fa", delay: ".6s" },
];

export const TrophyCeremony = ({
  award,
  onDismiss,
}: {
  award: Award;
  onDismiss: () => void;
}) => {
  const navigate = useNavigate();
  const open = () => {
    navigate("/trophy-room");
    onDismiss();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
      style={{ background: "rgba(6,9,15,0.82)" }}
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
        className="relative rounded-[20px] px-6 pt-5 pb-5 text-center overflow-hidden"
        style={{
          width: 360,
          maxWidth: "92vw",
          background: "#120f08",
          border: "3px solid #f5b03a",
          boxShadow: "inset 0 0 0 2px #7a5410",
          animation: "award-pop .6s cubic-bezier(.2,.9,.25,1.2) both",
        }}
      >
        <div className="mb-1">
          <Crown size={24} style={{ color: "#ffd873" }} />
        </div>
        <div className="font-comic tracking-[3px]" style={{ color: "#ffd873", fontSize: 15 }}>
          ★ ★ ★
        </div>
        <div
          className="mx-auto mt-3 rounded-2xl overflow-hidden flex items-center justify-center"
          style={{ width: 168, height: 168, background: "#0a0d13", border: "3px solid #f5b03a" }}
        >
          {award.image ? (
            <img src={award.image} alt="" className="w-full h-full object-cover" />
          ) : (
            <Trophy size={72} style={{ color: "#f5b03a" }} />
          )}
        </div>
        <div className="font-comic tracking-[3px] mt-3" style={{ color: "#ffd873", fontSize: 13 }}>
          TROPHY UNLOCKED
        </div>
        <div className="font-comic leading-none mt-1" style={{ color: "#ffe08a", fontSize: 30 }}>
          {award.name}
        </div>
        <div className="text-sm text-muted-text mt-2 px-2">{award.detail}</div>
        <button
          onClick={open}
          className="mt-4 font-comic cursor-pointer"
          style={{
            background: "#f5b03a",
            color: "#3a2708",
            border: "none",
            borderRadius: 9,
            padding: "9px 22px",
            fontSize: 14,
            letterSpacing: "1px",
          }}
        >
          VISIT THE TROPHY ROOM
        </button>
      </div>
    </div>
  );
};
