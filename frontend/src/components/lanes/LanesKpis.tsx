import type { ReactNode } from "react";
import { Flame, Truck, Crown } from "lucide-react";
import type { LanesSummary } from "@/lib/metrics/lanes";
import { fmtRpm, rpmTextClass } from "./rpmStyle";

interface Props {
  summary: LanesSummary;
}

const Card = ({
  label,
  icon,
  title,
  rpm,
  loads,
}: {
  label: string;
  icon: ReactNode;
  title: string;
  rpm: number | null;
  loads: number;
}) => (
  <div className="bg-plate rounded-lg p-4">
    <p className="text-xs text-muted-text flex items-center gap-1.5">
      {icon}
      {label}
    </p>
    <p className="text-base font-condensed text-light mt-1">{title}</p>
    <p className="text-sm mt-1">
      <span className={`font-semibold ${rpmTextClass(rpm)}`}>{fmtRpm(rpm)}</span>
      <span className="text-muted-text"> · {loads} loads</span>
    </p>
  </div>
);

const EmptyCard = ({ label, icon }: { label: string; icon: ReactNode }) => (
  <div className="bg-plate rounded-lg p-4">
    <p className="text-xs text-muted-text flex items-center gap-1.5">
      {icon}
      {label}
    </p>
    <p className="text-base font-condensed text-muted-text mt-1">—</p>
    <p className="text-sm text-muted-text mt-1">not enough data</p>
  </div>
);

const FLAME = <Flame size={14} style={{ color: "#e8621e" }} />;
const TRUCK = <Truck size={14} className="text-muted-text" />;
const CROWN = <Crown size={14} className="text-amber" />;

export const LanesKpis = ({ summary }: Props) => {
  const { topRpmLane, highestVolumeLane, bestOriginMarket } = summary;

  return (
    <div className="grid grid-cols-3 gap-4">
      {topRpmLane ? (
        <Card
          label="Top RPM lane"
          icon={FLAME}
          title={topRpmLane.lane}
          rpm={topRpmLane.avgRpm}
          loads={topRpmLane.loadCount}
        />
      ) : (
        <EmptyCard label="Top RPM lane" icon={FLAME} />
      )}
      {highestVolumeLane ? (
        <Card
          label="Highest volume"
          icon={TRUCK}
          title={highestVolumeLane.lane}
          rpm={highestVolumeLane.avgRpm}
          loads={highestVolumeLane.loadCount}
        />
      ) : (
        <EmptyCard label="Highest volume" icon={TRUCK} />
      )}
      {bestOriginMarket ? (
        <Card
          label="Best origin market"
          icon={CROWN}
          title={bestOriginMarket.market}
          rpm={bestOriginMarket.avgRpm}
          loads={bestOriginMarket.loadCount}
        />
      ) : (
        <EmptyCard label="Best origin market" icon={CROWN} />
      )}
    </div>
  );
};
