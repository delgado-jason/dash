interface Props {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

// A tiny trend line for KPI cards — a light area under a stroked line. Renders
// nothing with fewer than two points, so callers can pass it unconditionally.
export const Sparkline = ({
  data,
  color = "#60a5fa",
  width = 64,
  height = 20,
}: Props) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => height - 2 - ((v - min) / range) * (height - 4);
  const line = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} className="block" aria-hidden="true">
      <polygon points={`${line} ${width},${height} 0,${height}`} fill={color} opacity={0.12} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};
