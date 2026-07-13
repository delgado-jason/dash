import { useNavigate } from "react-router-dom";
import { Truck, Crown, CalendarCheck, Award as AwardIcon } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";
import type { RecapScope } from "@/lib/metrics/recap";
import { RECAP_TIERS } from "@/lib/constants/recapTiers";

// Confetti scales with the occasion: a couple of flecks for a month, a full
// multi-color burst for the year.
const CONFETTI: Record<RecapScope, { left: string; color: string; delay: string }[]> = {
  month: [
    { left: "30%", color: "#b3763f", delay: ".1s" },
    { left: "64%", color: "#c9884a", delay: ".5s" },
  ],
  quarter: [
    { left: "20%", color: "#aab4c4", delay: ".1s" },
    { left: "42%", color: "#cdd6e3", delay: ".5s" },
    { left: "60%", color: "#e8940a", delay: ".3s" },
    { left: "80%", color: "#cdd6e3", delay: ".7s" },
  ],
  year: [
    { left: "16%", color: "#f5b03a", delay: ".1s" },
    { left: "30%", color: "#4ade80", delay: ".5s" },
    { left: "46%", color: "#60a5fa", delay: ".9s" },
    { left: "62%", color: "#f5b03a", delay: ".3s" },
    { left: "78%", color: "#e8940a", delay: ".7s" },
    { left: "90%", color: "#4ade80", delay: ".2s" },
  ],
};

const POP_KICKER: Record<RecapScope, string> = {
  month: "MONTH IN THE BOOKS",
  quarter: "QUARTER COMPLETE",
  year: "GRAND FINALE",
};

const SIZE: Record<RecapScope, { card: number; medal: number; title: number }> = {
  month: { card: 300, medal: 64, title: 26 },
  quarter: { card: 322, medal: 74, title: 30 },
  year: { card: 344, medal: 84, title: 34 },
};

export const RecapCeremony = ({
  award,
  truckAvatarUrl,
  onDismiss,
}: {
  award: Award;
  truckAvatarUrl?: string | null;
  onDismiss: () => void;
}) => {
  const navigate = useNavigate();
  const scope = award.scope ?? "month";
  const t = RECAP_TIERS[scope];
  const s = SIZE[scope];

  const open = () => {
    navigate("/recap", { state: { scope } });
    onDismiss();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
      style={{ background: "rgba(6,9,15,0.78)" }}
    >
      {CONFETTI[scope].map((c, i) => (
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
        className="relative rounded-[18px] px-6 pt-5 pb-4 text-center overflow-hidden"
        style={{
          width: s.card,
          maxWidth: "92vw",
          background: t.cardBg,
          border: `${t.border}px solid ${t.metal}`,
          boxShadow: t.inner ? `inset 0 0 0 2px ${t.inner}` : undefined,
          animation: "award-pop .6s cubic-bezier(.2,.9,.25,1.2) both",
        }}
      >
        {t.crown && (
          <div className="mb-1">
            <Crown size={22} style={{ color: t.metal }} />
          </div>
        )}
        <div className="font-comic tracking-[3px]" style={{ color: t.title, fontSize: 14 }}>
          {"★ ".repeat(t.stars).trim()}
        </div>

        <div
          className="relative mx-auto mt-2 rounded-full flex items-center justify-center overflow-hidden"
          style={{ width: s.medal, height: s.medal, background: t.medalBg, border: `3px solid ${t.metal}`, color: t.medalInk }}
        >
          {t.banner && truckAvatarUrl ? (
            <img src={truckAvatarUrl} alt="Your truck" className="w-full h-full object-cover" />
          ) : t.banner ? (
            <Truck size={s.medal * 0.42} />
          ) : scope === "quarter" ? (
            <AwardIcon size={s.medal * 0.5} />
          ) : (
            <CalendarCheck size={s.medal * 0.42} />
          )}
        </div>

        <div className="font-comic tracking-[2px] mt-2.5" style={{ color: t.title, fontSize: 12 }}>
          {POP_KICKER[scope]}
        </div>
        <div className="font-comic leading-none mt-0.5" style={{ color: t.title, fontSize: s.title }}>
          {award.name}
        </div>
        <div className="text-sm text-muted-text mt-2">{award.detail}</div>

        <button
          onClick={open}
          className="mt-4 font-comic cursor-pointer"
          style={{
            background: t.metal,
            color: "#10151f",
            border: "none",
            borderRadius: 9,
            padding: "9px 22px",
            fontSize: 14,
            letterSpacing: "1px",
          }}
        >
          {scope === "year" ? "OPEN YOUR SEASON" : "SEE YOUR RECAP"}
        </button>
      </div>
    </div>
  );
};
