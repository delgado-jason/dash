// The forged rating readout: five punched pips. Earned pips glow amber; a
// warning grade (≤2) punches red; unrated renders ghost pips (dashed, empty)
// per the ghost rule — hardware you can see but haven't earned.

interface VendorPipsProps {
  rating: number | null | undefined;
  caption?: boolean; // the "N of 5" / "not yet rated" line under the pips
  align?: "start" | "end";
}

export const VendorPips = ({ rating, caption = true, align = "end" }: VendorPipsProps) => {
  const r = rating ?? null;
  const bad = r != null && r <= 2;
  return (
    <span className={`inline-flex flex-col gap-[3px] ${align === "end" ? "items-end" : "items-start"}`}>
      <span className="inline-flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => {
          const on = r != null && i <= r;
          if (r == null)
            return (
              <i key={i} className="w-[11px] h-[11px] rounded-[3px] border border-dashed border-hairline" />
            );
          return (
            <i
              key={i}
              className="w-[11px] h-[11px] rounded-[3px]"
              style={
                on
                  ? bad
                    ? {
                        background: "linear-gradient(180deg, color-mix(in srgb, var(--color-status-negative-text) 70%, transparent), var(--color-status-negative-text))",
                        border: "1px solid color-mix(in srgb, var(--color-status-negative-text) 60%, transparent)",
                      }
                    : {
                        background: "var(--color-amber)",
                        border: "1px solid color-mix(in srgb, var(--color-amber-hi) 60%, transparent)",
                        boxShadow: "0 0 8px color-mix(in srgb, var(--color-amber) 35%, transparent), inset 0 1px 0 color-mix(in srgb, var(--color-ink) 40%, transparent)",
                      }
                  : {
                      background: "var(--color-well)",
                      border: "1px solid var(--color-hairline)",
                      boxShadow: "var(--shadow-inset)",
                    }
              }
            />
          );
        })}
      </span>
      {caption && (
        <span className="font-condensed text-[12px] text-faint tracking-[.06em]">
          {r != null ? `${r} of 5` : "not yet rated"}
        </span>
      )}
    </span>
  );
};
