import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import type { StateDetail } from "@/lib/metrics/lanes";

const rpm = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const otColor = (n: number | null) =>
  n == null ? "#8b93a3" : n >= 0.9 ? "#4ade80" : n >= 0.7 ? "#e0a020" : "#f87171";
const rowBorder = { borderTop: "0.5px solid rgba(255,255,255,0.06)" };

// Drill-down for a clicked origin state: the agents you've booked out of it
// (each linking to its detail page) and your top lanes from it.
export const StateDetailPanel = ({
  detail,
  windowDays,
  onClear,
}: {
  detail: StateDetail;
  windowDays: number;
  onClear: () => void;
}) => (
  <Panel className="mt-6 p-5">
    <div className="flex items-baseline justify-between border-b border-plate pb-2.5 mb-4">
      <div>
        <span className="text-xl font-condensed text-light">{detail.state}</span>
        <span className="text-xs text-muted-text ml-3">
          last {windowDays} days · {detail.loadCount} load
          {detail.loadCount === 1 ? "" : "s"}
          {detail.medianRpm != null && (
            <>
              {" · "}
              <span className="text-light">{rpm(detail.medianRpm)}/mi median</span>
            </>
          )}
        </span>
      </div>
      <button
        onClick={onClear}
        className="text-xs text-muted-text hover:text-light flex items-center gap-1"
      >
        clear <X size={13} />
      </button>
    </div>

    {detail.agents.length === 0 ? (
      <p className="text-sm text-muted-text">
        No delivered loads out of {detail.state} in this window.
      </p>
    ) : (
      <>
        <div className="text-xs text-muted-text mb-2">
          Agents you've booked out of {detail.state}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] text-muted-text text-left">
              <th className="font-normal py-1">AGENT</th>
              <th className="font-normal text-right">$/MI</th>
              <th className="font-normal text-right">LOADS</th>
              <th className="font-normal text-right">ON-TIME</th>
            </tr>
          </thead>
          <tbody>
            {detail.agents.map((a) => (
              <tr key={a.agentId} style={rowBorder}>
                <td className="py-2">
                  <Link
                    to={`/agents/${a.agentId}`}
                    className="text-status-info-text hover:underline"
                  >
                    {a.agent}
                  </Link>
                </td>
                <td className="text-right tabular-nums">{rpm(a.medianRpm)}</td>
                <td className="text-right text-muted-text">{a.loadCount}</td>
                <td
                  className="text-right tabular-nums"
                  style={{ color: otColor(a.onTimePct) }}
                >
                  {pct(a.onTimePct)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {detail.lanes.length > 0 && (
          <>
            <div className="text-xs text-muted-text mt-5 mb-2">
              Top lanes out of {detail.state}
            </div>
            <div className="text-sm space-y-1">
              {detail.lanes.slice(0, 6).map((l) => (
                <div key={l.lane} className="flex justify-between gap-3">
                  <span className="truncate">{l.lane}</span>
                  <span className="text-muted-text whitespace-nowrap">
                    {rpm(l.medianRpm)}/mi · {l.loadCount} load
                    {l.loadCount === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </>
    )}
  </Panel>
);
