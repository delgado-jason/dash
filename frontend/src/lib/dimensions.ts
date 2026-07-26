// Load dimensions are stored as whole inches; the form enters feet + inches. These
// helpers convert between the two and format inches back as feet-inches for display.

export const toInches = (feet: number, inches: number): number =>
  Math.round(feet) * 12 + Math.round(inches);

export const toFeetInches = (
  totalInches: number,
): { feet: number; inches: number } => ({
  feet: Math.floor(totalInches / 12),
  inches: totalInches % 12,
});

// `40'0"` from inches; null/undefined pass through as null (nothing to show).
export const formatInches = (
  totalInches: number | null | undefined,
): string | null => {
  if (totalInches == null) return null;
  const { feet, inches } = toFeetInches(totalInches);
  return `${feet}'${inches}"`;
};

// The load-detail summary — `40'0" L · 12'4" W · 7'10" H`, only the dimensions
// that are set. null when the load has none at all (a legal load).
export const formatLoadDims = (
  length_in?: number | null,
  width_in?: number | null,
  height_in?: number | null,
): string | null => {
  const parts: string[] = [];
  const l = formatInches(length_in);
  const w = formatInches(width_in);
  const h = formatInches(height_in);
  if (l) parts.push(`${l} L`);
  if (w) parts.push(`${w} W`);
  if (h) parts.push(`${h} H`);
  return parts.length ? parts.join(" · ") : null;
};

// Legal width is 8'6" (102"); anything wider needs an oversize permit. Width is
// the one dimension we can compare to legal directly (height would need the deck
// height to know total travel height, and length needs the trailer).
export const LEGAL_WIDTH_IN = 102;
export const isOverWidth = (width_in?: number | null): boolean =>
  width_in != null && width_in > LEGAL_WIDTH_IN;

// Federal defaults for the other three. These compare against TRAVEL figures —
// total height is deck + load, length is overall, weight is gross (truck +
// trailer + load) — not cargo-only numbers. Real limits vary by state; these are
// the routine no-permit thresholds, good enough to flag "this needs a permit".
export const LEGAL_HEIGHT_IN = 162; // 13'6"
export const LEGAL_LENGTH_IN = 636; // 53' overall
export const LEGAL_GROSS_LB = 80000; // gross vehicle weight

export interface TravelDims {
  widthIn?: number | null;
  heightIn?: number | null; // total travel height (deck + load)
  lengthIn?: number | null; // overall
  grossWeightLb?: number | null; // truck + trailer + load
}

export interface OversizeVerdict {
  oversize: boolean;
  reasons: string[]; // e.g. ["width 12'0\" over 8'6\""] — one per dimension over
}

// Legal-vs-oversize from a load's travel dimensions. Any dimension over its limit
// makes the load oversize, and each contributes a plain-language reason naming
// the offender. Blank dimensions are skipped — a load with nothing entered reads
// legal. Mirrors the width-first honesty above: width is the surest flag, the
// rest lean on the federal defaults.
export const classifyOversize = (d: TravelDims): OversizeVerdict => {
  const reasons: string[] = [];
  if (d.widthIn != null && d.widthIn > LEGAL_WIDTH_IN)
    reasons.push(`width ${formatInches(d.widthIn)} over ${formatInches(LEGAL_WIDTH_IN)}`);
  if (d.heightIn != null && d.heightIn > LEGAL_HEIGHT_IN)
    reasons.push(`height ${formatInches(d.heightIn)} over ${formatInches(LEGAL_HEIGHT_IN)}`);
  if (d.lengthIn != null && d.lengthIn > LEGAL_LENGTH_IN)
    reasons.push(`length ${formatInches(d.lengthIn)} over ${formatInches(LEGAL_LENGTH_IN)}`);
  if (d.grossWeightLb != null && d.grossWeightLb > LEGAL_GROSS_LB)
    reasons.push(
      `${d.grossWeightLb.toLocaleString("en-US")} lb over ${LEGAL_GROSS_LB.toLocaleString("en-US")} lb`,
    );
  return { oversize: reasons.length > 0, reasons };
};
