import { forwardRef, type HTMLAttributes } from "react";

export type PanelVariant = "default" | "panel" | "hero";

const VARIANT: Record<PanelVariant, string> = {
  default: "ds-panel--default", // lifted — the everyday card
  panel: "ds-panel--steel", // structural / industrial
  hero: "ds-panel--hero", // comic — for wins & highlights
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  interactive?: boolean; // hover-lift + press feedback
  noir?: boolean; // comic-noir texture: printed-ink frame + Ben-Day dot corner
}

// The layered surface primitive. One place for the app's card depth, so every
// panel reads as part of one system. Forwards a ref so ref'd containers (e.g.
// hover-tooltip measurement) can adopt it too.
export const Panel = forwardRef<HTMLDivElement, Props>(
  (
    { variant = "default", interactive = false, noir = false, className = "", children, ...rest },
    ref,
  ) => (
    <div
      ref={ref}
      className={`ds-panel ${VARIANT[variant]} ${
        interactive ? "ds-panel--interactive" : ""
      } ${noir ? "ds-panel--noir" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  ),
);
Panel.displayName = "Panel";
