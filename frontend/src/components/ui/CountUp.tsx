import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR, GSAP_EASE } from "@/theme/motion";

gsap.registerPlugin(useGSAP);

// Design System v2 — a number that rolls to its value on mount (and again
// whenever the value changes). Formatting stays the caller's job so money(),
// rpm() etc. keep owning display rules. Motion always plays (owner's
// decision, 2026-08-08).
export const CountUp = ({
  value,
  format,
  className = "",
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) => {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      const state = { v: 0 };
      gsap.to(state, {
        v: value,
        duration: DUR.slow,
        ease: GSAP_EASE.mech,
        onUpdate: () => {
          el.textContent = format(state.v);
        },
      });
    },
    { dependencies: [value] },
  );

  // Server/first paint shows the final value; the tween immediately takes over.
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
};
