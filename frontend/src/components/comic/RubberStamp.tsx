// A distressed, rotated ink stamp that slams down on a load's "won" state —
// DELIVERED / PAID / CANCELLED / TONU. Pure CSS, no dependency.
const STAMP_META: Record<string, string> = {
  paid: "#4ade80",
  delivered: "#4ade80",
  cancelled: "#7d8ba3",
  tonu: "#f87171",
};

// The single most notable stamp for a load: paid trumps delivered, then the
// off-ramps. Returns null for booked/in-transit (nothing to slam yet).
export const loadStamp = (
  loadStatus: string,
  paymentStatus: string,
): string | null => {
  if (paymentStatus === "paid") return "paid";
  if (loadStatus === "delivered") return "delivered";
  if (loadStatus === "cancelled") return "cancelled";
  if (loadStatus === "tonu") return "tonu";
  return null;
};

export const RubberStamp = ({
  value,
  size = 22,
}: {
  value: string | null;
  size?: number;
}) => {
  if (!value || !(value in STAMP_META)) return null;
  const color = STAMP_META[value];
  return (
    <span
      className="font-comic select-none"
      style={{
        display: "inline-block",
        border: `3px solid ${color}`,
        color,
        opacity: 0.85,
        borderRadius: 8,
        padding: "1px 12px",
        fontSize: size,
        letterSpacing: 2,
        lineHeight: 1.15,
        animation: "stampSlam 0.4s cubic-bezier(0.2, 1.5, 0.4, 1) both",
      }}
    >
      {value.toUpperCase()}
    </span>
  );
};
