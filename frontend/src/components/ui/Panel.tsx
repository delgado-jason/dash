import { forwardRef, type HTMLAttributes } from "react";

interface Props extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean; // hover-lift + press feedback
}

// The one surface (the Redesign, call B2): a flat panel on the canvas with one
// hairline. The steel, hero and noir variants retired with phase B3. Forwards a
// ref so ref'd containers (e.g. hover-tooltip measurement) can adopt it too.
export const Panel = forwardRef<HTMLDivElement, Props>(
  ({ interactive = false, className = "", children, ...rest }, ref) => (
    <div
      ref={ref}
      className={`ds-panel ds-panel--default ${interactive ? "ds-panel--interactive" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  ),
);
Panel.displayName = "Panel";
