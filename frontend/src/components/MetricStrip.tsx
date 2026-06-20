import { MetricCard } from "./MetricCard";
import type { Metric } from "@/types/metric";

interface MetricStripProps {
  cards: Metric[];
}

export const MetricStrip = ({ cards }: MetricStripProps) => {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-4 p-2">
      {cards.map((card, index) => (
        <MetricCard
          key={index}
          label={card.label}
          value={card.value}
          format={card.format}
        />
      ))}
    </div>
  );
};
