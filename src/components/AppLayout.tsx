import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { LayoutDashboard, Package, Users, BookOpen, Archive, LogOut, KeyRound, Plus, Mail, PhoneCall, HardDrive, Menu, BarChart3, Moon, Sun, PanelLeftClose, PanelLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navGroup1 = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/orders", icon: Package, label: "Orders" },
  { to: "/inbox", icon: Mail, label: "Inbox" },
  { to: "/calls", icon: PhoneCall, label: "Calls" },
];

const navGroup2 = [
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/catalog", icon: BookOpen, label: "Product Catalog" },
  { to: "/completed", icon: Archive, label: "Completed Data" },
  { to: "/stats", icon: BarChart3, label: "Stats" },
  { to: "https://drive.google.com/drive/folders/1jqGJ9lB01He28ReEAB9JQGqQ2m9ajLsY", icon: HardDrive, label: "Google Drive", external: true },
] as const;

interface AppLayoutProps {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function TogglePill({ active, onClick, icon: Icon, label, collapsed }: { active: boolean; onClick: () => void; icon: any; label: string; collapsed: boolean }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors w-full min-h-[44px]"
      style={{ color: 'rgba(255,255,255,0.46)' }}
    >
      <Icon size={16} className="shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{label}</span>
          <div className={`w-7 h-4 rounded-full relative transition-colors ${active ? 'bg-primary' : 'bg-sidebar-accent'}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${active ? 'left-3.5' : 'left-0.5'}`} />
          </div>
        </>
      )}
    </button>
  );
}

function NavItem({ item, active, collapsed, onNavigate }: { item: any; active: boolean; collapsed: boolean; onNavigate?: () => void }) {
  const baseClass = `flex items-center gap-3 rounded-xl text-[13px] font-medium transition-colors min-h-[44px] ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-3'}`;
  const activeClass = active ? "bg-primary text-white" : "hover:bg-sidebar-accent";
  const textStyle = active ? {} : { color: 'rgba(255,255,255,0.46)' };

  if (item.external) {
    return (
      <a href={item.to} target="_blank" rel="noopener noreferrer" onClick={onNavigate}
        className={baseClass + ' ' + activeClass} style={textStyle}
        title={collapsed ? item.label : undefined}>
        <item.icon size={17} className="shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </a>
    );
  }
  return (
    <Link to={item.to} onClick={onNavigate}
      className={baseClass + ' ' + activeClass} style={textStyle}
      title={collapsed ? item.label : undefined}>
      <item.icon size={17} className="shrink-0" />
      {!collapsed && <span>{item.label}</span>}
    </Link>
  );
}

function SidebarDivider() {
  return <div className="my-2 mx-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />;
}

function SidebarNav({ onNavigate, collapsed, onToggleCollapse, darkMode, onToggleDark }: {
  onNavigate?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <>
      {/* Logo */}
      <div className={`p-4 flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
          B
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="font-semibold text-sm leading-tight text-sidebar-foreground">Bottles & Print</div>
          </div>
        )}
      </div>

      {/* Nav Group 1: Operations */}
      <nav className={`space-y-0.5 mt-2 flex-1 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {navGroup1.map((item) => (
          <NavItem key={item.to} item={item} active={location.pathname === item.to} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        <SidebarDivider />

        {/* Nav Group 2: Business */}
        {navGroup2.map((item) => (
          <NavItem key={item.to} item={item} active={location.pathname === item.to} collapsed={collapsed} onNavigate={onNavigate} />
        ))}

        <SidebarDivider />

        {/* Group 3: Preferences */}
        <TogglePill active={collapsed} onClick={onToggleCollapse} icon={collapsed ? PanelLeft : PanelLeftClose} label="Focus Mode" collapsed={collapsed} />
        <TogglePill active={darkMode} onClick={onToggleDark} icon={darkMode ? Sun : Moon} label="Dark Mode" collapsed={collapsed} />
      </nav>

      {/* Bottom actions */}
      <div className={`pb-4 mt-4 space-y-0.5 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        <SidebarDivider />
        <Link to="/change-password" onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl text-[13px] font-medium transition-colors w-full min-h-[44px] hover:bg-sidebar-accent ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-3'}`}
          style={{ color: 'rgba(255,255,255,0.46)' }}
          title={collapsed ? 'Change Password' : undefined}>
          <KeyRound size={16} className="shrink-0" />
          {!collapsed && <span>Change Password</span>}
        </Link>
        <button onClick={() => { onNavigate?.(); signOut(); }}
          className={`flex items-center gap-3 rounded-xl text-[13px] font-medium transition-colors w-full min-h-[44px] hover:bg-sidebar-accent ${collapsed ? 'justify-center px-2 py-3' : 'px-3 py-3'}`}
          style={{ color: 'rgba(255,255,255,0.46)' }}>
          <LogOut size={16} className="shrink-0" />
          {!collapsed && <span>Sign Out</span>}
        </button>
      </div>
    </>
  );
}

export default function AppLayout({ children, searchQuery, onSearchChange }: AppLayoutProps) {
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('dark_mode') === 'true');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('dark_mode', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(collapsed));
  }, [collapsed]);

  const handleSearchChange = (value: string) => {
    onSearchChange(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) navigate("/search");
    }, 300);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      navigate("/search");
    }
  };

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  const sidebarWidth = collapsed ? 'w-[58px]' : 'w-[224px]';

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex ${sidebarWidth} bg-sidebar text-sidebar-foreground flex-col shrink-0 rounded-2xl m-2 mr-0 overflow-hidden transition-all duration-300`}>
        <SidebarNav collapsed={collapsed} onToggleCollapse={() => setCollapsed(c => !c)} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />
      </aside>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0 border-0 [&>button]:hidden">
          <div className="flex flex-col h-full">
            <SidebarNav onNavigate={() => setMobileOpen(false)} collapsed={false} onToggleCollapse={() => {}} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-auto min-w-0">
        {/* Top bar */}
        <header className="flex items-center justify-between px-3 md:px-6 h-[50px] md:h-[58px] shrink-0 bg-surface border-b" style={{ borderBottomWidth: '1.5px' }}>
          {/* Mobile hamburger */}
          <Button variant="ghost" size="icon" className="md:hidden shrink-0 min-w-[44px] min-h-[44px]" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </Button>

          <div className="relative flex-1 max-w-80">
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="bg-background border-[1.5px] border-border-mid rounded-[9px] h-10 md:h-9 text-sm focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/[0.08]"
            />
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="rounded-[9px] gap-1.5 font-bold min-h-[44px] md:min-h-0 shadow-[0_3px_12px_rgba(37,99,235,0.28)]">
                  <Plus size={15} />
                  <span className="hidden xs:inline">Quick Create</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => navigate("/orders", { state: { openNew: true } })} className="min-h-[44px]">
                  <Package size={15} className="mr-2" />
                  New Order
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/clients", { state: { openNew: true } })} className="min-h-[44px]">
                  <Users size={15} className="mr-2" />
                  New Client
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
