// Shared KPI card in the coherent theme (bg-plate, muted label, condensed value).
import { Panel } from "@/components/ui/Panel";

export const Kpi = ({
  label,
  value,
  sub,
  valueClass = "text-light",
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) => (
  <Panel className="p-4">
    <p className="text-xs text-muted-text">{label}</p>
    <p className={`text-2xl font-condensed mt-1 ${valueClass}`}>{value}</p>
    {sub && <p className="text-xs text-muted-text mt-1">{sub}</p>}
  </Panel>
);
