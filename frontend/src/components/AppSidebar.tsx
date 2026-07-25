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
  useSidebar,
} from "@/components/ui/sidebar";
import { Link, useLocation } from "react-router-dom";
import { isDispatcher } from "@/lib/roles";

// `adminOnly` items are owner-only; a dispatcher's nav filters them out (and the
// route guard bounces her if she types the URL). Keep these flags in lockstep
// with ADMIN_ONLY_PREFIXES in lib/roles.
type Leaf = { to: string; label: string; adminOnly?: boolean };
type Group = { label: string; children: Leaf[] };
type Entry = Leaf | Group;
const isGroup = (e: Entry): e is Group => "children" in e;

const nav: Entry[] = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/score", label: "Score a Load" },
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
      { to: "/fuel-entries", label: "Fuel", adminOnly: true },
    ],
  },
  { to: "/compliance", label: "Compliance" },
  { to: "/expenses", label: "Expenses", adminOnly: true },
  { to: "/per-diem", label: "Per Diem", adminOnly: true },
  { to: "/recap", label: "Recap", adminOnly: true },
  { to: "/garage", label: "Garage", adminOnly: true },
  { to: "/trophy-room", label: "Trophy Room", adminOnly: true },
  { to: "/guide", label: "Guide" },
];

// A dispatcher sees only the non-adminOnly items; empty groups drop out.
const navFor = (dispatcher: boolean): Entry[] => {
  if (!dispatcher) return nav;
  return nav
    .map((e) =>
      isGroup(e)
        ? { ...e, children: e.children.filter((c) => !c.adminOnly) }
        : e,
    )
    .filter((e) => (isGroup(e) ? e.children.length > 0 : !e.adminOnly));
};

const AppSidebar = () => {
  const { pathname } = useLocation();
  const dispatcher = isDispatcher();
  const navItems = navFor(dispatcher);
  const active = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");

  // On a phone the sidebar is an off-canvas sheet; tapping a destination should
  // dismiss it so the page is visible, instead of leaving it covering the screen.
  // On desktop the rail is permanent, so this is a no-op there.
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnNav = () => {
    if (isMobile) setOpenMobile(false);
  };

  // A group starts open if it holds the current route; navigating into a group
  // opens it, but manual toggles of the others are preserved.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const e of navItems)
      if (isGroup(e)) init[e.label] = e.children.some((c) => active(c.to));
    return init;
  });

  useEffect(() => {
    for (const e of navItems)
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
            {navItems.map((e) =>
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
                            <Link
                              to={c.to}
                              onClick={closeOnNav}
                              className={linkCls(c.to)}
                            >
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
                    <Link
                      to={e.to}
                      onClick={closeOnNav}
                      className={linkCls(e.to)}
                    >
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
        {!dispatcher && (
          <div className="px-4 pt-2">
            <Link
              to="/settings"
              onClick={closeOnNav}
              className={`text-sm ${linkCls("/settings")}`}
            >
              Settings
            </Link>
          </div>
        )}
        <div className="px-4 pb-4 pt-1 text-sm text-muted-foreground">
          v{__APP_VERSION__}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
