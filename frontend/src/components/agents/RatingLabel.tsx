// The owner's 1–5 call on an agent, as a plain label (the Redesign, phase B1:
// the medallion, the die-pressed stamp and the coins retire). The five words
// are the system's own; the colour says what the word means and nothing else.
const TIERS: Record<number, { label: string; cls: string }> = {
  5: { label: "Call first", cls: "text-status-positive-text" },
  4: { label: "Good", cls: "text-status-positive-text" },
  3: { label: "Default", cls: "text-dim" },
  2: { label: "Avoid", cls: "text-status-aware-text" },
  1: { label: "Blacklist", cls: "text-status-negative-text" },
};

const fmtSetOn = (d: string): string =>
  new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export const RatingLabel = ({
  rating,
  workStatus,
  size = "sm",
  setOn = null,
}: {
  rating?: number | null;
  /**
   * Pass the agent's work_status and a parked desk reads PARKED instead of
   * whatever stars it still carries. Four of Jason's parked agents were
   * sitting at three — the active default — so the detail page announced
   * "AVOID 2 / 5" about a desk he had already stopped booking. Rating and
   * parked are one control now (lib/agents/standing.ts); this is the one
   * display that has to agree with it.
   */
  workStatus?: string | null;
  size?: "sm" | "lg";
  setOn?: string | null; // the day the rating was last set, when known
}) => {
  const parked = workStatus === "parked";
  const t = parked
    ? { label: "Parked", cls: "text-status-negative-text" }
    : rating
      ? TIERS[rating]
      : null;
  const word = size === "lg" ? "text-[18.5px]" : "text-[13px]";
  const figure = size === "lg" ? "text-[14px]" : "text-[12px]";
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={`font-condensed font-semibold uppercase tracking-[.06em] ${word} ${t ? t.cls : "text-faint"}`}>
        {t ? t.label : "Unrated"}
      </span>
      {parked ? (
        // The stored stars still show, faint and prefixed, because they are
        // what the desk comes back to if it is un-parked — not its standing.
        rating ? (
          <span className={`font-condensed tabular-nums text-faint ${figure}`}>
            was {rating} / 5
          </span>
        ) : null
      ) : rating ? (
        <span className={`font-condensed tabular-nums text-faint ${figure}`}>
          {rating} / 5{setOn ? ` · set ${fmtSetOn(setOn)}` : ""}
        </span>
      ) : null}
    </span>
  );
};
