// Mileage "clubs" — a comic rank a truck/trailer/driver earns by odometer, the
// fleet parallel to agent prestige. Named clubs run to 1M; beyond that we keep
// minting +500K platinum markers.
export type MileTier = "bronze" | "silver" | "gold" | "platinum";

export const fmtMiles = (n: number): string => {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M`;
  }
  return `${Math.round(n / 1000)}K`;
};

const markerAt = (i: number): number => {
  const base = [100_000, 250_000, 500_000, 1_000_000];
  return i < base.length ? base[i] : 1_000_000 + (i - 3) * 500_000;
};
const tierOf = (marker: number): MileTier =>
  marker >= 1_000_000
    ? "platinum"
    : marker >= 500_000
      ? "gold"
      : marker >= 250_000
        ? "silver"
        : "bronze";
const titleOf = (marker: number): string =>
  marker >= 1_000_000
    ? "Million-Miler"
    : marker >= 500_000
      ? "Workhorse"
      : marker >= 250_000
        ? "Road Warrior"
        : "Seasoned";

export interface Milestone {
  crossed: number | null; // highest club marker reached; null under 100K
  tier: MileTier | null;
  title: string | null;
  label: string | null; // "500K", "1M", "1.5M"
  next: number; // next marker
  toNext: number; // miles remaining to it
  pct: number; // 0..1 progress from crossed → next
}

export const mileMilestone = (miles: number): Milestone => {
  const m = Math.max(0, miles || 0);
  let i = -1;
  while (markerAt(i + 1) <= m) i++;
  const crossed = i >= 0 ? markerAt(i) : null;
  const next = markerAt(i + 1);
  const prev = crossed ?? 0;
  const pct = next > prev ? Math.max(0, Math.min(1, (m - prev) / (next - prev))) : 0;
  return {
    crossed,
    tier: crossed != null ? tierOf(crossed) : null,
    title: crossed != null ? titleOf(crossed) : null,
    label: crossed != null ? fmtMiles(crossed) : null,
    next,
    toNext: Math.max(0, next - m),
    pct,
  };
};
