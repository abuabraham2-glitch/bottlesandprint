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

const PREVIEW_LIMIT = 10;

export default function SearchResults({ searchQuery }: SearchResultsProps) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderResult[]>([]);
  const [archived, setArchived] = useState<ArchivedResult[]>([]);
  const [clients, setClients] = useState<ClientResult[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [archivedTotal, setArchivedTotal] = useState(0);
  const [clientsTotal, setClientsTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [showAllArchived, setShowAllArchived] = useState(false);
  const [showAllClients, setShowAllClients] = useState(false);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setOrders([]);
      setArchived([]);
      setClients([]);
      setOrdersTotal(0);
      setArchivedTotal(0);
      setClientsTotal(0);
      return;
    }

    const doSearch = async () => {
      setLoading(true);
      const term = `%${searchQuery.trim()}%`;

      // Search active orders - search item_name, client_po, vendor_po directly
      // and also filter by client company via a separate approach
      const { data: orderData, count: oCount } = await supabase
        .from("orders")
        .select("id, item_name, client_po, vendor_po, stage, clients!inner(company)", { count: "exact" })
        .eq("archived", false)
        .or(`item_name.ilike.${term},client_po.ilike.${term},vendor_po.ilike.${term},clients.company.ilike.${term}`)
        .limit(showAllOrders ? 100 : PREVIEW_LIMIT);
      
      // Also search orders where client company matches but other fields don't
      const { data: orderByClient } = await supabase
        .from("orders")
        .select("id, item_name, client_po, vendor_po, stage, clients!inner(company)")
        .eq("archived", false)
        .ilike("clients.company" as any, term)
        .limit(showAllOrders ? 100 : PREVIEW_LIMIT);

      // Merge and deduplicate
      const allOrders = [...(orderData || []), ...(orderByClient || [])];
      const uniqueOrders = Array.from(new Map(allOrders.map(o => [o.id, o])).values());
      
      setOrders(uniqueOrders.slice(0, showAllOrders ? 100 : PREVIEW_LIMIT) as unknown as OrderResult[]);
      setOrdersTotal(Math.max(oCount || 0, uniqueOrders.length));

      // Search archived orders
      const { data: archData, count: aCount } = await supabase
        .from("archived_orders")
        .select("id, year, month, client_company, description, size, quantity", { count: "exact" })
        .or(`client_company.ilike.${term},description.ilike.${term}`)
        .limit(showAllArchived ? 100 : PREVIEW_LIMIT);

      setArchived((archData || []) as ArchivedResult[]);
      setArchivedTotal(aCount || 0);

      // Search clients
      const { data: clientData, count: cCount } = await supabase
        .from("clients")
        .select("id, company, contact_name, email", { count: "exact" })
        .or(`company.ilike.${term},contact_name.ilike.${term},email.ilike.${term}`)
        .limit(showAllClients ? 100 : PREVIEW_LIMIT);

      setClients((clientData || []) as ClientResult[]);
      setClientsTotal(cCount || 0);

      setLoading(false);
    };

    doSearch();
  }, [searchQuery, showAllOrders, showAllArchived, showAllClients]);

  const noResults = !loading && orders.length === 0 && archived.length === 0 && clients.length === 0;

  if (!searchQuery.trim()) {
    return (
      <div className="p-6 max-w-[1400px]">
        <h1 className="text-2xl font-bold mb-4">Search</h1>
        <p className="text-muted-foreground">Type in the sidebar search to find orders, clients, and completed data.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center gap-2">
        <Search size={20} className="text-muted-foreground" />
        <h1 className="text-2xl font-bold">Results for "{searchQuery}"</h1>
      </div>

      {loading && <div className="text-muted-foreground">Searching...</div>}

      {noResults && (
        <div className="text-muted-foreground py-8 text-center">No results found for "{searchQuery}"</div>
      )}

      {/* Active Orders */}
      {orders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Active Orders ({ordersTotal})</h2>
          <div className="bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Item</th>
                  <th className="text-left p-3 font-medium">Client</th>
                  <th className="text-left p-3 font-medium">Client PO</th>
                  <th className="text-left p-3 font-medium">Vendor PO</th>
                  <th className="text-left p-3 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} onClick={() => navigate(`/orders/${o.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                    <td className="p-3 font-medium">{o.item_name}</td>
                    <td className="p-3">{o.clients?.company}</td>
                    <td className="p-3 text-muted-foreground">{o.client_po || "—"}</td>
                    <td className="p-3 text-muted-foreground">{o.vendor_po || "—"}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={`text-xs ${getStageBadgeClass(o.stage)}`}>
                        {getStageLabel(o.stage)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ordersTotal > PREVIEW_LIMIT && !showAllOrders && (
              <button onClick={() => setShowAllOrders(true)} className="w-full p-3 text-sm text-primary hover:bg-muted/30 border-t">
                Show all {ordersTotal} results
              </button>
            )}
          </div>
        </div>
      )}

      {/* Archived Orders */}
      {archived.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Completed / Archived Orders ({archivedTotal})</h2>
          <div className="bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Year</th>
                  <th className="text-left p-3 font-medium">Month</th>
                  <th className="text-left p-3 font-medium">Client</th>
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Size</th>
                  <th className="text-left p-3 font-medium">Qty</th>
                </tr>
              </thead>
              <tbody>
                {archived.map(a => (
                  <tr key={a.id} className="border-b last:border-b-0">
                    <td className="p-3">{a.year}</td>
                    <td className="p-3">{a.month}</td>
                    <td className="p-3">{a.client_company}</td>
                    <td className="p-3">{a.description}</td>
                    <td className="p-3">{a.size}</td>
                    <td className="p-3">{a.quantity?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {archivedTotal > PREVIEW_LIMIT && !showAllArchived && (
              <button onClick={() => setShowAllArchived(true)} className="w-full p-3 text-sm text-primary hover:bg-muted/30 border-t">
                Show all {archivedTotal} results
              </button>
            )}
          </div>
        </div>
      )}

      {/* Clients */}
      {clients.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2">Clients ({clientsTotal})</h2>
          <div className="bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Company</th>
                  <th className="text-left p-3 font-medium">Contact</th>
                  <th className="text-left p-3 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {clients.map(c => (
                  <tr key={c.id} onClick={() => navigate(`/clients/${c.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                    <td className="p-3 font-medium">{c.company}</td>
                    <td className="p-3">{c.contact_name || "—"}</td>
                    <td className="p-3 text-muted-foreground">{c.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clientsTotal > PREVIEW_LIMIT && !showAllClients && (
              <button onClick={() => setShowAllClients(true)} className="w-full p-3 text-sm text-primary hover:bg-muted/30 border-t">
                Show all {clientsTotal} results
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
