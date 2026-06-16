import { Badge } from "./ui/badge";

export const StatusBadge = ({ value }: { value: string }) => {
  const status = {
    delivered: ["--color-status-positive-bg", "--color-status-positive-text"],
    paid: ["--color-status-positive-bg", "--color-status-positive-text"],
    cancelled: ["--color-status-neutral-bg", "--color-status-neutral-text"],
    tonu: ["--color-status-negative-bg", "--color-status-negative-text"],
    booked: ["--color-status-info-bg", "--color-status-info-text"],
    in_transit: ["--color-status-aware-bg", "--color-amber-light"],
    unpaid: ["--color-status-aware-bg", "--color-status-aware-text"],
    invoiced: ["--color-status-aware-bg", "--color-status-aware-text"],
    est: ["--color-status-aware-bg", "--color-status-aware-text"],
  };

  if (!(value in status)) {
    return <Badge variant="default">{value}</Badge>;
  }

  // Lookup variable
  const colors = status[value as keyof typeof status];

  return (
    <Badge
      style={{
        backgroundColor: `var(${colors[0]})`,
        color: `var(${colors[1]})`,
      }}
    >
      {value}
    </Badge>
  );
};
