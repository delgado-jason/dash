import { useEffect, useState, type CSSProperties } from "react";

// One digit as a 0–9 vertical strip, clipped to a single row. On mount (and on
// value change) it rolls up to its target, like a mechanical odometer wheel.
const Digit = ({ target, delay }: { target: number; delay: number }) => {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setN(target), delay);
    return () => clearTimeout(t);
  }, [target, delay]);
  return (
    <span
      style={{
        display: "inline-block",
        height: "1em",
        overflow: "hidden",
        verticalAlign: "bottom",
      }}
    >
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          transform: `translateY(-${n}em)`,
          transition: "transform 0.9s cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        {Array.from({ length: 10 }, (_, k) => (
          <span key={k} style={{ height: "1em", lineHeight: "1em" }}>
            {k}
          </span>
        ))}
      </span>
    </span>
  );
};

// A number whose digits roll up into place. Commas/other chars render static.
// Reusable for the truck odometer and big KPI numbers.
export const RollingNumber = ({
  value,
  className,
  style,
}: {
  value: number;
  className?: string;
  style?: CSSProperties;
}) => {
  const chars = Math.round(value).toLocaleString("en-US").split("");
  return (
    <span
      className={className}
      style={{ display: "inline-flex", fontVariantNumeric: "tabular-nums", ...style }}
    >
      {chars.map((c, i) =>
        /\d/.test(c) ? (
          <Digit key={i} target={Number(c)} delay={80 + i * 45} />
        ) : (
          <span key={i}>{c}</span>
        ),
      )}
    </span>
  );
};
