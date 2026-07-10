// Shared KPI card in the coherent theme (bg-plate, muted label, condensed value).
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
  <div className="bg-plate rounded-lg p-4">
    <p className="text-xs text-muted-text">{label}</p>
    <p className={`text-2xl font-condensed mt-1 ${valueClass}`}>{value}</p>
    {sub && <p className="text-xs text-muted-text mt-1">{sub}</p>}
  </div>
);
