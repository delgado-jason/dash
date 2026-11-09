// The calendar quarter a day falls in, UTC like every date in the app:
// Q1 Jan–Mar, Q2 Apr–Jun, Q3 Jul–Sep, Q4 Oct–Dec. `end` is exclusive.
export interface Quarter {
  start: Date;
  end: Date;
  label: string; // "Q4 2026"
}

export const quarterOf = (d: Date): Quarter => {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3);
  return {
    start: new Date(Date.UTC(y, q * 3, 1)),
    end: new Date(Date.UTC(y, q * 3 + 3, 1)),
    label: `Q${q + 1} ${y}`,
  };
};
