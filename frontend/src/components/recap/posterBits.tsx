// The recap posters' shared cells — the owner's and the dispatcher's read as
// one family. Number formats live in posterFormat.ts (Fast Refresh wants a
// component file to export only components).

export const Tile = ({
  value,
  label,
  color = "var(--color-ink)",
}: {
  value: string;
  label: string;
  color?: string;
}) => (
  <div className="flex-1 rounded-[9px] px-1 py-2 text-center bg-well">
    <div className="font-condensed font-semibold tabular-nums text-[19px] leading-none" style={{ color }}>
      {value}
    </div>
    <div className="text-[9px] text-muted-text mt-1 tracking-wide">{label}</div>
  </div>
);

export const Hero = ({
  value,
  label,
  big,
}: {
  value: string;
  label: string;
  big: boolean;
}) => (
  <div className="flex-1 rounded-xl text-center bg-canvas" style={{ padding: big ? "11px 4px" : "9px 4px" }}>
    <div className="font-condensed font-semibold tabular-nums leading-none text-ink" style={{ fontSize: big ? 30 : 26 }}>
      {value}
    </div>
    <div className="text-[10px] text-muted-text mt-1 tracking-wider">{label}</div>
  </div>
);
