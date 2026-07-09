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

import { Link, useLocation } from "react-router-dom";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/loads", label: "Loads" },
  { to: "/trips", label: "Trips" },
  { to: "/lanes", label: "Lanes" },
  { to: "/expenses", label: "Expenses" },
  { to: "/agents", label: "Agents" },
  { to: "/fuel-entries", label: "Fuel Entries" },
  // { to: "/trucks", label: "Trucks" },
  // { to: "/drivers", label: "Drivers" },
];

const AppSidebar = () => {
  const location = useLocation();

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
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.to ||
                location.pathname.startsWith(item.to + "/");

              return (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    asChild
                    className="!bg-transparent hover:!bg-transparent"
                  >
                    <Link
                      to={item.to}
                      className={
                        isActive
                          ? "!text-sidebar-primary font-semibold"
                          : "!text-sidebar-foreground"
                      }
                    >
                      {item.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
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
