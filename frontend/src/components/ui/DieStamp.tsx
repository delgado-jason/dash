// Design System v2 / The Forge — the die stamp. The comic ink stamp,
// forged: the verdict is pressed INTO the metal (deboss) instead of inked
// on top. Takes the same values loadStamp() produces, so it drops in where
// RubberStamp lived. First Forge hardware in production (S8).
// Contrast fix (Jason, 2026-08-16): the original deboss made the TEXT the
// dark carve (near-black on dark metal — unreadable). Now the verdict is
// bright and the SHADOW does the carving: status-colored text pressed into
// the plate by a dark top edge, with the tone's glow warming the recess.
const TONES: Record<string, { fg: string; glow: string }> = {
  paid: { fg: "#7ab0e8", glow: "rgba(122,176,232,.25)" },
  delivered: { fg: "#6fd08c", glow: "rgba(111,208,140,.22)" },
  cancelled: { fg: "#f08a8a", glow: "rgba(248,113,113,.2)" },
  tonu: { fg: "#f08a8a", glow: "rgba(248,113,113,.2)" },
};

export const DieStamp = ({ value }: { value: string | null }) => {
  if (!value) return null;
  const tone = TONES[value] ?? TONES.delivered;
  return (
    <span
      className="inline-block px-3 py-[3px] rounded-lg -rotate-3 font-forge font-bold text-[15px] tracking-[.14em] uppercase select-none"
      style={{
        color: tone.fg,
        textShadow: "0 -1px 1px rgba(0,0,0,.85), 0 1px 0 rgba(255,255,255,.08)",
        background: "linear-gradient(178deg, #2c3549, #1e2636)",
        boxShadow: `inset 0 2px 6px rgba(0,0,0,.6), inset 0 0 14px ${tone.glow}`,
      }}
    >
      {value}
    </span>
  );
};
