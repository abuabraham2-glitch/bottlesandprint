import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { getStageBadgeClass, getStageLabel } from "@/lib/constants";
import { Search } from "lucide-react";

interface SearchResultsProps {
  searchQuery: string;
}

interface OrderResult {
  id: string;
  item_name: string;
  client_po: string | null;
  vendor_po: string | null;
  stage: string;
  clients: { company: string } | null;
}

interface ArchivedResult {
  id: string;
  year: string | null;
  month: string | null;
  client_company: string | null;
  description: string | null;
  size: string | null;
  quantity: number | null;
}

interface ClientResult {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
}

interface EmailResult {
  id: string;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  category: string | null;
  created_at: string | null;
}

interface CallResult {
  id: string;
  caller_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  call_reason: string | null;
  created_at: string | null;
}

const PREVIEW_LIMIT = 5;

export default function SearchResults({ searchQuery }: SearchResultsProps) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderResult[]>([]);
  const [archived, setArchived] = useState<ArchivedResult[]>([]);
  const [clients, setClients] = useState<ClientResult[]>([]);
  const [emails, setEmails] = useState<EmailResult[]>([]);
  const [calls, setCalls] = useState<CallResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setOrders([]); setArchived([]); setClients([]); setEmails([]); setCalls([]);
      return;
    }

    const doSearch = async () => {
      setLoading(true);
      const term = `%${searchQuery.trim()}%`;

      const [orderRes, orderByClient, archRes, clientRes, emailRes, callRes] = await Promise.all([
        supabase.from("orders").select("id, item_name, client_po, vendor_po, stage, clients!inner(company)")
          .eq("archived", false)
          .or(`item_name.ilike.${term},client_po.ilike.${term},vendor_po.ilike.${term},invoice_num.ilike.${term},clients.company.ilike.${term}`)
          .limit(PREVIEW_LIMIT),
        supabase.from("orders").select("id, item_name, client_po, vendor_po, stage, clients!inner(company)")
          .eq("archived", false).ilike("clients.company" as any, term).limit(PREVIEW_LIMIT),
        supabase.from("archived_orders").select("id, year, month, client_company, description, size, quantity")
          .or(`client_company.ilike.${term},description.ilike.${term}`).limit(PREVIEW_LIMIT),
        supabase.from("clients").select("id, company, contact_name, email")
          .or(`company.ilike.${term},contact_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`).limit(PREVIEW_LIMIT),
        supabase.from("emails").select("id, from_name, from_email, subject, category, created_at")
          .or(`from_email.ilike.${term},from_name.ilike.${term},subject.ilike.${term},body.ilike.${term}`).limit(PREVIEW_LIMIT),
        supabase.from("calls").select("id, caller_name, company_name, phone_number, call_reason, created_at")
          .or(`caller_name.ilike.${term},company_name.ilike.${term},phone_number.ilike.${term},call_reason.ilike.${term}`).limit(PREVIEW_LIMIT),
      ]);

      const allOrders = [...(orderRes.data || []), ...(orderByClient.data || [])];
      const uniqueOrders = Array.from(new Map(allOrders.map(o => [o.id, o])).values()).slice(0, PREVIEW_LIMIT);
      setOrders(uniqueOrders as unknown as OrderResult[]);
      setArchived((archRes.data || []) as ArchivedResult[]);
      setClients((clientRes.data || []) as ClientResult[]);
      setEmails((emailRes.data || []) as EmailResult[]);
      setCalls((callRes.data || []) as CallResult[]);
      setLoading(false);
    };

    doSearch();
  }, [searchQuery]);

  const noResults = !loading && orders.length === 0 && archived.length === 0 && clients.length === 0 && emails.length === 0 && calls.length === 0;

  if (!searchQuery.trim()) {
    return (
      <div className="p-6 max-w-[1400px]">
        <h1 className="text-2xl font-serif mb-4">Search</h1>
        <p className="text-muted-foreground font-sans">Type in the search bar to find orders, clients, emails, calls, and more.</p>
      </div>
    );
  }

  const renderSection = (title: string, count: number, children: React.ReactNode) => count > 0 ? (
    <div>
      <h2 className="text-lg font-serif mb-2">{title} ({count})</h2>
      {children}
    </div>
  ) : null;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center gap-2">
        <Search size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-serif">Results for "{searchQuery}"</h1>
      </div>

      {loading && <div className="text-muted-foreground font-sans">Searching...</div>}
      {noResults && <div className="text-muted-foreground py-8 text-center font-sans">No results found for "{searchQuery}"</div>}

      {/* Clients */}
      {renderSection("Clients", clients.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Contact</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Email</th>
            </tr></thead>
            <tbody>{clients.map(c => (
              <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3 font-medium">{c.company}</td>
                <td className="p-3">{c.contact_name || "—"}</td>
                <td className="p-3 text-muted-foreground">{c.email || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Active Orders */}
      {renderSection("Active Orders", orders.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Item</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Client PO</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Stage</th>
            </tr></thead>
            <tbody>{orders.map(o => (
              <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3 font-medium">{o.item_name}</td>
                <td className="p-3">{o.clients?.company}</td>
                <td className="p-3 text-muted-foreground">{o.client_po || "—"}</td>
                <td className="p-3"><Badge variant="secondary" className={`text-xs ${getStageBadgeClass(o.stage)}`}>{getStageLabel(o.stage)}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Emails */}
      {renderSection("Emails", emails.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">From</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Subject</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Category</th>
            </tr></thead>
            <tbody>{emails.map(e => (
              <tr key={e.id} onClick={() => navigate("/inbox")} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3 font-medium">{e.from_name || e.from_email}</td>
                <td className="p-3">{e.subject}</td>
                <td className="p-3 text-muted-foreground">{e.category || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Calls */}
      {renderSection("Calls", calls.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Caller</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Company</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Reason</th>
            </tr></thead>
            <tbody>{calls.map(c => (
              <tr key={c.id} onClick={() => navigate("/calls")} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <td className="p-3 font-medium">{c.caller_name || "Unknown"}</td>
                <td className="p-3">{c.company_name || "—"}</td>
                <td className="p-3 text-muted-foreground truncate max-w-xs">{c.call_reason || "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {/* Archived Orders */}
      {renderSection("Archived Orders", archived.length, (
        <div className="bg-card rounded-2xl border overflow-hidden">
          <table className="w-full text-sm font-sans">
            <thead><tr className="border-b bg-muted/40">
              <th className="text-left p-3 font-medium text-muted-foreground">Year</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
              <th className="text-left p-3 font-medium text-muted-foreground">Qty</th>
            </tr></thead>
            <tbody>{archived.map(a => (
              <tr key={a.id} className="border-b last:border-b-0">
                <td className="p-3">{a.year}</td>
                <td className="p-3">{a.client_company}</td>
                <td className="p-3">{a.description}</td>
                <td className="p-3">{a.quantity?.toLocaleString()}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
