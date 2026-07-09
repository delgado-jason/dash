import type { LanesSummary } from "@/lib/metrics/lanes";
import { fmtRpm, rpmTextClass } from "./rpmStyle";

interface Props {
  summary: LanesSummary;
}

const Card = ({
  label,
  title,
  rpm,
  loads,
}: {
  label: string;
  title: string;
  rpm: number | null;
  loads: number;
}) => (
  <div className="bg-plate rounded-lg p-4">
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-base font-condensed text-light mt-1">{title}</p>
    <p className="text-sm mt-1">
      <span className={`font-semibold ${rpmTextClass(rpm)}`}>{fmtRpm(rpm)}</span>
      <span className="text-muted-text"> · {loads} loads</span>
    </p>
  </div>
);

const EmptyCard = ({ label }: { label: string }) => (
  <div className="bg-plate rounded-lg p-4">
    <p className="text-xs text-muted-text">{label}</p>
    <p className="text-base font-condensed text-muted-text mt-1">—</p>
    <p className="text-sm text-muted-text mt-1">not enough data</p>
  </div>
);

export const LanesKpis = ({ summary }: Props) => {
  const { topRpmLane, highestVolumeLane, bestOriginMarket } = summary;

  return (
    <div className="grid grid-cols-3 gap-4">
      {topRpmLane ? (
        <Card
          label="Top RPM lane"
          title={topRpmLane.lane}
          rpm={topRpmLane.avgRpm}
          loads={topRpmLane.loadCount}
        />
      ) : (
        <EmptyCard label="Top RPM lane" />
      )}
      {highestVolumeLane ? (
        <Card
          label="Highest volume"
          title={highestVolumeLane.lane}
          rpm={highestVolumeLane.avgRpm}
          loads={highestVolumeLane.loadCount}
        />
      ) : (
        <EmptyCard label="Highest volume" />
      )}
      {bestOriginMarket ? (
        <Card
          label="Best origin market"
          title={bestOriginMarket.market}
          rpm={bestOriginMarket.avgRpm}
          loads={bestOriginMarket.loadCount}
        />
      ) : (
        <EmptyCard label="Best origin market" />
      )}
    </div>
  );
};
