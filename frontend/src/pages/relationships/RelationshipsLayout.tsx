import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { SegmentedTabs } from "@/components/ui/SegmentedTabs";
import { AlertLamp } from "@/components/ui/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { useRelationshipsData } from "@/hooks/useRelationshipsData";
import { isDispatcher } from "@/lib/roles";
import { SYSTEM_START, inboundShare } from "@/lib/metrics/relationships";
import { inboundHeadline } from "@/lib/relationships/inboundHeadline";
import { utcDayKey } from "@/lib/relationships/dayKeys";
import { AgentSheet } from "@/components/relationships/AgentSheet";
import { ProspectSheet } from "@/components/relationships/ProspectSheet";
import { Toast, type ToastState } from "@/components/relationships/Toast";
import { PrimaryButton } from "@/components/relationships/primitives";
import type { TouchPrefill } from "@/components/relationships/LogTouchForm";
import type { RelationshipsContext } from "./context";

// /relationships — the shell: statusbar, the four tabs, one data hook, and
// the hosts for the agent sheet, + Prospect and the toast, so every view
// shares them. Brandie's daily surface; the owner-only controls live inside
// the sheet.

type Tab = "today" | "calls" | "tiers" | "review";
const TABS: { value: Tab; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "calls", label: "Call list" },
  { value: "tiers", label: "Tiers" },
  { value: "review", label: "Review" },
];
const SUB_LINE: Record<Tab, string> = {
  today: "moving here in the next build",
  calls: "moving here in the next build",
  tiers: "the owner sets the tiers — dash only suggests",
  review: "moving here in the next build",
};
const isTab = (v: string | undefined): v is Tab => v === "today" || v === "calls" || v === "tiers" || v === "review";

const TOAST_MS = 6000;

// Shape-matched skeleton for the book while the agents or the loads are in
// flight — a loads retry included, so a failed slice is never shown as zeros.
const BookSkeleton = () => (
  <div className="mt-4 space-y-3">
    <Skeleton className="h-11" style={{ borderRadius: 10 }} />
    <Skeleton className="h-40" style={{ borderRadius: 12 }} />
    <Skeleton className="h-56" style={{ borderRadius: 12 }} />
  </div>
);

const RelationshipsLayout = () => {
  const data = useRelationshipsData();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isAdmin = !isDispatcher();

  const seg = pathname.split("/")[2];
  const tab: Tab = isTab(seg) ? seg : "today";

  const [sheetAgentId, setSheetAgentId] = useState<string | null>(null);
  const [sheetPrefill, setSheetPrefill] = useState<TouchPrefill | undefined>(undefined);
  const [prospectOpen, setProspectOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const notify = useCallback<RelationshipsContext["notify"]>((message, action) => {
    setToast({ id: Date.now(), message, action });
  }, []);
  const openAgent = useCallback<RelationshipsContext["openAgent"]>((agentId, opts) => {
    setSheetPrefill(opts?.prefill);
    setSheetAgentId(agentId);
  }, []);
  const openProspect = useCallback(() => setProspectOpen(true), []);

  // INBOUND since system start — a fraction until ten attributed loads.
  const headline = useMemo(
    () => inboundHeadline(inboundShare(data.loads, SYSTEM_START, utcDayKey(data.now))),
    [data.loads, data.now],
  );

  const ctx: RelationshipsContext = useMemo(
    () => ({ ...data, isAdmin, openAgent, openProspect, notify }),
    [data, isAdmin, openAgent, openProspect, notify],
  );

  const sheetAgent = sheetAgentId ? data.agents.find((a) => a.agent_id === sheetAgentId) ?? null : null;
  const bookError = data.errors.agents ?? data.errors.contacts ?? data.errors.brokers;

  return (
    <div className="min-h-screen text-ink font-body">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-10">
        {/* statusbar — the house pattern */}
        <div className="flex items-center gap-x-[14px] gap-y-2 flex-wrap pt-5 pb-3.5 border-b border-hairline">
          <SidebarTrigger className="text-dim hover:text-ink -ml-1" />
          <h1 className="font-display text-[26px] tracking-[.06em] leading-none">RELATIONSHIPS</h1>
          <span className="font-condensed font-medium text-[15px] text-dim">{SUB_LINE[tab]}</span>
          <span className="flex-1" />
          <Link
            to="/relationships/review"
            title={`inbound share of attributed loads since ${SYSTEM_START}`}
            className="inline-flex items-center gap-2 h-[30px] px-3 rounded-full font-condensed font-semibold text-[13px] bg-gradient-to-b from-plate-a to-plate-lo border-t border-white/10 shadow hover:text-hot"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber" style={{ boxShadow: "0 0 7px rgba(232,148,10,.9)" }} />
            INBOUND {data.loadsLoading ? "…" : data.loadsError ? "—" : headline}
          </Link>
          <PrimaryButton size="md" onClick={openProspect}>
            <UserPlus size={15} /> + Prospect
          </PrimaryButton>
        </div>

        <SegmentedTabs
          tabs={TABS}
          value={tab}
          onChange={(v) => navigate(`/relationships/${v}`)}
          size="md"
          className="mt-3"
          ariaLabel="Relationships views"
        />

        {bookError && (
          <AlertLamp category="book" className="mt-3">
            {bookError} —{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={() => void data.reload()}>
              retry
            </button>
          </AlertLamp>
        )}
        {data.loadsError && (
          <AlertLamp category="loads" className="mt-3">
            loads didn't come through — load counts, RPM and the inbound chip are incomplete ·{" "}
            <button type="button" className="underline underline-offset-2 hover:text-ink" onClick={data.retryLoads}>
              retry
            </button>
          </AlertLamp>
        )}

        {data.loading || data.loadsLoading ? <BookSkeleton /> : <Outlet context={ctx} />}
      </div>

      {sheetAgent && (
        <AgentSheet
          key={sheetAgent.agent_id}
          agent={sheetAgent}
          loads={data.loads}
          contacts={data.contacts}
          coverage={data.coverage}
          ladder={data.ladder}
          now={data.now}
          loadsReady={data.loadsReady}
          isAdmin={isAdmin}
          prefill={sheetPrefill}
          onClose={() => setSheetAgentId(null)}
          reload={data.reload}
          notify={notify}
        />
      )}
      <ProspectSheet
        open={prospectOpen}
        agents={data.agents}
        brokers={data.brokers}
        onClose={() => setProspectOpen(false)}
        onOpenAgent={(id) => openAgent(id)}
        reload={data.reload}
        notify={notify}
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
};

export default RelationshipsLayout;
