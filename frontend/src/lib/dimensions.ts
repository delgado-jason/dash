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
