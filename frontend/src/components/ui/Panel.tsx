import type { HTMLAttributes } from "react";

export type PanelVariant = "default" | "panel" | "hero";

const VARIANT: Record<PanelVariant, string> = {
  default: "ds-panel--default", // lifted — the everyday card
  panel: "ds-panel--steel", // structural / industrial
  hero: "ds-panel--hero", // comic — for wins & highlights
};

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: PanelVariant;
  interactive?: boolean; // hover-lift + press feedback
}

// The layered surface primitive. One place for the app's card depth, so every
// panel reads as part of one system.
export const Panel = ({
  variant = "default",
  interactive = false,
  className = "",
  children,
  ...rest
}: Props) => (
  <div
    className={`ds-panel ${VARIANT[variant]} ${
      interactive ? "ds-panel--interactive" : ""
    } ${className}`}
    {...rest}
  >
    {children}
  </div>
);
