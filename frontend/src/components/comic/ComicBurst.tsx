import type { ReactNode } from "react";

// The jagged comic impact-burst — the shared emblem shape behind award icons and
// sound-effect pops. Adult-comic: hard ink outline, flat fill, no gradient.
const POINTS =
  "340,150 288.9,173.8 321.2,220 265,215 270,271.2 223.8,238.9 200,290 " +
  "176.2,238.9 130,271.2 135,215 78.8,220 111.1,173.8 60,150 111.1,126.2 " +
  "78.8,80 135,85 130,28.8 176.2,61.1 200,10 223.8,61.1 270,28.8 265,85 " +
  "321.2,80 288.9,126.2";

export const ComicBurst = ({
  size = 44,
  fill = "#e8940a",
  stroke = "#0a0d13",
  strokeWidth = 10,
  children,
  className = "",
}: {
  size?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  children?: ReactNode;
  className?: string;
}) => (
  <span
    className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
    style={{ width: size, height: size }}
  >
    <svg
      viewBox="0 0 400 300"
      width={size}
      height={size}
      className="absolute inset-0"
      aria-hidden="true"
    >
      <polygon points={POINTS} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
    </svg>
    <span className="relative flex items-center justify-center" style={{ color: stroke }}>
      {children}
    </span>
  </span>
);
