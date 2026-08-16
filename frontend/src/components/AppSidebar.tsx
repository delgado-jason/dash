import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Target,
  Phone,
  Package,
  Truck,
  Wallet,
  ShieldCheck,
  Trophy,
  Flame,
  BookOpen,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react";
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
import { sfxEnabled, setSfxEnabled, playSfx } from "@/lib/sfx";

// `adminOnly` items are owner-only; a dispatcher's nav filters them out (and the
// route guard bounces her if she types the URL). Keep these flags in lockstep
// with ADMIN_ONLY_PREFIXES in lib/roles.
type Child = { to: string; label: string; adminOnly?: boolean; dispatcherOnly?: boolean };
type Leaf = Child & { icon: LucideIcon };
type Group = { label: string; icon: LucideIcon; children: Child[] };
type Entry = Leaf | Group;
const isGroup = (e: Entry): e is Group => "children" in e;

// Top level stays short: two quick actions, three grouped areas, three flat
// references. The Money group is entirely owner pages, so it disappears for a
// dispatcher once the admin children filter out.
const nav: Entry[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/score", label: "Score a Load", icon: Target },
  { to: "/foreman", label: "The Foreman", icon: Phone },
  {
    label: "Freight",
    icon: Package,
    children: [
      { to: "/loads", label: "Loads" },
      { to: "/trips", label: "Trips" },
      { to: "/lanes", label: "Lanes" },
      { to: "/agents", label: "Agents" },
      { to: "/vendors", label: "Vendors" },
      { to: "/facilities", label: "Facilities" },
    ],
  },
  {
    label: "Fleet",
    icon: Truck,
    children: [
      { to: "/trucks", label: "Trucks" },
      { to: "/trailers", label: "Trailers" },
      { to: "/drivers", label: "Drivers" },
      { to: "/maintenance", label: "Maintenance" },
      { to: "/fuel-entries", label: "Fuel", adminOnly: true },
    ],
  },
  {
    label: "Money",
    icon: Wallet,
    children: [
      { to: "/expenses", label: "Expenses", adminOnly: true },
      { to: "/market", label: "Market", adminOnly: true },
      { to: "/per-diem", label: "Per Diem", adminOnly: true },
      { to: "/recap", label: "Recap", adminOnly: true },
      { to: "/garage", label: "Garage", adminOnly: true },
    ],
  },
  { to: "/compliance", label: "Compliance", icon: ShieldCheck },
  { to: "/trophy-room", label: "Trophy Room", icon: Trophy, adminOnly: true },
  { to: "/forge", label: "The Forge", icon: Flame, dispatcherOnly: true },
  { to: "/guide", label: "Guide", icon: BookOpen },
];

// A dispatcher sees only the non-adminOnly items; the owner sees everything except
// the dispatcher-only ones (e.g. The Forge, which is each dispatcher's own room).
// Empty groups drop out.
const navFor = (dispatcher: boolean): Entry[] => {
  const drop = (c: Child) => (dispatcher ? c.adminOnly : c.dispatcherOnly);
  return nav
    .map((e) => (isGroup(e) ? { ...e, children: e.children.filter((c) => !drop(c)) } : e))
    .filter((e) => (isGroup(e) ? e.children.length > 0 : !drop(e as Leaf)));
};

const AppSidebar = () => {
  const { pathname } = useLocation();
  const dispatcher = isDispatcher();
  const [sfxOn, setSfxOn] = useState(sfxEnabled());
  const navItems = navFor(dispatcher);
  const active = (to: string) =>
    pathname === to || pathname.startsWith(to + "/");
  const groupOf = (items: Entry[]): string | null =>
    items.find((e) => isGroup(e) && e.children.some((c) => active(c.to)))
      ?.label ?? null;

  // On a phone the sidebar is an off-canvas sheet; tapping a destination should
  // dismiss it so the page is visible, instead of leaving it covering the screen.
  // On desktop the rail is permanent, so this is a no-op there.
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnNav = () => {
    if (isMobile) setOpenMobile(false);
  };

  // Single-open accordion: at most one group is expanded, and it's the one
  // holding the current page. Navigating snaps the open group to the new route
  // (a flat page closes them all), so the list never sprawls.
  const [openGroup, setOpenGroup] = useState<string | null>(() =>
    groupOf(navItems),
  );
  useEffect(() => {
    setOpenGroup(groupOf(navItems));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const toggleGroup = (label: string) =>
    setOpenGroup((cur) => (cur === label ? null : label));

  const linkCls = (to: string) =>
    active(to)
      ? "ds2-nav-active"
      : "!text-sidebar-foreground hover:!text-ink transition-colors";

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="px-4 pt-4 pb-2 font-display text-[22px] tracking-[.05em] leading-none text-ink">
          DASH <span className="text-amber">/</span> DTS
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navItems.map((e) =>
              isGroup(e) ? (
                <SidebarMenuItem key={e.label}>
                  <SidebarMenuButton
                    onClick={() => toggleGroup(e.label)}
                    className="!bg-transparent hover:!bg-transparent justify-between !text-sidebar-foreground hover:!text-ink transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <e.icon size={16} className="shrink-0" />
                      {e.label}
                    </span>
                    {openGroup === e.label ? (
                      <ChevronDown size={16} />
                    ) : (
                      <ChevronRight size={16} />
                    )}
                  </SidebarMenuButton>
                  {openGroup === e.label && (
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
                      className={`flex items-center gap-2.5 ${linkCls(e.to)}`}
                    >
                      <e.icon size={16} className="shrink-0" />
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
        <div className="px-4 pt-2">
          <button
            type="button"
            onClick={() => {
              const next = !sfxOn;
              setSfxOn(next);
              setSfxEnabled(next);
              if (next) playSfx("pow"); // hear it come on
            }}
            className="flex items-center gap-2 text-sm text-faint transition-colors hover:text-ink"
            aria-label={sfxOn ? "Turn sound effects off" : "Turn sound effects on"}
            title={sfxOn ? "Sound on" : "Sound off"}
          >
            {sfxOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>Sound {sfxOn ? "on" : "off"}</span>
          </button>
        </div>
        <div className="px-4 pb-4 pt-1 text-sm text-faint">
          v{__APP_VERSION__}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
