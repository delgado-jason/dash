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
              forcing the whole page to scroll sideways on a phone. */}
          <main className="flex-1 min-w-0 overflow-y-auto bg-background text-foreground">
            <div className="p-3 border-b border-border">
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
