import { useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { WhoToCallTab } from "@/components/foreman/WhoToCallTab";

// The Foreman — a tabbed smart-dispatch hub. v1 ships the "Who to Call" tab (rank
// the agents to call from where you'll be empty next); more spark tools slot in
// as sibling tabs over time.
type ForemanTab = "who-to-call";

export default function ForemanPage() {
  const [tab, setTab] = useState<ForemanTab>("who-to-call");

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <div>
          <p className="text-[11px] uppercase tracking-widest text-amber font-condensed leading-none">
            Dispatch
          </p>
          <h1 className="font-display text-[32px] text-ink leading-none mt-1">THE FOREMAN</h1>
        </div>
      </div>
      <p className="text-dim text-[13px] mt-2 mb-4">
        Who to call from where you'll be empty next — and the ties worth building.
      </p>

      <div className="flex items-center gap-3 mb-5">
        <SegmentedTabs
          tabs={[{ value: "who-to-call", label: "Who to Call" }]}
          value={tab}
          onChange={setTab}
          ariaLabel="Foreman sections"
        />
        <span className="text-[11px] text-faint font-condensed">more tools coming</span>
      </div>

      {tab === "who-to-call" && <WhoToCallTab />}
    </div>
  );
}
