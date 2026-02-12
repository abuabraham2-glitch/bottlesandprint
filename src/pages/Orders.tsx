import { useState } from "react";
import { useOrders, useClients, useCatalog, useCreateOrder } from "@/lib/data";
import { getStageBadgeClass, getStageLabel, BOTTLE_TYPES, MATERIALS, COLORS } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { format, addWeeks } from "date-fns";

interface OrdersProps {
  searchQuery: string;
}

export default function Orders({ searchQuery }: OrdersProps) {
  const { data: orders = [], isLoading } = useOrders();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = searchQuery
    ? orders.filter(o =>
        o.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.clients?.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.client_po?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.vendor_po?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : orders;

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Orders</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus size={16} className="mr-2" /> New Order</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Order</DialogTitle>
            </DialogHeader>
            <NewOrderForm onSuccess={() => { setDialogOpen(false); toast.success("Order created"); }} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Client PO</th>
                <th className="text-left p-3 font-medium">Client</th>
                <th className="text-left p-3 font-medium">Item</th>
                <th className="text-left p-3 font-medium">Size</th>
                <th className="text-left p-3 font-medium">Qty</th>
                <th className="text-left p-3 font-medium">Due</th>
                <th className="text-left p-3 font-medium">Stage</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => navigate(`/orders/${order.id}`)}
                  className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                >
                  <td className="p-3 text-muted-foreground">{order.client_po || "—"}</td>
                  <td className="p-3">{order.clients?.company}</td>
                  <td className="p-3 font-medium">{order.item_name}</td>
                  <td className="p-3">{order.bottle_size}</td>
                  <td className="p-3">{order.quantity?.toLocaleString()}</td>
                  <td className="p-3">{order.due_date || "—"}</td>
                  <td className="p-3">
                    <Badge variant="secondary" className={`text-xs ${getStageBadgeClass(order.stage)}`}>
                      {getStageLabel(order.stage)}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NewOrderForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: clients = [] } = useClients();
  const createOrder = useCreateOrder();
  const [clientId, setClientId] = useState("");
  const { data: catalogItems = [] } = useCatalog(clientId || undefined);
  const [catalogItemId, setCatalogItemId] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");
  const fourWeeks = format(addWeeks(new Date(), 4), "yyyy-MM-dd");

  const [form, setForm] = useState({
    item_name: "",
    bottle_type: "",
    bottle_size: "",
    material: "",
    bottle_color: "",
    num_colors: "",
    print_colors: "",
    quantity: "",
    packing: "",
    client_po: "",
    notes: "",
    date_entered: today,
    due_date: fourWeeks,
  });

  const handleCatalogSelect = (itemId: string) => {
    setCatalogItemId(itemId);
    const item = catalogItems.find(c => c.id === itemId);
    if (item) {
      setForm(prev => ({
        ...prev,
        item_name: item.product_name,
        bottle_type: item.component || "",
        bottle_size: item.size || "",
        material: item.material || "",
        bottle_color: item.container_color || "",
        num_colors: item.num_colors?.toString() || "",
        print_colors: item.print_colors || "",
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !form.item_name) return;
    await createOrder.mutateAsync({
      client_id: clientId,
      item_name: form.item_name,
      bottle_type: form.bottle_type || null,
      bottle_size: form.bottle_size || null,
      material: form.material || null,
      bottle_color: form.bottle_color || null,
      num_colors: form.num_colors ? parseInt(form.num_colors) : null,
      print_colors: form.print_colors || null,
      quantity: form.quantity ? parseInt(form.quantity) : null,
      packing: form.packing || null,
      client_po: form.client_po || null,
      notes: form.notes || null,
      date_entered: form.date_entered,
      due_date: form.due_date,
      stage: "preflight",
    });
    onSuccess();
  };

  const update = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label>Client *</Label>
        <Select value={clientId} onValueChange={(v) => { setClientId(v); setCatalogItemId(""); }}>
          <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
          <SelectContent>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {clientId && catalogItems.length > 0 && (
        <div>
          <Label>From Catalog (optional)</Label>
          <Select value={catalogItemId} onValueChange={handleCatalogSelect}>
            <SelectTrigger><SelectValue placeholder="Pick existing product or enter new" /></SelectTrigger>
            <SelectContent>
              {catalogItems.map(c => <SelectItem key={c.id} value={c.id}>{c.product_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label>Item Name *</Label>
        <Input value={form.item_name} onChange={e => update("item_name", e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Container Type</Label>
          <Select value={form.bottle_type} onValueChange={v => update("bottle_type", v)}>
            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
            <SelectContent>{BOTTLE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Size</Label>
          <Input value={form.bottle_size} onChange={e => update("bottle_size", e.target.value)} placeholder="e.g. 2oz, 10ml" />
        </div>
        <div>
          <Label>Material</Label>
          <Select value={form.material} onValueChange={v => update("material", v)}>
            <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
            <SelectContent>{MATERIALS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Color</Label>
          <Select value={form.bottle_color} onValueChange={v => update("bottle_color", v)}>
            <SelectTrigger><SelectValue placeholder="Select color" /></SelectTrigger>
            <SelectContent>{COLORS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label># Print Colors</Label>
          <Input type="number" value={form.num_colors} onChange={e => update("num_colors", e.target.value)} />
        </div>
        <div>
          <Label>PMS Colors</Label>
          <Input value={form.print_colors} onChange={e => update("print_colors", e.target.value)} />
        </div>
        <div>
          <Label>Quantity</Label>
          <Input type="number" value={form.quantity} onChange={e => update("quantity", e.target.value)} />
        </div>
        <div>
          <Label>Packing</Label>
          <Input value={form.packing} onChange={e => update("packing", e.target.value)} placeholder="e.g. 8 cases @ 130/case" />
        </div>
      </div>

      <div>
        <Label>Client PO #</Label>
        <Input value={form.client_po} onChange={e => update("client_po", e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Date Entered</Label>
          <Input type="date" value={form.date_entered} onChange={e => update("date_entered", e.target.value)} />
        </div>
        <div>
          <Label>Due Date</Label>
          <Input type="date" value={form.due_date} onChange={e => update("due_date", e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={e => update("notes", e.target.value)} />
      </div>

      <Button type="submit" disabled={createOrder.isPending} className="w-full">
        {createOrder.isPending ? "Creating..." : "Create Order"}
      </Button>
    </form>
  );
}
