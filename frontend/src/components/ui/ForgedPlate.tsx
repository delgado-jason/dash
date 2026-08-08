import { useRef, type HTMLAttributes, type MouseEvent } from "react";

// Design System v2 — the machined reserve surface ("forged = chase").
// At most one per view, spent only on surfaces the user is chasing or has
// won: pace targets, rank, net. `tilt` adds the cursor physicality from the
// approved mockups (pointer devices only — touch never tilts). Motion
// always plays: no reduced-motion gate, by owner's decision (2026-08-08).
interface Props extends HTMLAttributes<HTMLDivElement> {
  chamfer?: boolean; // cut the top-right corner (hero plates)
  amberEdge?: boolean; // amber side rails; default on
  tilt?: boolean; // cursor tilt + settle on leave
}

const canHover = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(hover: hover)").matches;

export const ForgedPlate = ({
  chamfer = false,
  amberEdge = true,
  tilt = false,
  className = "",
  onMouseMove,
  onMouseLeave,
  children,
  ...rest
}: Props) => {
  const ref = useRef<HTMLDivElement>(null);

  const handleMove = (e: MouseEvent<HTMLDivElement>) => {
    onMouseMove?.(e);
    const el = ref.current;
    if (!tilt || !el || !canHover()) return;
    const r = el.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1100px) rotateX(${(-ny * 2.2).toFixed(2)}deg) rotateY(${(nx * 2.8).toFixed(2)}deg)`;
  };

  const handleLeave = (e: MouseEvent<HTMLDivElement>) => {
    onMouseLeave?.(e);
    const el = ref.current;
    if (!tilt || !el) return;
    el.style.transition = "transform var(--t-base) var(--ease-settle)";
    el.style.transform = "";
    window.setTimeout(() => {
      if (el) el.style.transition = "";
    }, 520);
  };

  return (
    <div
      ref={ref}
      className={`ds2-forged ${amberEdge ? "ds2-forged--amber" : ""} ${
        chamfer ? "ds2-forged--chamfer" : ""
      } ${className}`}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      {...rest}
    >
      {children}
    </div>
  );
};

// The inset cavity — carved below any tier: inputs, number wells, stages.
export const Well = ({
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement>) => (
  <div className={`ds2-well ${className}`} {...rest} />
);
