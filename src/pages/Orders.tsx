import { useState, useMemo } from "react";
import { useOrders, useClients, useCatalog, useCreateOrder, useCreateOrderItems, autoCreateCatalogEntry } from "@/lib/data";
import { getStageBadgeClass, getStageLabel, BOTTLE_TYPES, MATERIALS, COLORS, formatDateShort } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, StickyNote, Link2, X } from "lucide-react";
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
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px]">
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
        <div className="bg-card rounded-lg border overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Client PO</th>
                <th className="text-left p-3 font-medium">Client</th>
                <th className="text-left p-3 font-medium">Item</th>
                <th className="text-left p-3 font-medium">Size</th>
                <th className="text-left p-3 font-medium">Qty</th>
                <th className="text-left p-3 font-medium">Due</th>
                <th className="text-left p-3 font-medium">Paid</th>
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
                      <span className={order.paid ? "text-green-600 font-medium" : "text-destructive font-medium"}>
                        {order.paid ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className={`text-xs ${getStageBadgeClass(order.stage)}`}>
                        {getStageLabel(order.stage)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">
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

// Searchable dropdown component
function SearchableSelect({ label, options, value, onChange, placeholder }: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? options.filter(o => o.label.toLowerCase().includes(filter.toLowerCase()))
    : options;

  const selectedLabel = options.find(o => o.value === value)?.label || "";

  return (
    <div>
      <Label>{label}</Label>
      <div className="relative">
        <Input
          value={open ? filter : selectedLabel}
          onChange={e => { setFilter(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setFilter(""); }}
          placeholder={placeholder}
          className="w-full"
        />
        {open && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">No results</div>
            ) : (
              filtered.map(o => (
                <div
                  key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setFilter(""); }}
                  className={`px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${o.value === value ? "bg-accent/50" : ""}`}
                >
                  {o.label}
                </div>
              ))
            )}
          </div>
        )}
        {open && <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setFilter(""); }} />}
      </div>
    </div>
  );
}

interface ItemFormData {
  item_name: string;
  bottle_type: string;
  bottle_size: string;
  material: string;
  bottle_color: string;
  num_colors: string;
  pms_colors: string[];
  quantity: string;
  packing: string;
  catalogItemId: string;
}

function createEmptyItem(): ItemFormData {
  return {
    item_name: "",
    bottle_type: "",
    bottle_size: "",
    material: "",
    bottle_color: "",
    num_colors: "",
    pms_colors: [""],
    quantity: "",
    packing: "",
    catalogItemId: "",
  };
}

function NewOrderForm({ onSuccess }: { onSuccess: () => void }) {
  const { data: clients = [] } = useClients();
  const createOrder = useCreateOrder();
  const createOrderItems = useCreateOrderItems();
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState("");
  const { data: catalogItems = [] } = useCatalog(clientId || undefined);

  const today = format(new Date(), "yyyy-MM-dd");
  const [clientPo, setClientPo] = useState("");
  const [notes, setNotes] = useState("");
  const [dateEntered, setDateEntered] = useState(today);
  const [items, setItems] = useState<ItemFormData[]>([createEmptyItem()]);

  const handleCatalogSelect = (index: number, itemId: string) => {
    const cat = catalogItems.find(c => c.id === itemId);
    if (cat) {
      const colors = cat.print_colors ? cat.print_colors.split(",").map(s => s.trim()) : [""];
      setItems(prev => prev.map((item, i) => i === index ? {
        ...item,
        catalogItemId: itemId,
        item_name: cat.product_name,
        bottle_type: cat.component || "",
        bottle_size: cat.size || "",
        material: cat.material || "",
        bottle_color: cat.container_color || "",
        num_colors: cat.num_colors?.toString() || "",
        pms_colors: colors.length > 0 ? colors : [""],
      } : item));
    }
  };

  const updateItem = (index: number, key: string, val: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [key]: val } : item));
  };

  const handleNumColorsChange = (index: number, val: string) => {
    const n = parseInt(val) || 0;
    const clamped = Math.min(Math.max(n, 0), 8);
    setItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const newColors = Array.from({ length: Math.max(clamped, 1) }, (_, j) => item.pms_colors[j] || "");
      return { ...item, num_colors: val, pms_colors: newColors };
    }));
  };

  const updatePmsColor = (itemIndex: number, colorIndex: number, val: string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== itemIndex) return item;
      const copy = [...item.pms_colors];
      copy[colorIndex] = val;
      return { ...item, pms_colors: copy };
    }));
  };

  const addItem = () => setItems(prev => [...prev, createEmptyItem()]);
  const removeItem = (index: number) => setItems(prev => prev.filter((_, i) => i !== index));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !items[0]?.item_name) return;

    // Create the order (use first item's name for the order-level item_name)
    const orderData: any = {
      client_id: clientId,
      item_name: items.length === 1 ? items[0].item_name : items.map(i => i.item_name).join(", "),
      bottle_type: items[0].bottle_type || null,
      bottle_size: items[0].bottle_size || null,
      material: items[0].material || null,
      bottle_color: items[0].bottle_color || null,
      num_colors: items[0].num_colors ? parseInt(items[0].num_colors) : null,
      print_colors: items[0].pms_colors.filter(c => c.trim()).join(", ") || null,
      quantity: items[0].quantity ? parseInt(items[0].quantity) : null,
      packing: items[0].packing || null,
      client_po: clientPo || null,
      notes: notes || null,
      date_entered: dateEntered,
      due_date: null,
      stage: "preflight",
    };

    const createdOrder = await createOrder.mutateAsync(orderData);

    // Create order items
    const orderItemsData = items.map(item => ({
      order_id: createdOrder.id,
      item_name: item.item_name,
      bottle_type: item.bottle_type || null,
      bottle_size: item.bottle_size || null,
      material: item.material || null,
      bottle_color: item.bottle_color || null,
      num_colors: item.num_colors ? parseInt(item.num_colors) : null,
      print_colors: item.pms_colors.filter(c => c.trim()).join(", ") || null,
      quantity: item.quantity ? parseInt(item.quantity) : null,
      packing: item.packing || null,
    }));
    await createOrderItems.mutateAsync(orderItemsData);

    // Auto-create catalog entries for each item
    for (const item of items) {
      await autoCreateCatalogEntry({
        item_name: item.item_name,
        bottle_type: item.bottle_type || null,
        bottle_size: item.bottle_size || null,
        material: item.material || null,
        bottle_color: item.bottle_color || null,
        num_colors: item.num_colors ? parseInt(item.num_colors) : null,
        print_colors: item.pms_colors.filter(c => c.trim()).join(", ") || null,
      }, clientId);
    }
    queryClient.invalidateQueries({ queryKey: ["catalog"] });

    onSuccess();
  };

  const clientOptions = clients.map(c => ({ value: c.id, label: c.company }));
  const catalogOptions = catalogItems.map(c => ({ value: c.id, label: `${c.product_name}${c.size ? ` — ${c.size}` : ""}` }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Order-level fields */}
      <SearchableSelect
        label="Client *"
        options={clientOptions}
        value={clientId}
        onChange={(v) => { setClientId(v); setItems([createEmptyItem()]); }}
        placeholder="Search clients..."
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Client PO #</Label>
          <Input value={clientPo} onChange={e => setClientPo(e.target.value)} />
        </div>
        <div>
          <Label>Date Entered</Label>
          <Input type="date" value={dateEntered} onChange={e => setDateEntered(e.target.value)} />
        </div>
      </div>

      {/* Item-level fields */}
      {items.map((item, idx) => (
        <div key={idx} className="relative border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-muted-foreground">
              {items.length > 1 ? `Item ${idx + 1}` : "Item Details"}
            </h4>
            {items.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                <X size={14} />
              </Button>
            )}
          </div>

          {clientId && catalogItems.length > 0 && (
            <SearchableSelect
              label="From Catalog (optional)"
              options={catalogOptions}
              value={item.catalogItemId}
              onChange={(v) => handleCatalogSelect(idx, v)}
              placeholder="Search catalog items..."
            />
          )}

          <div>
            <Label>Item Name *</Label>
            <Input value={item.item_name} onChange={e => updateItem(idx, "item_name", e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectWithOther label="Container Type" options={BOTTLE_TYPES} value={item.bottle_type} onChange={v => updateItem(idx, "bottle_type", v)} />
            <div>
              <Label>Size</Label>
              <Input value={item.bottle_size} onChange={e => updateItem(idx, "bottle_size", e.target.value)} placeholder="e.g. 2oz, 10ml" />
            </div>
            <SelectWithOther label="Material" options={MATERIALS} value={item.material} onChange={v => updateItem(idx, "material", v)} />
            <SelectWithOther label="Color" options={COLORS} value={item.bottle_color} onChange={v => updateItem(idx, "bottle_color", v)} />
            <div>
              <Label># Print Colors</Label>
              <Input type="number" min="0" max="8" value={item.num_colors} onChange={e => handleNumColorsChange(idx, e.target.value)} />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} />
            </div>
          </div>

          {(parseInt(item.num_colors) || 0) > 0 && (
            <div className="space-y-2">
              <Label>PMS Colors</Label>
              <div className="grid grid-cols-2 gap-2">
                {item.pms_colors.slice(0, Math.min(parseInt(item.num_colors) || 0, 8)).map((color, ci) => (
                  <Input
                    key={ci}
                    placeholder={parseInt(item.num_colors) === 1 ? "PMS Color" : `PMS Color ${ci + 1}`}
                    value={color}
                    onChange={e => updatePmsColor(idx, ci, e.target.value)}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Packing</Label>
            <Input value={item.packing} onChange={e => updateItem(idx, "packing", e.target.value)} placeholder="e.g. 8 cases @ 130/case" />
          </div>
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addItem} className="w-full">
        <Plus size={14} className="mr-2" /> Add Another Item
      </Button>

      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <Button type="submit" disabled={createOrder.isPending} className="w-full">
        {createOrder.isPending ? "Creating..." : `Create Order${items.length > 1 ? ` (${items.length} items)` : ""}`}
      </Button>
    </form>
  );
}
