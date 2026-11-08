// Design System v2 / The Forge — the die stamp. The comic ink stamp,
// forged: the verdict is pressed INTO the metal (deboss) instead of inked
// on top. Takes the same values loadStamp() produces, so it drops in where
// RubberStamp lived. First Forge hardware in production (S8).
// Contrast fix (Jason, 2026-08-16): the original deboss made the TEXT the
// dark carve (near-black on dark metal — unreadable). Now the verdict is
// bright and the SHADOW does the carving: status-colored text pressed into
// the plate by a dark top edge, with the tone's glow warming the recess.
const TONES: Record<string, { fg: string; glow: string }> = {
  paid: { fg: "var(--color-status-info-text)", glow: "color-mix(in srgb, var(--color-status-info-text) 25%, transparent)" },
  delivered: { fg: "var(--color-status-positive-text)", glow: "color-mix(in srgb, var(--color-status-positive-text) 22%, transparent)" },
  cancelled: { fg: "var(--color-status-negative-text)", glow: "color-mix(in srgb, var(--color-status-negative-text) 20%, transparent)" },
  tonu: { fg: "var(--color-status-negative-text)", glow: "color-mix(in srgb, var(--color-status-negative-text) 20%, transparent)" },
};

export const DieStamp = ({ value }: { value: string | null }) => {
  if (!value) return null;
  const tone = TONES[value] ?? TONES.delivered;
  return (
    <span
      className="inline-block px-3 py-[3px] rounded-lg -rotate-3 font-forge font-bold text-[15px] tracking-[.14em] uppercase select-none"
      style={{
        color: tone.fg,
        background: "linear-gradient(178deg, var(--color-plate-a), var(--color-plate-b))",
        boxShadow: `var(--shadow-inset), inset 0 0 14px ${tone.glow}`,
      }}
    >
      {value}
    </span>
  );
};
