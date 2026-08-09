import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import { Outlet, useLocation } from "react-router";
import { isDispatcher } from "@/lib/roles";

// Design System v2 pages are full-bleed — they carry the sidebar trigger in
// their own statusbar (per the approved mockups), so the chrome bar above the
// page disappears for them. Transitional: routes join this list as their
// slice migrates; when every page has, the bar and this list get deleted.
// The owner/dispatcher split matters because /dashboard serves both — the
// dispatcher's board is unmigrated until its slice.
const FULL_BLEED_PREFIXES = ["/dashboard"];
const isFullBleed = (pathname: string) =>
  !isDispatcher() &&
  FULL_BLEED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

const AppLayout = () => {
  const { pathname } = useLocation();
  return (
    <>
      <SidebarProvider>
        <div className="flex h-screen w-full bg-background">
          <AppSidebar />

          {/* min-w-0 lets wide tables scroll inside their card instead of
              forcing the whole page to scroll sideways on a phone; overflow-x-hidden
              is the hard floor — nothing (e.g. the rotated rubber-stamp, whose
              transform sits outside flex layout) can scroll the whole page
              sideways. Wide content that must scroll keeps its own overflow-x-auto
              scroller, so this only clips true page-level overflow, never a table.
              overflow-y stays auto, so vertical scroll and sticky children work. */}
          <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-background text-foreground">
            {!isFullBleed(pathname) && (
              <div className="p-3 border-b border-hairline-lo">
                <SidebarTrigger />
              </div>
            )}

            <Outlet />
          </main>
        </div>
      </SidebarProvider>
    </>
  );
};

export default AppLayout;
