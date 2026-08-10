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
                        background: "linear-gradient(180deg, #ff8a8a, #e05252)",
                        border: "1px solid rgba(224,82,82,.6)",
                      }
                    : {
                        background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                        border: "1px solid rgba(245,176,58,.6)",
                        boxShadow: "0 0 8px rgba(232,148,10,.35), inset 0 1px 0 rgba(255,255,255,.4)",
                      }
                  : {
                      background: "var(--color-well)",
                      border: "1px solid var(--color-hairline)",
                      boxShadow: "inset 0 2px 3px rgba(0,0,0,.6)",
                    }
              }
            />
          );
        })}
      </span>
      {caption && (
        <span className="font-condensed text-[11px] text-faint tracking-[.06em]">
          {r != null ? `${r} of 5` : "not yet rated"}
        </span>
      )}
    </span>
  );
};
