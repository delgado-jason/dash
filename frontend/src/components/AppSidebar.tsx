import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "react-router-dom";

type Leaf = { to: string; label: string };
type Group = { label: string; children: Leaf[] };
type Entry = Leaf | Group;
const isGroup = (e: Entry): e is Group => "children" in e;

const nav: Entry[] = [
  { to: "/dashboard", label: "Dashboard" },
  {
    label: "Freight",
    children: [
      { to: "/loads", label: "Loads" },
      { to: "/trips", label: "Trips" },
      { to: "/lanes", label: "Lanes" },
      { to: "/agents", label: "Agents" },
      { to: "/facilities", label: "Facilities" },
    ],
  },
  {
    label: "Fleet",
    children: [
      { to: "/trucks", label: "Trucks" },
      { to: "/trailers", label: "Trailers" },
      { to: "/drivers", label: "Drivers" },
      { to: "/maintenance", label: "Maintenance" },
      { to: "/fuel-entries", label: "Fuel" },
    ],
  },
  { to: "/compliance", label: "Compliance" },
  { to: "/expenses", label: "Expenses" },
  { to: "/recap", label: "Recap" },
  { to: "/trophy-room", label: "Trophy Room" },
  { to: "/guide", label: "Guide" },
];

const AppSidebar = () => {
  const { pathname } = useLocation();
  const active = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  // A group starts open if it holds the current route; navigating into a group
  // opens it, but manual toggles of the others are preserved.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const e of nav)
      if (isGroup(e)) init[e.label] = e.children.some((c) => active(c.to));
    return init;
  });

  useEffect(() => {
    for (const e of nav)
      if (isGroup(e) && e.children.some((c) => active(c.to)))
        setOpen((o) => ({ ...o, [e.label]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const linkCls = (to: string) =>
    active(to)
      ? "!text-sidebar-primary font-semibold"
      : "!text-sidebar-foreground";

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="p-4 font-bold text-sidebar-foreground text-xl">Dash</div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {nav.map((e) =>
              isGroup(e) ? (
                <SidebarMenuItem key={e.label}>
                  <SidebarMenuButton
                    onClick={() =>
                      setOpen((o) => ({ ...o, [e.label]: !o[e.label] }))
                    }
                    className="!bg-transparent hover:!bg-transparent justify-between !text-sidebar-foreground"
                  >
                    <span>{e.label}</span>
                    {open[e.label] ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </SidebarMenuButton>
                  {open[e.label] && (
                    <SidebarMenuSub>
                      {e.children.map((c) => (
                        <SidebarMenuSubItem key={c.to}>
                          <SidebarMenuSubButton
                            asChild
                            className="!bg-transparent hover:!bg-transparent"
                          >
                            <Link to={c.to} className={linkCls(c.to)}>
                              {c.label}
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  )}
                </SidebarMenuItem>
              ) : (
                <SidebarMenuItem key={e.to}>
                  <SidebarMenuButton
                    asChild
                    className="!bg-transparent hover:!bg-transparent"
                  >
                    <Link to={e.to} className={linkCls(e.to)}>
                      {e.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ),
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-4 pt-2">
          <Link to="/settings" className={`text-sm ${linkCls("/settings")}`}>
            Settings
          </Link>
        </div>
        <div className="px-4 pb-4 pt-1 text-sm text-muted-foreground">
          v{__APP_VERSION__}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
