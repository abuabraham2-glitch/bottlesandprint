import { useState } from "react";
import { useParams } from "react-router-dom";
import { useClient, useOrders, useCatalog } from "@/lib/data";
import { getStageBadgeClass, getStageLabel, formatAddress } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, CheckCircle, XCircle, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ClientForm } from "./Clients";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading } = useClient(id!);
  const { data: orders = [] } = useOrders(true);
  const { data: catalog = [] } = useCatalog(id);
  const [editOpen, setEditOpen] = useState(false);

  const clientOrders = orders.filter(o => o.client_id === id);

  if (isLoading || !client) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const addr = formatAddress(client.street_address, client.city, client.state, client.zip);
  const billingAddr = formatAddress(client.billing_street, client.billing_city, client.billing_state, client.billing_zip);

  return (
    <div className="p-6 space-y-6 max-w-[1200px]">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft size={16} /></Button>
        <h1 className="text-2xl font-bold">{client.company}</h1>
        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil size={14} className="mr-1" /> Edit</Button>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-3">Contact Info</h3>
          <div className="space-y-2 text-sm">
            <Row label="Contact" value={client.contact_name} />
            <Row label="Email" value={client.email} />
            <Row label="Phone" value={client.phone} />
            <div className="flex justify-between items-start">
              <span className="text-muted-foreground">Address</span>
              <span className="text-right whitespace-pre-line">{addr || "—"}</span>
            </div>
            <div className="flex justify-between items-start">
              <span className="text-muted-foreground">Billing</span>
              <span className="text-right whitespace-pre-line">{billingAddr || "—"}</span>
            </div>
          </div>
        </div>
        <div className="bg-card rounded-lg border p-5">
          <h3 className="font-semibold mb-3">Status</h3>
          <div className="flex items-center gap-2 text-sm mb-2">
            {client.form_signed ? (
              <><CheckCircle size={16} className="text-green-600" /> Client form signed</>
            ) : (
              <><XCircle size={16} className="text-destructive" /> Client form not signed</>
            )}
          </div>
        </div>
      </div>

      {/* Catalog */}
      {catalog.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3">Product Catalog</h3>
          <div className="bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-left p-3 font-medium">Size</th>
                <th className="text-left p-3 font-medium">Component</th>
                <th className="text-left p-3 font-medium">Material</th>
                <th className="text-left p-3 font-medium">Colors</th>
                <th className="text-left p-3 font-medium">Last Run</th>
              </tr></thead>
              <tbody>
                {catalog.map(item => (
                  <tr key={item.id} className="border-b last:border-b-0">
                    <td className="p-3 font-medium">{item.product_name}</td>
                    <td className="p-3">{item.size}</td>
                    <td className="p-3">{item.component}</td>
                    <td className="p-3">{item.material}</td>
                    <td className="p-3">{item.print_colors}</td>
                    <td className="p-3">{item.last_run || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Orders */}
      <div>
        <h3 className="font-semibold mb-3">Order History ({clientOrders.length})</h3>
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Item</th>
              <th className="text-left p-3 font-medium">Size</th>
              <th className="text-left p-3 font-medium">Qty</th>
              <th className="text-left p-3 font-medium">Stage</th>
              <th className="text-left p-3 font-medium">Due</th>
            </tr></thead>
            <tbody>
              {clientOrders.map(order => (
                <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                  <td className="p-3 font-medium">{order.item_name}</td>
                  <td className="p-3">{order.bottle_size}</td>
                  <td className="p-3">{order.quantity?.toLocaleString()}</td>
                  <td className="p-3"><Badge variant="secondary" className={`text-xs ${getStageBadgeClass(order.stage)}`}>{getStageLabel(order.stage)}</Badge></td>
                  <td className="p-3">{order.due_date || "—"}</td>
                </tr>
              ))}
              {clientOrders.length === 0 && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Client Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          <ClientForm initialData={client} onSuccess={() => { setEditOpen(false); toast.success("Client updated"); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}
