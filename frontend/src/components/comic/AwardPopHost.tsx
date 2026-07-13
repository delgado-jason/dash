import { useState, useEffect } from "react";
import type { Award } from "@/lib/metrics/awards";
import { awardIcon } from "@/components/awards/awardIcons";
import { BurstAward } from "./BurstAward";
import { RecapCeremony } from "./RecapCeremony";
import { TrophyCeremony } from "./TrophyCeremony";
import { MedalAward } from "./MedalAward";

// Orchestrates the celebration. Takeovers own the screen one at a time, ranked
// trophy > recap > medal; corner slide-ins (a stacked patch, a beaten record) fade
// on their own after a few seconds. A takeover blocks the corner until dismissed.
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
    visible.find((p) => p.tier === "trophy") ??
    visible.find((p) => p.tier === "recap") ??
    visible.find((p) => p.tier === "medal");
  const slideIns = takeover
    ? []
    : visible.filter((p) => p.tier === "patch" || p.tier === "record").slice(0, 4);

  const slideKey = slideIns.map((b) => b.id).join(",");
  useEffect(() => {
    if (!slideKey) return;
    const ids = slideKey.split(",");
    // Records/patches hold ~3.5s so they can be read, then slide back out.
    const timers = ids.map((id, idx) => setTimeout(() => dismiss(id), 3500 + idx * 600));
    return () => timers.forEach(clearTimeout);
  }, [slideKey]);

  if (!takeover && slideIns.length === 0) return null;

  return (
    <>
      {slideIns.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 items-end">
          {slideIns.map((b) => (
            <BurstAward key={b.id} award={b} Icon={awardIcon(b.icon)} onDismiss={() => dismiss(b.id)} />
          ))}
        </div>
      )}
      {takeover && takeover.tier === "trophy" && (
        <TrophyCeremony award={takeover} onDismiss={() => dismiss(takeover.id)} />
      )}
      {takeover && takeover.tier === "recap" && (
        <RecapCeremony award={takeover} truckAvatarUrl={truckAvatarUrl} onDismiss={() => dismiss(takeover.id)} />
      )}
      {takeover && takeover.tier === "medal" && (
        <MedalAward award={takeover} Icon={awardIcon(takeover.icon)} onDismiss={() => dismiss(takeover.id)} />
      )}
    </>
  );
};
