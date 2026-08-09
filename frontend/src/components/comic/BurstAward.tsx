import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { LucideIcon } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";
import { DUR, GSAP_EASE } from "@/theme/motion";

gsap.registerPlugin(useGSAP);

// A frequent re-earnable win as a corner toast — forged, not drawn: a record
// slides in as an engraved plate (the groove draws itself), a patch as a steel
// tag with a pip punching in. Click to dismiss early.
export const BurstAward = ({
  award,
  Icon,
  onDismiss,
}: {
  award: Award;
  Icon: LucideIcon;
  onDismiss: () => void;
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const isRecord = award.tier === "record";

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      gsap.from(el, {
        x: 48,
        autoAlpha: 0,
        duration: DUR.base,
        ease: GSAP_EASE.settle,
      });
      const groove = el.querySelector("[data-groove]");
      if (groove)
        gsap.from(groove, {
          scaleX: 0,
          transformOrigin: "left center",
          duration: DUR.slow,
          ease: GSAP_EASE.mech,
          delay: 0.25,
        });
      const pip = el.querySelector("[data-pip]");
      if (pip)
        gsap.from(pip, {
          scale: 2.6,
          autoAlpha: 0,
          duration: 0.3,
          ease: GSAP_EASE.slam,
          delay: 0.3,
        });
    },
    { scope: ref },
  );

  return (
    <button
      ref={ref}
      onClick={onDismiss}
      className="flex items-center gap-3 rounded-xl pl-3 pr-4 py-2.5 text-left w-[300px] max-w-[86vw]"
      style={{
        background: "linear-gradient(168deg,#323c52,#212a3c)",
        borderTop: "1px solid rgba(255,255,255,.11)",
        borderBottom: "2px solid rgba(0,0,0,.5)",
        boxShadow: "0 10px 26px rgba(0,0,0,.5)",
      }}
    >
      <span
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: "#090d15",
          boxShadow: "inset 0 2px 5px rgba(0,0,0,.6)",
          color: "#f5b03a",
        }}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className="block font-forge font-bold text-[14px] tracking-[.09em] uppercase"
            style={{ color: "#dfe6f2", textShadow: "0 -1px 0 rgba(0,0,0,.7)" }}
          >
            {award.name}
          </span>
          {!isRecord && (
            <span
              data-pip
              className="w-[9px] h-[9px] rounded-full shrink-0"
              style={{
                background:
                  "radial-gradient(circle at 40% 35%, #0a0e15 40%, #05070b)",
                boxShadow:
                  "inset 0 2px 3px rgba(0,0,0,1), inset 0 -1px 1px rgba(245,176,58,.4)",
              }}
            />
          )}
        </span>
        <span className="block text-xs truncate" style={{ color: "#8494ab" }}>
          {award.detail}
        </span>
        {isRecord && (
          <span
            data-groove
            className="block h-px mt-1.5"
            style={{
              background: "linear-gradient(90deg,#e8940a,transparent)",
              boxShadow: "0 0 6px rgba(232,148,10,.6)",
            }}
          />
        )}
      </span>
    </button>
  );
};
