import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";
import { Outlet } from "react-router";

const AppLayout = () => {
  return (
    <>
      <SidebarProvider>
        <div className="flex h-screen w-full bg-background">
          <AppSidebar />

          <main className="flex-1 bg-background text-foreground">
            <div className="p-4 border-b">
              <SidebarTrigger />
            </div>

            <div className="p-4">
              <Outlet />
            </div>
          </main>
        </div>
      </SidebarProvider>
    </>
  );
};

export default AppLayout;
