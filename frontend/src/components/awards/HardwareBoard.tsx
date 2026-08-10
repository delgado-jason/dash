import { Link } from "react-router-dom";
import type { Medal } from "@/lib/awards/medals";
import type { Patch } from "@/lib/awards/patches";
import type { RecordChip } from "@/components/awards/RecordBook";
import type { GrindPatch } from "@/lib/awards/dispatcherAwards";
import { Coin, type CoinMetal } from "@/components/forge/Coin";

const METALS: CoinMetal[] = ["bronze", "bronze", "silver", "gold", "platinum"];

// The dossier's achievements board — coins, tags, and record plates in the
// rack language of the Forge Room. Earned hardware shows struck; unearned
// rides as a ghost with its criterion and a live meter (the ghost rule).
// Driver-scoped today; the truck/trailer pages keep RecordBook/PatchBoard
// until their slices.

const MeterCells = ({ pct, cells = 4 }: { pct: number; cells?: number }) => (
  <span className="inline-flex gap-[2px] w-full">
    {Array.from({ length: cells }, (_, i) => (
      <i
        key={i}
        className="flex-1 h-[5px] rounded-[2px]"
        style={
          i < Math.round(pct * cells)
            ? {
                background: "linear-gradient(180deg, var(--color-hot), var(--color-amber))",
                boxShadow: "0 0 5px rgba(232,148,10,.3)",
              }
            : { border: "1px dashed var(--color-hairline)" }
        }
      />
    ))}
  </span>
);

export const HardwareBoard = ({
  medals,
  patches,
  grindTags,
  records,
}: {
  medals: Medal[];
  patches?: Patch[]; // the driver's hard stackable feats
  grindTags?: GrindPatch[]; // the dispatcher's milestone grind (badge + progress built in)
  records?: RecordChip[]; // record plates; section hidden when absent
}) => {
  const sortedPatches = [...(patches ?? [])].sort(
    (a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) || b.count - a.count,
  );
  const sortedTags = [...(grindTags ?? [])].sort(
    (a, b) => (b.earned ? 1 : 0) - (a.earned ? 1 : 0) || b.progress - a.progress,
  );
  return (
    <div className="ds2-board p-4 mt-4">
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="font-condensed font-semibold text-[11.5px] tracking-[.16em] uppercase text-faint">
          The hardware — earned, and what's in reach
        </span>
        <Link
          to="/trophy-room"
          className="ml-auto font-condensed font-semibold text-[12px] tracking-[.08em] text-amber-hi hover:text-hot"
        >
          THE FORGE ROOM →
        </Link>
      </div>

      {/* coins */}
      <div className="mt-3">
        <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mb-2">
          Coins
        </p>
        <div className="flex gap-[14px] flex-wrap items-start">
          {medals.map((m) =>
            m.tier > 0 ? (
              <div key={m.key} className="w-[74px] text-center" title={m.hint}>
                <div className="flex justify-center">
                  <Coin metal={METALS[Math.min(m.tier, 4)]} size={54}>
                    {m.tierLabel}
                  </Coin>
                </div>
                <p className="font-condensed font-semibold text-[11.5px] mt-[5px] leading-tight">
                  {m.name}
                </p>
                {m.next != null && (
                  <div className="mt-1">
                    <MeterCells pct={m.progress} />
                  </div>
                )}
              </div>
            ) : (
              <div key={m.key} className="w-[74px] text-center" title={m.hint}>
                <div
                  className="w-[54px] h-[54px] mx-auto rounded-full border-2 border-dashed border-hairline flex items-center justify-center font-display text-[10px] text-faint tracking-[.06em]"
                  aria-hidden
                >
                  {m.tierLabel || "—"}
                </div>
                <p className="font-condensed text-[11.5px] text-faint mt-[5px] leading-tight">
                  {m.name}
                </p>
                <div className="mt-1">
                  <MeterCells pct={m.progress} />
                </div>
                <p className="font-condensed text-[10px] text-faint mt-[2px]">{m.hint}</p>
              </div>
            ),
          )}
        </div>
      </div>

      {/* tags */}
      {sortedPatches.length > 0 && (
      <div className="mt-4">
        <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mb-2">
          Tags — hard to earn · stack a ×count each time
        </p>
        <div className="flex gap-2 flex-wrap">
          {sortedPatches.map((p) => {
            const earned = p.count > 0;
            const blue = !!p.operational;
            return earned ? (
              <span
                key={p.key}
                title={p.hint}
                className="font-condensed font-bold text-[11px] tracking-[.08em] px-[9px] py-[4px] rounded-[5px] uppercase"
                style={
                  blue
                    ? {
                        color: "#7ab0e8",
                        border: "1px solid rgba(122,176,232,.45)",
                        background: "rgba(122,176,232,.08)",
                      }
                    : {
                        color: "var(--color-amber-hi)",
                        border: "1px solid rgba(232,148,10,.4)",
                        background: "rgba(232,148,10,.07)",
                      }
                }
              >
                {p.name}
                {p.count > 1 ? ` ×${p.count}` : " ✓"}
              </span>
            ) : (
              <span
                key={p.key}
                title={p.hint}
                className="font-condensed font-semibold text-[11px] tracking-[.06em] px-[9px] py-[4px] rounded-[5px] uppercase text-faint border border-dashed border-hairline"
              >
                {p.name} <span className="normal-case tracking-normal">— {p.hint}</span>
              </span>
            );
          })}
        </div>
      </div>
      )}

      {/* grind tags — milestone-based, each carrying its own meter */}
      {sortedTags.length > 0 && (
        <div className="mt-4">
          <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mb-2">
            Tags — the grind, milestone by milestone
          </p>
          <div className="flex gap-x-3 gap-y-2 flex-wrap">
            {sortedTags.map((t) => (
              <span key={t.key} className="inline-flex flex-col gap-[4px]" title={t.hint}>
                {t.earned ? (
                  <span className="font-condensed font-bold text-[11px] tracking-[.08em] px-[9px] py-[4px] rounded-[5px] uppercase text-amber-hi border border-[rgba(232,148,10,.4)] bg-[rgba(232,148,10,.07)]">
                    {t.name} · {t.badge}{" "}
                    <span className="normal-case tracking-normal text-dim font-medium">
                      — {t.hint}
                    </span>
                  </span>
                ) : (
                  <span className="font-condensed font-semibold text-[11px] tracking-[.06em] px-[9px] py-[4px] rounded-[5px] uppercase text-faint border border-dashed border-hairline">
                    {t.name}{" "}
                    <span className="normal-case tracking-normal">— {t.hint}</span>
                  </span>
                )}
                <MeterCells pct={t.progress} cells={8} />
              </span>
            ))}
          </div>
        </div>
      )}

      {/* record plates */}
      {records && records.length > 0 && (
      <div className="mt-4">
        <p className="font-condensed font-semibold text-[11px] tracking-[.14em] uppercase text-faint mb-2">
          Record plates — your bests, they climb as you beat them
        </p>
        <div className="flex gap-[10px] flex-wrap">
          {records.map((r, i) => (
            <span
              key={r.label}
              className="font-display text-[13px] tracking-[.1em] text-amber-hi rounded-[4px] px-[10px] pt-[3px] pb-[2px]"
              style={{
                border: "1.5px solid rgba(245,176,58,.55)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.12), 0 1px 2px rgba(0,0,0,.5)",
                transform: `rotate(${i % 2 === 0 ? -0.8 : 0.7}deg)`,
              }}
            >
              {r.label} <span className="text-ink">· {r.value}</span>
            </span>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};
