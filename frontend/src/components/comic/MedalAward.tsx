import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { LucideIcon } from "lucide-react";
import type { Award } from "@/lib/metrics/awards";
import { Coin, type CoinMetal } from "@/components/forge/Coin";
import { playSfx } from "@/lib/sfx";
import { DUR, GSAP_EASE } from "@/theme/motion";

gsap.registerPlugin(useGSAP);

const METALS: CoinMetal[] = ["bronze", "bronze", "silver", "gold", "platinum"];
const ROMAN = ["", "I", "II", "III", "IV"];

// A medal tier-up — the coin strike. The press drops, the coin cools from
// amber-hot to its metal, the verdict engraves. Confetti died with the comic.
export const MedalAward = ({
  award,
  Icon,
  onDismiss,
}: {
  award: Award;
  Icon: LucideIcon;
  onDismiss: () => void;
}) => {
  void Icon; // the coin face carries the tier now; icon kept for API parity
  const ref = useRef<HTMLDivElement>(null);
  const tier = Math.min(4, Math.max(1, award.medalTier ?? 3));

  useGSAP(
    () => {
      const q = gsap.utils.selector(ref);
      const tl = gsap.timeline();
      tl.from(ref.current, { autoAlpha: 0, duration: 0.3 })
        .from(q("[data-die]"), {
          y: -260,
          duration: 0.16,
          ease: GSAP_EASE.strikeIn,
          delay: 0.25,
        })
        .call(() => playSfx("stamp"))
        .to(q("[data-flash]"), { autoAlpha: 1, duration: 0.06 })
        .to(q("[data-stage]"), { x: 3, duration: 0.05, repeat: 5, yoyo: true })
        .to(q("[data-flash]"), { autoAlpha: 0, duration: 0.4 }, "<")
        .from(
          q("[data-coin]"),
          { autoAlpha: 0, duration: 0.15, filter: "brightness(2.2)" },
          "-=0.3",
        )
        .to(q("[data-die]"), {
          y: -260,
          duration: DUR.base,
          ease: GSAP_EASE.mech,
        })
        .to(
          q("[data-coin]"),
          { filter: "brightness(1)", duration: 1.2, ease: "power2.out" },
          "<",
        )
        .from(
          q("[data-v]"),
          {
            clipPath: "inset(0 100% 0 0)",
            duration: DUR.base,
            ease: GSAP_EASE.mech,
            stagger: 0.18,
          },
          "-=0.9",
        )
        .from(q("[data-roll]"), { autoAlpha: 0, duration: 0.35 }, "-=0.2");
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
      style={{ background: "rgba(4,6,10,.94)" }}
    >
      <div data-stage className="relative flex flex-col items-center w-full max-w-[440px]">
        <span className="font-forge font-semibold text-[11px] tracking-[.26em] uppercase text-faint">
          Struck at the press
        </span>
        <div
          data-die
          className="w-[230px] h-[42px] rounded-lg mt-5"
          style={{
            background: "linear-gradient(178deg,#3a4560,#222b3e)",
            borderTop: "1px solid rgba(255,255,255,.14)",
            borderBottom: "3px solid rgba(0,0,0,.6)",
          }}
        />
        <div
          data-flash
          className="absolute top-[104px] w-[220px] h-[220px] rounded-full pointer-events-none opacity-0"
          style={{
            background:
              "radial-gradient(circle, rgba(255,220,150,.85), rgba(232,148,10,.25) 45%, transparent 70%)",
          }}
        />
        <div data-coin className="mt-6" style={{ filter: "brightness(2.2)" }}>
          <Coin metal={METALS[tier]} size={116}>
            {ROMAN[tier]}
          </Coin>
        </div>
        <div className="text-center mt-7">
          <div
            data-v
            className="font-forge font-bold text-[34px] tracking-[.14em] text-ink leading-none"
          >
            MEDAL STRUCK
          </div>
          <div
            data-v
            className="font-forge font-semibold text-[17px] tracking-[.2em] text-amber-light mt-2 uppercase"
          >
            {award.name}
          </div>
          <div data-v className="text-[12px] text-dim mt-2">
            {award.detail} · the coin joins your rack
          </div>
        </div>
        <button
          data-roll
          onClick={onDismiss}
          className="mt-7 font-forge font-semibold text-[14px] tracking-[.16em] text-dim rounded-lg px-6 py-2.5 hover:text-amber-light"
          style={{
            background: "#090d15",
            border: "1px solid #1c2637",
            boxShadow: "inset 0 2px 4px rgba(0,0,0,.5)",
          }}
        >
          ROLL ON →
        </button>
      </div>
    </div>
  );
};
