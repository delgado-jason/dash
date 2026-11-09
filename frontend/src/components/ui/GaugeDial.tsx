// The gauge as a plain instrument (the Redesign, call B4, nodded 2026-11-08):
// a hairline arc, the reading drawn in amber, one needle. No glow and no
// sweep-in — the needle sits where the number is, in both looks. A gauge is
// how a trucker reads a number; the ceremony around it was the game.
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
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      {frac > 0 && (
        <path
          d={arc(0, Math.max(0.001, frac))}
          stroke="var(--color-chart-amber)"
          strokeWidth={6}
          fill="none"
          strokeLinecap="round"
        />
      )}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke="var(--color-ink)"
        strokeWidth={1.75}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={3} fill="var(--color-ink)" />
      <text x={10} y={72} fontSize={9} fill="var(--color-faint)" fontFamily="Barlow Condensed">
        {min}
      </text>
      <text x={W - 10} y={72} fontSize={9} fill="var(--color-faint)" fontFamily="Barlow Condensed" textAnchor="end">
        {max}
      </text>
    </svg>
  );
};
