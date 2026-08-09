// Design System v2 / The Forge — the die stamp. The comic ink stamp,
// forged: the verdict is pressed INTO the metal (deboss) instead of inked
// on top. Takes the same values loadStamp() produces, so it drops in where
// RubberStamp lived. First Forge hardware in production (S8).
const TONES: Record<string, { fg: string; glow: string }> = {
  paid: { fg: "#0f2438", glow: "rgba(122,176,232,.2)" },
  delivered: { fg: "#0c2417", glow: "rgba(74,222,128,.16)" },
  cancelled: { fg: "#2b1518", glow: "rgba(248,113,113,.14)" },
  tonu: { fg: "#2b1518", glow: "rgba(248,113,113,.14)" },
};
const EDGE: Record<string, string> = {
  paid: "rgba(122,176,232,.28)",
  delivered: "rgba(110,231,160,.28)",
  cancelled: "rgba(248,113,113,.24)",
  tonu: "rgba(248,113,113,.24)",
};

export const DieStamp = ({ value }: { value: string | null }) => {
  if (!value) return null;
  const tone = TONES[value] ?? TONES.delivered;
  return (
    <span
      className="inline-block px-3 py-[3px] rounded-lg -rotate-3 font-forge font-bold text-[15px] tracking-[.14em] uppercase select-none"
      style={{
        color: tone.fg,
        textShadow: `0 1px 0 ${EDGE[value] ?? EDGE.delivered}`,
        background: "linear-gradient(178deg, #2c3549, #1e2636)",
        boxShadow: `inset 0 2px 6px rgba(0,0,0,.6), inset 0 0 12px ${tone.glow}`,
      }}
    >
      {value}
    </span>
  );
};
