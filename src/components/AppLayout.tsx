import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { LayoutDashboard, Package, Users, BookOpen, Archive, LogOut, KeyRound, Plus, Mail, PhoneCall, HardDrive, FileImage } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
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
  { to: "/proofs", icon: FileImage, label: "Proofs" },
  { to: "/completed", icon: Archive, label: "Completed Data" },
  { to: "https://drive.google.com/drive/folders/1jqGJ9lB01He28ReEAB9JQGqQ2m9ajLsY", icon: HardDrive, label: "Google Drive", external: true },
] as const;

interface AppLayoutProps {
  children: React.ReactNode;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function AppLayout({ children, searchQuery, onSearchChange }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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
      {/* Sidebar */}
      <aside className="w-52 bg-sidebar text-sidebar-foreground flex flex-col shrink-0 rounded-3xl m-3 mr-0 overflow-hidden">
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
        <nav className="px-3 space-y-0.5 mt-2">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            if ('external' in item && item.external) {
              return (
                <a
                  key={item.to}
                  href={item.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
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
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors w-full"
          >
            <KeyRound size={17} />
            <span>Change Password</span>
          </Link>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors w-full"
          >
            <LogOut size={17} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-auto">
        {/* Top banner */}
        <header className="flex items-center justify-between px-6 py-3 shrink-0">
          <div className="relative w-80">
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="bg-card border-0 shadow-sm rounded-xl h-9 text-sm"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-xl gap-1.5 font-sans">
                <Plus size={15} />
                Quick Create
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => navigate("/orders", { state: { openNew: true } })}>
                <Package size={15} className="mr-2" />
                New Order
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/clients", { state: { openNew: true } })}>
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
