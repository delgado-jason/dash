import { consolidateLevers, type CutPlan, type CutTier } from "@/lib/metrics/cutPlanner";
import { money } from "@/lib/format";

const TIER_COLOR: Record<CutTier, string> = {
  off_limits: "#5a6880",
  essential: "#8494ab",
  discretionary: "#5dcaa5",
  deferrable: "#f5b03a",
  efficiency: "#e8940a",
  last_resort: "#e24b4a",
};
const TIER_LABEL: Record<CutTier, string> = {
  off_limits: "off-limits",
  essential: "essential",
  discretionary: "discretionary",
  deferrable: "deferrable",
  efficiency: "efficiency",
  last_resort: "your pay",
};

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// The cut plan, shown under the Market playbook ONLY when the whole operation is
// under break-even. Every lever is one of the owner's real categories.
export const CutPanel = ({ plan }: { plan: CutPlan }) => {
  const lines = consolidateLevers(plan.levers);
  if (lines.length === 0 && plan.gapNeeded <= 0) return null;

  return (
    <div className="ds2-board overflow-hidden mt-3" style={{ background: "#090d15" }}>
      <div className="px-4 pt-3 pb-2.5 border-b border-hairline">
        <div className="text-[11.5px] font-bold uppercase tracking-[.07em]" style={{ color: "#e24b4a" }}>
          A cut plan from your books — to get back to break-even
        </div>
        <p className="text-[12.5px] text-dim mt-1 leading-snug">
          You need about <span className="text-ink font-semibold">{money(plan.gapNeeded)}/mo</span>. Cheapest,
          least-painful first — pulled from <span className="text-ink">your</span> spend, balanced to hit the number
          (never a canned list).
        </p>
      </div>

      <div className="px-4">
        {lines.map((l) => (
          <div
            key={l.category}
            className="grid grid-cols-[1fr_auto] items-baseline gap-x-3.5 py-2.5 border-t border-hairline/60 first:border-t-0"
          >
            <div>
              <span className="text-[13.5px] text-ink">{l.category}</span>
              <span
                className="ml-2 text-[9.5px] uppercase tracking-[.05em] font-bold rounded px-1.5 py-px"
                style={{ color: TIER_COLOR[l.tier], background: rgba(TIER_COLOR[l.tier], 0.11), border: `1px solid ${rgba(TIER_COLOR[l.tier], 0.3)}` }}
              >
                {TIER_LABEL[l.tier]}
              </span>
              <div className="text-[11px] text-faint mt-0.5">{l.reason}</div>
            </div>
            <div className="font-condensed text-[16px]" style={{ color: l.tier === "last_resort" ? "#e24b4a" : "#5dcaa5" }}>
              −{money(l.amount)}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-[1fr_auto] gap-x-3.5 pt-2.5 pb-1 mt-1 border-t border-hairline">
          <div className="font-condensed font-bold text-[14px]" style={{ color: plan.reachesGap ? "#5dcaa5" : "#f5b03a" }}>
            {plan.reachesGap ? "Plan total — closes the gap" : "Plan total — as far as safe cuts reach"}
          </div>
          <div className="font-condensed font-bold text-[17px]" style={{ color: plan.reachesGap ? "#5dcaa5" : "#f5b03a" }}>
            −{money(plan.planTotal)}
          </div>
        </div>
      </div>

      <div className="px-4 pb-3.5 pt-2">
        {!plan.reachesGap && (
          <p className="text-[12px] mt-1 mb-2 leading-snug" style={{ color: "#f5b03a" }}>
            Even after every safe cut you're about <span className="font-semibold">{money(plan.shortfall)}/mo</span> short —
            that last stretch has to come from rate or home time, not more cost-cutting.
          </p>
        )}
        <p className="text-[11px] text-faint leading-relaxed">
          {plan.offLimits.length > 0 && (
            <>
              <span style={{ color: "#5a6880" }}>🔒 Off-limits (never cut):</span>{" "}
              {plan.offLimits.slice(0, 8).join(" · ")}
              {plan.offLimits.length > 8 ? ` +${plan.offLimits.length - 8} more` : ""}.{" "}
            </>
          )}
          <span className="text-dim">Your pay is last</span> — the plan only reaches for it when nothing else closes the
          gap, and says so plainly. Set how each category is treated in{" "}
          <span className="text-dim">Settings → Cost-cut tiers</span>.
        </p>
      </div>
    </div>
  );
};
