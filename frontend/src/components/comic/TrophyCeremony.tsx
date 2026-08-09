import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Trophy } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";
import { DUR, GSAP_EASE } from "@/theme/motion";

gsap.registerPlugin(useGSAP);

// The grandest celebration — a once-in-a-career monument, unveiled: the
// pedestal rises out of the dark, a headlight sweeps across the piece, the
// verdict engraves. Confetti died with the comic.
export const TrophyCeremony = ({
  award,
  onDismiss,
}: {
  award: Award;
  onDismiss: () => void;
}) => {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const open = () => {
    navigate("/trophy-room");
    onDismiss();
  };

  useGSAP(
    () => {
      const q = gsap.utils.selector(ref);
      const tl = gsap.timeline();
      tl.from(ref.current, { autoAlpha: 0, duration: 0.35 })
        .from(q("[data-monu]"), {
          y: 120,
          autoAlpha: 0,
          duration: DUR.slow,
          ease: GSAP_EASE.settle,
        })
        .fromTo(
          q("[data-beam]"),
          { xPercent: -130, autoAlpha: 0.9 },
          { xPercent: 130, autoAlpha: 0, duration: 1.1, ease: "power2.inOut" },
          "-=0.35",
        )
        .from(
          q("[data-v]"),
          {
            clipPath: "inset(0 100% 0 0)",
            duration: DUR.base,
            ease: GSAP_EASE.mech,
            stagger: 0.18,
          },
          "-=0.7",
        )
        .from(q("[data-roll]"), { autoAlpha: 0, duration: 0.35 }, "-=0.2");
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
      style={{ background: "rgba(4,6,10,.95)" }}
    >
      <div className="relative flex flex-col items-center w-full max-w-[420px] text-center">
        <span className="font-forge font-semibold text-[11px] tracking-[.26em] uppercase text-faint">
          Out of the mill
        </span>
        <div data-monu className="relative mt-5">
          <div
            className="relative rounded-[14px] p-3 overflow-hidden"
            style={{
              background: "linear-gradient(178deg,#333d54,#1c2434)",
              border: "1px solid #3c4762",
              borderTop: "1px solid rgba(255,255,255,.16)",
              borderBottom: "3px solid rgba(0,0,0,.6)",
              boxShadow:
                "0 18px 44px rgba(0,0,0,.6), 0 0 34px rgba(232,148,10,.22)",
            }}
          >
            <div
              className="w-[188px] h-[188px] rounded-[8px] overflow-hidden flex items-center justify-center"
              style={{ background: "#0a0d13" }}
            >
              {award.image ? (
                <img src={award.image} alt="" className="w-full h-full object-cover" />
              ) : (
                <Trophy size={72} style={{ color: "#f5b03a" }} />
              )}
            </div>
            <div
              data-beam
              className="absolute inset-y-0 w-[46%] pointer-events-none"
              style={{
                background:
                  "linear-gradient(100deg, transparent, rgba(255,231,180,.34), transparent)",
              }}
            />
          </div>
          {/* the pedestal */}
          <div
            className="mx-auto -mt-px w-[150px] h-[16px] rounded-b-[8px]"
            style={{
              background: "linear-gradient(178deg,#2b3448,#151c2a)",
              borderBottom: "3px solid rgba(0,0,0,.65)",
            }}
          />
        </div>
        <div
          data-v
          className="font-forge font-bold text-[30px] tracking-[.14em] text-ink leading-none mt-6"
        >
          MONUMENT UNVEILED
        </div>
        <div
          data-v
          className="font-forge font-semibold text-[18px] tracking-[.18em] text-amber-light mt-2 uppercase"
        >
          {award.name}
        </div>
        <div data-v className="text-[12.5px] text-dim mt-2 px-3">
          {award.detail}
        </div>
        <button
          data-roll
          onClick={open}
          className="mt-6 font-forge font-semibold text-[14px] tracking-[.16em] rounded-lg px-6 py-2.5 cursor-pointer"
          style={{
            background: "linear-gradient(178deg,#ffcf7a,#e8940a)",
            color: "#070a10",
            border: "none",
            boxShadow:
              "0 5px 14px rgba(232,148,10,.3), inset 0 1px 0 rgba(255,255,255,.5)",
          }}
        >
          SEE IT IN THE FORGE ROOM →
        </button>
      </div>
    </div>
  );
};
