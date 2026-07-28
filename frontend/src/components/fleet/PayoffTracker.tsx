import { Truck, Container, Flag } from "lucide-react";
import type { Obligation } from "@/types/obligation";
import { computePayoff } from "@/lib/metrics/payoff";
import { money } from "@/lib/format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="flex-1 rounded-[9px] px-1.5 py-2 text-center" style={{ background: "#1c2333" }}>
    <div className="font-comic text-[17px] leading-none" style={{ color: "#f5e6c8" }}>
      {value}
    </div>
    <div className="text-[9px] text-muted-text mt-1 tracking-wide">{label}</div>
  </div>
);

// The "own it outright" tracker on an asset page — a road the truck/trailer rides
// toward a FREE & CLEAR flag as the loan balance drops. Fills gold + stamps PAID
// OFF at $0 (which is also when the Free & Clear / Trailer Paid Off trophy earns).
export const PayoffTracker = ({
  obligation,
  kind,
}: {
  obligation: Obligation;
  kind: "truck" | "trailer";
}) => {
  const p = computePayoff(obligation, new Date());
  const Icon = kind === "truck" ? Truck : Container;
  const metal = p.isPaidOff ? "#f5b03a" : kind === "truck" ? "#e8940a" : "#aab4c4";
  const label = kind === "truck" ? "TRUCK" : "TRAILER";
  // Keep at least a sliver filled so the vehicle stays on the road.
  const fillPct = p.isPaidOff ? 100 : Math.max(4, Math.round((p.paidPct ?? 0) * 100));

  return (
    <div
      className="rounded-2xl p-4 mt-4"
      style={{
        background: p.isPaidOff ? "#120f08" : "#10151f",
        border: `2px solid ${metal}`,
        boxShadow: p.isPaidOff ? "inset 0 0 0 2px #7a5410" : undefined,
      }}
    >
      <p className="font-comic tracking-[3px] text-[12px]" style={{ color: "#9daabb" }}>
        OWN THE {label} OUTRIGHT
      </p>

      {p.isPaidOff ? (
        <div className="flex items-center gap-3 mt-1 mb-3">
          <div className="font-comic text-3xl" style={{ color: "#ffe08a" }}>
            FREE &amp; CLEAR
          </div>
          <span
            className="font-comic inline-block"
            style={{ border: "2px solid #4ade80", color: "#4ade80", borderRadius: 8, padding: "1px 10px", transform: "rotate(-4deg)" }}
          >
            PAID OFF
          </span>
        </div>
      ) : (
        <div className="flex items-baseline gap-2 mt-1 mb-3">
          <div className="font-comic text-3xl" style={{ color: metal }}>
            {money(p.owed)}
          </div>
          <div className="text-xs text-muted-text">to free &amp; clear</div>
        </div>
      )}

      <div className="relative rounded-lg overflow-hidden" style={{ height: 34, background: "#0a0d13", border: "1px solid #22304a" }}>
        <div className="absolute left-0 top-0 bottom-0" style={{ width: `${fillPct}%`, background: metal, borderRadius: "7px 0 0 7px" }} />
        <div className="absolute left-2 right-2 top-1/2" style={{ height: 2, transform: "translateY(-50%)", background: "repeating-linear-gradient(90deg,#2a3550 0 12px,transparent 12px 24px)" }} />
        <Icon size={20} style={{ position: "absolute", top: "50%", left: `${fillPct}%`, transform: "translate(-50%,-50%)", color: "#120f08" }} />
        <Flag size={16} style={{ position: "absolute", top: "50%", right: 8, transform: "translateY(-50%)", color: metal }} />
      </div>

      {p.paidPct != null && !p.isPaidOff && (
        <div className="flex justify-between text-[11px] text-muted-text mt-1">
          <span>{Math.round(p.paidPct * 100)}% owned</span>
          <span>{p.exact ? "payoff from contract" : "at current pace"}</span>
        </div>
      )}

      {p.isPaidOff ? (
        <p className="text-center mt-3 text-[12px]" style={{ color: "#f5b03a" }}>
          Free &amp; Clear trophy earned
        </p>
      ) : (
        <>
          <div className="flex gap-2 mt-3">
            <Stat value={money(p.monthlyPayment)} label="PER MONTH" />
            <Stat
              value={p.payoffDate ? monthYear(p.payoffDate) : "—"}
              label={p.exact ? "PAYOFF DATE" : "PAYOFF AT PACE"}
            />
            <Stat value={p.paymentsLeft != null ? String(p.paymentsLeft) : "—"} label="PAYMENTS LEFT" />
          </div>
          {p.paymentsLeft != null && (
            <p className="font-comic text-center mt-3 text-[13px]" style={{ color: metal, letterSpacing: "1px" }}>
              ≈ {p.paymentsLeft} MORE PAYMENT{p.paymentsLeft === 1 ? "" : "S"} TO FREE &amp; CLEAR
            </p>
          )}
        </>
      )}
    </div>
  );
};
