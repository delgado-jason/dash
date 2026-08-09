import { useMemo, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DUR, GSAP_EASE } from "@/theme/motion";

gsap.registerPlugin(useGSAP);

// Design System v2 — the speedometer (Jason's ask, 2026-08-09): a semicircle
// instrument with an amber arc and a glowing needle, straight off the Night
// Cab mockup. The needle sweeps in on mount; motion always plays.
export const GaugeDial = ({
  value,
  min,
  max,
  size = 116,
}: {
  value: number;
  min: number;
  max: number;
  size?: number;
}) => {
  const arcRef = useRef<SVGPathElement>(null);
  const needleRef = useRef<SVGLineElement>(null);

  const frac = Math.max(0, Math.min(1, (value - min) / Math.max(0.0001, max - min)));
  const W = 120;
  const H = 74;
  const cx = 60;
  const cy = 64;
  const r = 48;
  const pt = (a: number): [number, number] => [
    cx + r * Math.cos(Math.PI * (1 - a)),
    cy - r * Math.sin(Math.PI * (1 - a)),
  ];
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0);
    const [x1, y1] = pt(a1);
    return `M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  const [nx, ny] = pt(frac);
  const arcLen = useMemo(() => Math.PI * r * frac, [frac]);

  useGSAP(
    () => {
      const a = arcRef.current;
      const n = needleRef.current;
      if (!a || !n) return;
      const total = a.getTotalLength();
      a.style.strokeDasharray = String(total);
      gsap.fromTo(
        a,
        { strokeDashoffset: total },
        { strokeDashoffset: 0, duration: DUR.slow, ease: GSAP_EASE.mech },
      );
      // Needle pivots at the hub — sweep from the left stop to the reading.
      gsap.fromTo(
        n,
        { rotation: -frac * 180, svgOrigin: `${cx} ${cy}` },
        {
          rotation: 0,
          duration: DUR.slow,
          ease: GSAP_EASE.mech,
        },
      );
    },
    { dependencies: [frac, arcLen] },
  );

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={(size * H) / W}
      aria-hidden="true"
    >
      <path
        d={arc(0, 1)}
        stroke="var(--color-hairline)"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
      />
      <path
        ref={arcRef}
        d={arc(0, Math.max(0.001, frac))}
        stroke="var(--color-chart-amber)"
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
      />
      <line
        ref={needleRef}
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke="var(--color-amber-hi)"
        strokeWidth={2}
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 4px rgba(245,176,58,.7))" }}
      />
      <circle cx={cx} cy={cy} r={3.5} fill="var(--color-amber-hi)" />
      <text x={10} y={72} fontSize={9} fill="var(--color-faint)" fontFamily="Barlow Condensed">
        {min}
      </text>
      <text x={W - 10} y={72} fontSize={9} fill="var(--color-faint)" fontFamily="Barlow Condensed" textAnchor="end">
        {max}
      </text>
    </svg>
  );
};
