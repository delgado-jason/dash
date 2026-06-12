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
        <div className="p-4 font-bold text-sidebar-foreground text-xl">
          Dash
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link
                  to="/dashboard"
                  className="text-sidebar-primary font-semibold"
                >
                  Dashboard
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/loads" className="text-sidebar-foreground">
                  Loads
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/fuel-entries" className="text-sidebar-foreground">
                  Fuel Entries
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/trucks" className="text-sidebar-foreground">
                  Trucks
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                className="!bg-transparent hover:!bg-transparent"
              >
                <Link to="/drivers" className="text-sidebar-foreground">
                  Drivers
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="p-4 text-sm text-muted-foreground">
          v{__APP_VERSION__}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
