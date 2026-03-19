import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import AppSidebar from "@/components/AppSidebar";

const AppLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <AppSidebar />

        <main className="flex-1">
          <div className="p-4 border-b">
            <SidebarTrigger />
          </div>

          <div className="p-4">{children}</div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default AppLayout;
