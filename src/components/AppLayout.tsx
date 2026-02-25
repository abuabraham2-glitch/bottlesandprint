import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { LayoutDashboard, Package, Users, BookOpen, Archive, LogOut, KeyRound, Plus, Mail, PhoneCall, HardDrive, Menu, X } from "lucide-react";
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

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/orders", icon: Package, label: "Orders" },
  { to: "/inbox", icon: Mail, label: "Inbox" },
  { to: "/calls", icon: PhoneCall, label: "Calls" },
  { to: "/clients", icon: Users, label: "Clients" },
  { to: "/catalog", icon: BookOpen, label: "Product Catalog" },
  
  { to: "/completed", icon: Archive, label: "Completed Data" },
  { to: "https://drive.google.com/drive/folders/1jqGJ9lB01He28ReEAB9JQGqQ2m9ajLsY", icon: HardDrive, label: "Google Drive", external: true },
] as const;

interface AppLayoutProps {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <>
      {/* Logo */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
          B
        </div>
        <div className="overflow-hidden">
          <div className="font-sans font-semibold text-sm leading-tight">Bottles & Print</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 space-y-0.5 mt-2 flex-1">
        {navItems.map((item) => {
          const active = location.pathname === item.to;
          if ('external' in item && item.external) {
            return (
              <a
                key={item.to}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onNavigate}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground min-h-[44px]"
              >
                <item.icon size={17} />
                <span>{item.label}</span>
              </a>
            );
          }
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm transition-colors min-h-[44px] ${
                active
                  ? "bg-sidebar-accent text-sidebar-primary font-medium"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <item.icon size={17} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 pb-5 mt-8 space-y-0.5">
        <Link
          to="/change-password"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors w-full min-h-[44px]"
        >
          <KeyRound size={17} />
          <span>Change Password</span>
        </Link>
        <button
          onClick={() => { onNavigate?.(); signOut(); }}
          className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors w-full min-h-[44px]"
        >
          <LogOut size={17} />
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );
}

export default function AppLayout({ children, searchQuery, onSearchChange }: AppLayoutProps) {
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSearchChange = (value: string) => {
    onSearchChange(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value.trim()) {
        navigate("/search");
      }
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

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-52 bg-sidebar text-sidebar-foreground flex-col shrink-0 rounded-3xl m-3 mr-0 overflow-hidden">
        <SidebarNav />
      </aside>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-64 bg-sidebar text-sidebar-foreground p-0 border-0 [&>button]:hidden">
          <div className="flex flex-col h-full">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-auto min-w-0">
        {/* Top banner */}
        <header className="flex items-center justify-between px-4 md:px-6 py-3 shrink-0 gap-2">
          {/* Mobile hamburger */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0 min-w-[44px] min-h-[44px]"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={20} />
          </Button>

          <div className="relative flex-1 max-w-80">
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="bg-card border-0 shadow-sm rounded-xl h-10 md:h-9 text-sm"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-xl gap-1.5 font-sans min-h-[44px] md:min-h-0">
                <Plus size={15} />
                <span className="hidden sm:inline">Quick Create</span>
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
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
