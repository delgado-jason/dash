// The recap posters' shared cells — the owner's and the dispatcher's read as
// one family. Number formats live in posterFormat.ts (Fast Refresh wants a
// component file to export only components).

export const Tile = ({
  value,
  label,
  color = "#f5e6c8",
}: {
  value: string;
  label: string;
  color?: string;
}) => (
  <div className="flex-1 rounded-[9px] px-1 py-2 text-center" style={{ background: "#1c2333" }}>
    <div className="font-forge font-bold text-[19px] leading-none" style={{ color }}>
      {value}
    </div>
    <div className="text-[9px] text-muted-text mt-1 tracking-wide">{label}</div>
  </div>
);

export const Hero = ({
  value,
  label,
  color,
  big,
}: {
  value: string;
  label: string;
  color: string;
  big: boolean;
}) => (
  <div className="flex-1 rounded-xl text-center" style={{ background: "#0a0d13", padding: big ? "11px 4px" : "9px 4px" }}>
    <div className="font-forge font-bold leading-none" style={{ color, fontSize: big ? 30 : 26 }}>
      {value}
    </div>
    <div className="text-[10px] text-muted-text mt-1 tracking-wider">{label}</div>
  </div>
);
