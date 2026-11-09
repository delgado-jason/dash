import type { HTMLAttributes } from "react";

// A sunk field: inputs, number wells, a bar track. Plain since the Redesign's
// phase B3 — the well ground with the one hairline, no inset shadow. It used to
// live beside the forged plate; the plate retired, the well stayed.
export const Well = ({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) => (
  <div className={`ds2-well ${className}`} {...rest} />
);
