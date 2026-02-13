import { useState, useMemo } from "react";
import { useOrders, useClients, useCatalog, useCreateOrder, autoCreateCatalogEntry } from "@/lib/data";
import { getStageBadgeClass, getStageLabel, BOTTLE_TYPES, MATERIALS, COLORS, formatDateShort } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, StickyNote, Link2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

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

  // Build PO group counts
  const poGroupCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (o.client_po && !o.archived) {
        map.set(o.client_po, (map.get(o.client_po) || 0) + 1);
      }
    }
    return map;
  }, [orders]);

  const getPoPosition = (order: typeof orders[0]) => {
    if (!order.client_po) return null;
    const total = poGroupCounts.get(order.client_po) || 0;
    if (total <= 1) return null;
    const samePoOrders = orders.filter(o => o.client_po === order.client_po && !o.archived);
    const idx = samePoOrders.findIndex(o => o.id === order.id);
    return { index: idx + 1, total };
  };

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
              {filtered.map((order) => {
                const poPos = getPoPosition(order);
                return (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                  >
                    <td className="p-3 text-muted-foreground">
                      <div className="flex items-center gap-1">
                        {order.client_po || "—"}
                        {poPos && (
                          <span className="flex items-center gap-0.5 text-xs text-primary">
                            <Link2 size={10} />
                            {poPos.index}/{poPos.total}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3">{order.clients?.company}</td>
                    <td className="p-3 font-medium">
                      <span className="flex items-center gap-1">
                        {order.item_name}
                        {order.notes && <StickyNote size={12} className="text-amber-500 shrink-0" />}
                      </span>
                    </td>
                    <td className="p-3">{order.bottle_size}</td>
                    <td className="p-3">{order.quantity?.toLocaleString()}</td>
                    <td className="p-3">{formatDateShort(order.due_date)}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={`text-xs ${getStageBadgeClass(order.stage)}`}>
                        {getStageLabel(order.stage)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">
                  {searchQuery ? `No orders found for "${searchQuery}"` : "No orders found"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SelectWithOther({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  const [isOther, setIsOther] = useState(!options.includes(value) && value !== "");

  return (
    <div>
      <Label>{label}</Label>
      <Select
        value={isOther ? "__other__" : value}
        onValueChange={v => {
          if (v === "__other__") {
            setIsOther(true);
            onChange("");
          } else {
            setIsOther(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
        <SelectContent>
          {options.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          <SelectItem value="__other__">Other</SelectItem>
        </SelectContent>
      </Select>
      {isOther && (
        <Input
          className="mt-2"
          placeholder={`Enter custom ${label.toLowerCase()}`}
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function NewOrderForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: clients = [] } = useClients();
  const createOrder = useCreateOrder();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const { data: catalogItems = [] } = useCatalog(clientId || undefined);
  const [catalogItemId, setCatalogItemId] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");

  const [form, setForm] = useState({
    item_name: "",
    bottle_type: "",
    bottle_size: "",
    material: "",
    bottle_color: "",
    num_colors: "",
    pms_colors: [""] as string[],
    quantity: "",
    packing: "",
    client_po: "",
    notes: "",
    date_entered: today,
  });

  const handleCatalogSelect = (itemId: string) => {
    setCatalogItemId(itemId);
    const item = catalogItems.find(c => c.id === itemId);
    if (item) {
      const colors = item.print_colors ? item.print_colors.split(",").map(s => s.trim()) : [""];
      setForm(prev => ({
        ...prev,
        item_name: item.product_name,
        bottle_type: item.component || "",
        bottle_size: item.size || "",
        material: item.material || "",
        bottle_color: item.container_color || "",
        num_colors: item.num_colors?.toString() || "",
        pms_colors: colors.length > 0 ? colors : [""],
      }));
    }
  };

  const numColorsInt = parseInt(form.num_colors) || 0;

  const handleNumColorsChange = (val: string) => {
    const n = parseInt(val) || 0;
    const clamped = Math.min(Math.max(n, 0), 8);
    const newColors = Array.from({ length: Math.max(clamped, 1) }, (_, i) => form.pms_colors[i] || "");
    setForm(prev => ({ ...prev, num_colors: val, pms_colors: newColors }));
  };

  const updatePmsColor = (index: number, val: string) => {
    setForm(prev => {
      const copy = [...prev.pms_colors];
      copy[index] = val;
      return { ...prev, pms_colors: copy };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !form.item_name) return;

    const printColors = form.pms_colors.filter(c => c.trim()).join(", ");
    const orderData: any = {
      client_id: clientId,
      item_name: form.item_name,
      bottle_type: form.bottle_type || null,
      bottle_size: form.bottle_size || null,
      material: form.material || null,
      bottle_color: form.bottle_color || null,
      num_colors: form.num_colors ? parseInt(form.num_colors) : null,
      print_colors: printColors || null,
      quantity: form.quantity ? parseInt(form.quantity) : null,
      packing: form.packing || null,
      client_po: form.client_po || null,
      notes: form.notes || null,
      date_entered: form.date_entered,
      due_date: null,
      stage: "preflight",
    };

    await createOrder.mutateAsync(orderData);
    await autoCreateCatalogEntry(orderData, clientId);
    queryClient.invalidateQueries({ queryKey: ["catalog"] });

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
              {catalogItems.map(c => <SelectItem key={c.id} value={c.id}>{c.product_name}{c.size ? ` — ${c.size}` : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <Label>Item Name *</Label>
        <Input value={form.item_name} onChange={e => update("item_name", e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SelectWithOther label="Container Type" options={BOTTLE_TYPES} value={form.bottle_type} onChange={v => update("bottle_type", v)} />
        <div>
          <Label>Size</Label>
          <Input value={form.bottle_size} onChange={e => update("bottle_size", e.target.value)} placeholder="e.g. 2oz, 10ml" />
        </div>
        <SelectWithOther label="Material" options={MATERIALS} value={form.material} onChange={v => update("material", v)} />
        <SelectWithOther label="Color" options={COLORS} value={form.bottle_color} onChange={v => update("bottle_color", v)} />
        <div>
          <Label># Print Colors</Label>
          <Input
            type="number"
            min="0"
            max="8"
            value={form.num_colors}
            onChange={e => handleNumColorsChange(e.target.value)}
          />
        </div>
        <div>
          <Label>Quantity</Label>
          <Input type="number" value={form.quantity} onChange={e => update("quantity", e.target.value)} />
        </div>
      </div>

      {numColorsInt > 0 && (
        <div className="space-y-2">
          <Label>PMS Colors</Label>
          <div className="grid grid-cols-2 gap-2">
            {form.pms_colors.slice(0, Math.min(numColorsInt, 8)).map((color, i) => (
              <Input
                key={i}
                placeholder={numColorsInt === 1 ? "PMS Color" : `PMS Color ${i + 1}`}
                value={color}
                onChange={e => updatePmsColor(i, e.target.value)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        <Label>Packing</Label>
        <Input value={form.packing} onChange={e => update("packing", e.target.value)} placeholder="e.g. 8 cases @ 130/case" />
      </div>

      <div>
        <Label>Client PO #</Label>
        <Input value={form.client_po} onChange={e => update("client_po", e.target.value)} />
      </div>

      <div>
        <Label>Date Entered</Label>
        <Input type="date" value={form.date_entered} onChange={e => update("date_entered", e.target.value)} />
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
