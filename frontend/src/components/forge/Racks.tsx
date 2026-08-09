import type { ReactNode } from "react";
import { Coin, type CoinMetal } from "@/components/forge/Coin";
import type { Medal } from "@/lib/awards/medals";
import type { Patch } from "@/lib/awards/patches";

// The Forge Room's racks — shared by the driver, truck, and trailer sections.
// One rule everywhere: earned hardware in metal, unearned as a ghost with its
// plain-words price and a live meter wherever the engine measures progress.

const METALS = ["", "bronze", "silver", "gold", "platinum"] as const;

export const RackHeader = ({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) => (
  <div className="flex items-center gap-3.5 mb-4">
    <span
      className="font-forge font-bold text-[19px] whitespace-nowrap"
      style={{ color: "#f5b03a" }}
    >
      {title}
    </span>
    <span
      className="h-px flex-1"
      style={{
        background: "linear-gradient(to right,rgba(232,148,10,.5),transparent)",
      }}
    />
    {right && <span className="text-[11px] text-dim">{right}</span>}
  </div>
);

export const CoinRack = ({ medals }: { medals: Medal[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {medals.map((m) => {
      const earned = m.tier > 0;
      return (
        <div
          key={m.key}
          className={`rounded-xl p-3.5 bg-[#0c111af2] border ${earned ? "border-hairline" : "border-dashed border-[#232d40]"}`}
        >
          <div className="flex items-center gap-3">
            {earned ? (
              <Coin metal={METALS[Math.min(m.tier, 4)] as CoinMetal} size={46}>
                {m.tierLabel}
              </Coin>
            ) : (
              <span className="w-[46px] h-[46px] rounded-full border-2 border-dashed border-[#39445e] flex items-center justify-center text-[13px] font-forge font-bold text-faint shrink-0">
                I
              </span>
            )}
            <div className="min-w-0">
              <div className="font-forge font-bold text-[14px] tracking-[.08em] uppercase">
                {m.name}
                {earned ? ` ${m.tierLabel}` : ""}
              </div>
              <div className="text-[10.5px] text-faint truncate">
                {earned
                  ? m.next != null
                    ? `next tier at ${m.hint.split(" / ")[1]}`
                    : "topped out — the trophy is next"
                  : "first strike ahead"}
              </div>
            </div>
            <span
              className={`ml-auto text-[8.5px] font-semibold tracking-[.14em] uppercase ${earned ? "text-status-positive-text" : "text-faint"}`}
            >
              {earned ? "struck" : "in the die"}
            </span>
          </div>
          {m.next != null && (
            <>
              <div
                className="relative h-[7px] rounded-[4px] bg-well mt-2.5 overflow-hidden"
                style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,.6)" }}
              >
                <span
                  className="absolute left-0 top-0 bottom-0 rounded-[4px]"
                  style={{
                    width: `${Math.round(m.progress * 100)}%`,
                    background:
                      "linear-gradient(90deg,var(--color-chart-amber),var(--color-amber-light))",
                  }}
                />
              </div>
              <div className="flex justify-between text-[9.5px] text-faint mt-1 tabular-nums">
                <span>
                  {earned
                    ? `toward ${METALS[Math.min(m.tier + 1, 4)]}`
                    : "toward the first strike"}
                </span>
                <span>{m.hint}</span>
              </div>
            </>
          )}
        </div>
      );
    })}
  </div>
);

export const TagRack = ({ patches }: { patches: Patch[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    {patches.map((pt) => {
      const earned = pt.count > 0;
      return (
        <div
          key={pt.key}
          className={`rounded-xl p-3.5 bg-[#0c111af2] border ${earned ? "border-hairline" : "border-dashed border-[#232d40]"}`}
        >
          <div
            className={`rounded-lg px-3.5 py-2.5 pl-8 relative ${earned ? "" : "opacity-55 grayscale"}`}
            style={{
              background: "linear-gradient(168deg,#323c52,#212a3c)",
              borderTop: "1px solid rgba(255,255,255,.11)",
              borderBottom: "2px solid rgba(0,0,0,.5)",
            }}
          >
            <span
              className="absolute left-2.5 top-3 w-2.5 h-2.5 rounded-full"
              style={{
                background: "#070a10",
                boxShadow:
                  "inset 0 1px 2px rgba(0,0,0,.9), 0 1px 0 rgba(255,255,255,.12)",
              }}
            />
            <div
              className="font-forge font-bold text-[13.5px] tracking-[.08em] uppercase"
              style={{ color: "#dfe6f2", textShadow: "0 -1px 0 rgba(0,0,0,.7)" }}
            >
              {pt.name}
            </div>
            <div className="flex gap-[5px] mt-1.5 items-center">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className="w-[9px] h-[9px] rounded-full"
                  style={
                    i < Math.min(pt.count, 6)
                      ? {
                          background:
                            "radial-gradient(circle at 40% 35%, #0a0e15 40%, #05070b)",
                          boxShadow:
                            "inset 0 2px 3px rgba(0,0,0,1), inset 0 -1px 1px rgba(245,176,58,.3)",
                        }
                      : {
                          background: "#151c29",
                          boxShadow: "inset 0 1.5px 2.5px rgba(0,0,0,.85)",
                        }
                  }
                />
              ))}
              {earned && (
                <span className="font-forge font-bold text-[12px] text-amber-light ml-1">
                  ×{pt.count}
                </span>
              )}
            </div>
          </div>
          <div className="text-[10.5px] text-faint mt-2">
            {earned ? pt.hint : `to stamp it: ${pt.hint}`}
          </div>
        </div>
      );
    })}
  </div>
);

export interface PlateSpec {
  k: string;
  v: number | null;
  f: (n: number) => string;
}

export const PlateRack = ({ plates }: { plates: PlateSpec[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
    {plates.map((r) => (
      <div
        key={r.k}
        className={`rounded-xl p-3.5 bg-[#0c111af2] border ${r.v != null ? "border-hairline" : "border-dashed border-[#232d40]"}`}
      >
        <div
          className={`rounded-lg px-3.5 py-2.5 relative ${r.v != null ? "" : "opacity-55"}`}
          style={{
            background: "linear-gradient(178deg,#2c3549,#1e2636)",
            borderTop: "1px solid rgba(255,255,255,.1)",
            borderBottom: "1.5px solid rgba(0,0,0,.5)",
          }}
        >
          <div className="text-[8px] font-semibold tracking-[.16em] uppercase text-faint">
            {r.k}
          </div>
          <div
            className="font-forge font-bold text-[18px] tracking-[.05em] mt-0.5 tabular-nums"
            style={{ color: "#dfe6f2", textShadow: "0 -1px 0 rgba(0,0,0,.7)" }}
          >
            {r.v != null ? r.f(r.v) : "— AWAITING —"}
          </div>
          {r.v != null && (
            <div
              className="h-px mt-1.5"
              style={{
                background: "linear-gradient(90deg,var(--color-amber),transparent)",
                boxShadow: "0 0 6px rgba(232,148,10,.5)",
              }}
            />
          )}
        </div>
        <div className="text-[10.5px] text-faint mt-2">
          {r.v != null
            ? "beat it and the plate re-cuts itself"
            : "set the first mark and the plate engraves"}
        </div>
      </div>
    ))}
  </div>
);
