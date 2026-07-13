import { Trophy, Gauge, Flame, Package, Layers } from "lucide-react";
import type { PersonalBests } from "@/lib/metrics/playerCard";

const kMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${Math.round(n)}`);

const Rec = ({ Icon, color, value, label }: { Icon: typeof Trophy; color: string; value: string; label: string }) => (
  <div className="flex-1 min-w-[92px] rounded-[10px] px-2 py-2 text-center" style={{ background: "#1c2333" }}>
    <Icon size={16} style={{ color }} />
    <div className="font-comic leading-none mt-1" style={{ color: "#f5e6c8", fontSize: 19 }}>
      {value}
    </div>
    <div className="text-[9px] text-muted-text mt-1 tracking-wide">{label}</div>
  </div>
);

// Your improving records — beat one and it climbs (a slide-in card announces it,
// then the record updates). Distinct from patches, which are hard absolute bars.
export const RecordBook = ({ bests }: { bests: PersonalBests }) => (
  <div className="mt-6">
    <div className="flex items-baseline gap-2 mb-2">
      <span className="font-comic text-lg" style={{ color: "#f5b03a" }}>
        RECORD BOOK
      </span>
      <span className="text-[11px] text-muted-text">your bests — they climb as you beat them</span>
    </div>
    <div className="flex gap-2 flex-wrap">
      <Rec Icon={Trophy} color="#f5b03a" value={bests.bestWeekRevenue != null ? kMoney(bests.bestWeekRevenue) : "—"} label="TOP WEEK" />
      <Rec Icon={Gauge} color="#4ade80" value={bests.lowestDeadheadPct != null ? `${(bests.lowestDeadheadPct * 100).toFixed(1)}%` : "—"} label="BEST DEADHEAD" />
      <Rec Icon={Flame} color="#e8940a" value={bests.bestMpg != null ? bests.bestMpg.toFixed(1) : "—"} label="BEST TANK" />
      <Rec Icon={Package} color="#f5b03a" value={bests.biggestLoad != null ? kMoney(bests.biggestLoad) : "—"} label="BIGGEST LOAD" />
      <Rec Icon={Layers} color="#60a5fa" value={bests.mostLoadsInWeek != null ? String(bests.mostLoadsInWeek) : "—"} label="MOST / WEEK" />
    </div>
  </div>
);
