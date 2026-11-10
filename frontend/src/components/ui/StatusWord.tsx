import type { LoadStatusWord } from "@/lib/loads/loadStatusWord";

// A status as a plain word in its meaning's colour (the Redesign, phase B3: the
// die-pressed stamp retired). Good is green, bad is red, informational is blue.
const TONE: Record<LoadStatusWord, string> = {
  paid: "text-status-info-text",
  delivered: "text-status-positive-text",
  cancelled: "text-status-negative-text",
  tonu: "text-status-negative-text",
};

export const StatusWord = ({
  value,
  size = "md",
  className = "",
}: {
  value: LoadStatusWord | null;
  size?: "sm" | "md";
  className?: string;
}) => {
  if (!value) return null;
  return (
    <span
      className={`inline-block font-condensed font-semibold uppercase tracking-[.1em] ${size === "md" ? "text-[15px]" : "text-[12.5px]"} ${TONE[value]} ${className}`}
    >
      {value}
    </span>
  );
};
