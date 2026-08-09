import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Truck } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";
import type { RecapScope } from "@/lib/metrics/recap";
import { DUR, GSAP_EASE } from "@/theme/motion";

gsap.registerPlugin(useGSAP);

// A period closing its books — the season plaque, struck in the period's
// metal: bronze month, silver quarter, gold year. Same beats as every forge
// ceremony: strike in, engrave, roll on.
const PLAQUE: Record<
  RecapScope,
  { metal: string; hi: string; ink: string; kicker: string; w: number }
> = {
  month: {
    metal: "linear-gradient(160deg,#e8b083,#b5713a 55%,#6e401a)",
    hi: "#e8b083",
    ink: "#3a2008",
    kicker: "MONTH IN THE BOOKS",
    w: 310,
  },
  quarter: {
    metal: "linear-gradient(160deg,#eef2f8,#b9c4d4 55%,#6f7c92)",
    hi: "#cdd6e3",
    ink: "#2c3546",
    kicker: "QUARTER COMPLETE",
    w: 330,
  },
  year: {
    metal: "linear-gradient(160deg,#f8d97b,#dfa32c 55%,#8a5f10)",
    hi: "#f5b03a",
    ink: "#4a3305",
    kicker: "THE YEAR, STRUCK",
    w: 352,
  },
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
  const ref = useRef<HTMLDivElement>(null);
  const scope = award.scope ?? "month";
  const p = PLAQUE[scope];

  const open = () => {
    navigate("/recap", { state: { scope } });
    onDismiss();
  };

  useGSAP(
    () => {
      const q = gsap.utils.selector(ref);
      const tl = gsap.timeline();
      tl.from(ref.current, { autoAlpha: 0, duration: 0.3 })
        .from(q("[data-plaque]"), {
          scale: 1.6,
          autoAlpha: 0,
          duration: 0.4,
          ease: GSAP_EASE.slam,
          delay: 0.15,
        })
        .from(
          q("[data-v]"),
          {
            clipPath: "inset(0 100% 0 0)",
            duration: DUR.base,
            ease: GSAP_EASE.mech,
            stagger: 0.16,
          },
          "-=0.1",
        )
        .from(q("[data-roll]"), { autoAlpha: 0, duration: 0.3 }, "-=0.15");
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
      style={{ background: "rgba(4,6,10,.94)" }}
    >
      <div
        data-plaque
        className="relative rounded-[14px] px-6 pt-6 pb-5 text-center"
        style={{
          width: p.w,
          maxWidth: "92vw",
          background: "linear-gradient(178deg,#333d54,#1c2434)",
          border: "1px solid #465174",
          borderTop: "1px solid rgba(255,255,255,.18)",
          borderBottom: "3px solid rgba(0,0,0,.6)",
          boxShadow: "0 18px 44px rgba(0,0,0,.6)",
        }}
      >
        <div
          className="mx-auto rounded-full flex items-center justify-center overflow-hidden"
          style={{
            width: 74,
            height: 74,
            background: p.metal,
            color: p.ink,
            boxShadow:
              "0 4px 10px rgba(0,0,0,.5), inset 0 2px 2px rgba(255,255,255,.4), inset 0 -2px 4px rgba(0,0,0,.35)",
          }}
        >
          {truckAvatarUrl ? (
            <img src={truckAvatarUrl} alt="Your truck" className="w-full h-full object-cover" />
          ) : (
            <Truck size={32} />
          )}
        </div>
        <div
          data-v
          className="font-forge font-semibold text-[12px] tracking-[.24em] uppercase mt-4"
          style={{ color: p.hi }}
        >
          {p.kicker}
        </div>
        <div
          data-v
          className="font-forge font-bold text-[28px] tracking-[.08em] leading-none mt-1.5 uppercase"
          style={{ color: "#dfe6f2", textShadow: "0 -1px 0 rgba(0,0,0,.7)" }}
        >
          {award.name}
        </div>
        <div data-v className="text-[12.5px] text-dim mt-2.5">
          {award.detail}
        </div>
        <div
          className="h-px mt-4"
          style={{
            background: `linear-gradient(90deg, transparent, ${p.hi}, transparent)`,
            boxShadow: "0 0 8px rgba(232,148,10,.4)",
          }}
        />
        <button
          data-roll
          onClick={open}
          className="mt-4 font-forge font-semibold text-[13.5px] tracking-[.16em] rounded-lg px-6 py-2.5 cursor-pointer"
          style={{
            background: p.metal,
            color: p.ink,
            border: "none",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,.4)",
          }}
        >
          {scope === "year" ? "OPEN YOUR SEASON →" : "SEE YOUR RECAP →"}
        </button>
      </div>
    </div>
  );
};
