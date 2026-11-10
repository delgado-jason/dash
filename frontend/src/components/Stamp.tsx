// A comic rubber stamp — tier/status color, cocked at an angle. Shared by the
// agent rating look, maintenance OVERDUE, and the service DONE! confirmation.
export const Stamp = ({
  label,
  color,
  size = "md",
}: {
  label: string;
  color: string;
  size?: "sm" | "md";
}) => (
  <span
    className={`inline-block font-condensed font-semibold uppercase rounded ${
      size === "sm" ? "text-[12px] px-2 py-0" : "text-sm px-2.5 py-0.5"
    }`}
    style={{ border: `3px double ${color}`, color, letterSpacing: "2px" }}
  >
    {label}
  </span>
);
