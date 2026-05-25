import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

import { Link } from "react-router-dom";

const AppSidebar = () => {
  return (
    <Sidebar>
      <SidebarHeader>
        <div className="p-4 font-bold text-blue-100 text-xl">Dash</div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/dashboard" className="text-blue-100 font-semibold">
                  Dashboard
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/loads" className="text-slate-400">
                  Loads
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/fuel-entries" className="text-slate-400">
                  Fuel Entries
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/trucks" className="text-slate-400">
                  Trucks
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/drivers" className="text-slate-400">
                  Drivers
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="p-4 text-sm text-muted-foreground">v0.1.0</div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
