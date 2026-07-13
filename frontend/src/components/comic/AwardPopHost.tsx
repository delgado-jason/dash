import { useState, useEffect } from "react";
import {
  Truck,
  Medal,
  Trophy,
  Flame,
  Package,
  Layers,
  Users,
  Gauge,
  type LucideIcon,
} from "lucide-react";
import type { Award } from "@/lib/metrics/awards";
import { MarqueeAward } from "./MarqueeAward";
import { BurstAward } from "./BurstAward";
import { RecapCeremony } from "./RecapCeremony";

const ICONS: Record<string, LucideIcon> = {
  truck: Truck,
  medal: Medal,
  trophy: Trophy,
  flame: Flame,
  package: Package,
  stack: Layers,
  users: Users,
  gauge: Gauge,
};
const iconFor = (n: string): LucideIcon => ICONS[n] ?? Trophy;

// Orchestrates the celebration: a takeover (recap ceremony or marquee) owns the
// screen one at a time; bursts stack in the corner and auto-fade. A takeover
// blocks bursts until dismissed. Recap ceremonies outrank marquees.
export const AwardPopHost = ({
  pops,
  truckAvatarUrl,
}: {
  pops: Award[];
  truckAvatarUrl?: string | null;
}) => {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const dismiss = (id: string) =>
    setDismissed((d) => {
      const n = new Set(d);
      n.add(id);
      return n;
    });

  const visible = pops.filter((p) => !dismissed.has(p.id));
  const takeover =
    visible.find((p) => p.tier === "recap") ??
    visible.find((p) => p.tier === "marquee");
  const bursts = takeover ? [] : visible.filter((p) => p.tier === "burst").slice(0, 4);

  const burstKey = bursts.map((b) => b.id).join(",");
  useEffect(() => {
    if (!burstKey) return;
    const ids = burstKey.split(",");
    const timers = ids.map((id, idx) => setTimeout(() => dismiss(id), 5000 + idx * 600));
    return () => timers.forEach(clearTimeout);
  }, [burstKey]);

  if (!takeover && bursts.length === 0) return null;

  return (
    <>
      {bursts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
          {bursts.map((b) => (
            <BurstAward key={b.id} award={b} Icon={iconFor(b.icon)} onDismiss={() => dismiss(b.id)} />
          ))}
        </div>
      )}
      {takeover && takeover.tier === "recap" && (
        <RecapCeremony award={takeover} truckAvatarUrl={truckAvatarUrl} onDismiss={() => dismiss(takeover.id)} />
      )}
      {takeover && takeover.tier === "marquee" && (
        <MarqueeAward award={takeover} Icon={iconFor(takeover.icon)} onDismiss={() => dismiss(takeover.id)} />
      )}
    </>
  );
};
