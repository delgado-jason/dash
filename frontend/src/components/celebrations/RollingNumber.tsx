import { useEffect, useState, type CSSProperties } from "react";
import { playSfx } from "@/lib/sfx";

// Users who ask for less motion get the value straight away — no odometer roll.
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// One digit as a 0–9 vertical strip, clipped to a single row. On mount (and on
// value change) it rolls up to its target, like a mechanical odometer wheel.
const Digit = ({ target, delay }: { target: number; delay: number }) => {
  const reduced = prefersReducedMotion();
  const [n, setN] = useState(() => (reduced ? target : 0));
  useEffect(() => {
    if (reduced) {
      setN(target);
      return;
    }
    const t = setTimeout(() => setN(target), delay);
    return () => clearTimeout(t);
  }, [target, delay, reduced]);
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
          transition: reduced
            ? "none"
            : "transform 0.9s cubic-bezier(0.2, 0.8, 0.2, 1)",
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

// A pre-formatted string (e.g. "$23,944.00", "39.8%") whose DIGITS roll up into
// place; every other char ($ , . %) renders static. The KPI cards use this —
// the value is already formatted, so nothing gets rounded away.
export const RollingValue = ({
  text,
  className,
  style,
}: {
  text: string;
  className?: string;
  style?: CSSProperties;
}) => {
  // A soft odometer tick as the digits roll — the debounce collapses sibling
  // values (the five KPIs firing together) into a single tick.
  useEffect(() => {
    playSfx("odometer");
  }, [text]);
  return (
    <span
      className={className}
      style={{ display: "inline-flex", fontVariantNumeric: "tabular-nums", ...style }}
    >
      {text.split("").map((c, i) =>
        /\d/.test(c) ? (
          <Digit key={i} target={Number(c)} delay={80 + i * 45} />
        ) : (
          <span key={i}>{c}</span>
        ),
      )}
    </span>
  );
};

// A number whose digits roll up into place — rounds to an integer, commas added.
// Reusable for the truck odometer.
export const RollingNumber = ({
  value,
  className,
  style,
}: {
  value: number;
  className?: string;
  style?: CSSProperties;
}) => (
  <RollingValue
    text={Math.round(value).toLocaleString("en-US")}
    className={className}
    style={style}
  />
);
