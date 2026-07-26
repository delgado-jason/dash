import type { PersonalBests } from "@/lib/metrics/playerCard";
import { awardIcon } from "./awardIcons";

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

// Improving records — beat one and it climbs (a slide-in announces it). Generic so
// the driver, truck, and trailer each feed their own set.
export const RecordBook = ({ records }: { records: RecordChip[] }) => (
  <div className="mt-6">
    <div className="flex items-baseline gap-2 mb-2">
      <span className="font-comic text-lg" style={{ color: "#f5b03a" }}>
        RECORD BOOK
      </span>
      <span className="text-[11px] text-muted-text">your bests — they climb as you beat them</span>
    </div>
    <div className="flex gap-2 flex-wrap">
      {records.map((r) => {
        const Icon = awardIcon(r.icon);
        return (
          <div key={r.label} className="flex-1 min-w-[92px] rounded-[10px] px-2 py-2 text-center" style={{ background: "#1c2333" }}>
            <Icon size={16} style={{ color: r.color }} />
            <div className="font-comic leading-none mt-1" style={{ color: "#f5e6c8", fontSize: 19 }}>
              {r.value}
            </div>
            <div className="text-[9px] text-muted-text mt-1 tracking-wide">{r.label}</div>
          </div>
        );
      })}
    </div>
  </div>
);
