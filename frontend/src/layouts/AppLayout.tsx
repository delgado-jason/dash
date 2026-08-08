import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import { Outlet } from "react-router";

const AppLayout = () => {
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
            <div className="p-3 border-b border-hairline-lo">
              <SidebarTrigger />
            </div>

            <Outlet />
          </main>
        </div>
      </SidebarProvider>
    </>
  );
};

export default AppLayout;
