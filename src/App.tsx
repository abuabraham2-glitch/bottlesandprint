import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Clients from "@/pages/Clients";
import ClientDetail from "@/pages/ClientDetail";
import Catalog from "@/pages/Catalog";
import CompletedData from "@/pages/CompletedData";
import ChangePassword from "@/pages/ChangePassword";
import SearchResults from "@/pages/SearchResults";
import Inbox from "@/pages/Inbox";
import CallsPage from "@/pages/Calls";
import Login from "@/pages/Login";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      refetchOnWindowFocus: true,
    },
  },
});

function ProtectedApp() {
  const { session, loading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-amber-600 animate-pulse" />
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <AppLayout searchQuery={searchQuery} onSearchChange={setSearchQuery}>
      <Routes>
        <Route path="/" element={<Dashboard searchQuery={searchQuery} />} />
        <Route path="/orders" element={<Orders searchQuery={searchQuery} />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/calls" element={<CallsPage />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/:id" element={<ClientDetail />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/completed" element={<CompletedData />} />
        <Route path="/search" element={<SearchResults searchQuery={searchQuery} />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/*" element={<AuthProvider><ProtectedApp /></AuthProvider>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
