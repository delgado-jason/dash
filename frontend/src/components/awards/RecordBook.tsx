import type { PersonalBests } from "@/lib/metrics/playerCard";

export interface RecordChip {
  icon: string;
  color: string;
  value: string;
  label: string;
}

const kMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`);

// The driver's records → chips. (No deadhead record — it's a structural cost of
// oversize work, not a personal best to chase; removed 2026-07-25.)
export const driverRecordChips = (b: PersonalBests): RecordChip[] => [
  { icon: "trophy", color: "#f5b03a", value: b.bestWeekRevenue != null ? kMoney(b.bestWeekRevenue) : "—", label: "TOP WEEK" },
  { icon: "flame", color: "#e8940a", value: b.bestMpg != null ? b.bestMpg.toFixed(1) : "—", label: "BEST TANK" },
  { icon: "package", color: "#f5b03a", value: b.biggestLoad != null ? kMoney(b.biggestLoad) : "—", label: "BIGGEST LOAD" },
  { icon: "stack", color: "#60a5fa", value: b.mostLoadsInWeek != null ? String(b.mostLoadsInWeek) : "—", label: "MOST / WEEK" },
];
