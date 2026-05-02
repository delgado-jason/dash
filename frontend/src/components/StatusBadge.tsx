import { Badge } from "./ui/badge";

export const StatusBadge = (value: string) => {
    const status = {
      delivered: ["--color-status-positive-bg", "--color-status-positive-text"],
      paid: ["--color-status-positive-bg", "--color-status-positive-text"],
      cancelled: ["--color-status-negative-bg", "--color-status-negative-text"],
      tonu: ["--color-status-negative-bg", "--color-status-negative-text"],
      booked: ["--color-status-neutral-bg", "--color-status-neutral-text"],
      in_transit: ["--color-status-neutral-bg", "--color-status-neutral-text"],
      unpaid: ["--color-status-aware-bg", "--color-status-aware-text"],
      invoiced: ["--color-status-aware-bg", "--color-status-aware-text"],
    };

    if ()
}