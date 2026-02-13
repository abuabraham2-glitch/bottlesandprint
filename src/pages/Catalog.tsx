import { useState } from "react";
import { useCatalog, useUpdateCatalogItem, useDeleteCatalogItem, CatalogItem } from "@/lib/data";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Convert "2022-03" format to "Mar 2022" for display
function formatLastRun(val: string | null): string {
  if (!val) return "—";
  // Already in "Mon YYYY" or "Month YYYY" format
  if (/^[A-Za-z]/.test(val)) return val;
  // "YYYY-MM" format
  const match = val.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const idx = parseInt(match[2], 10) - 1;
    if (idx >= 0 && idx < 12) return `${months[idx]} ${match[1]}`;
  }
  return val;
}

export default function Catalog() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: items = [], isLoading } = useCatalog();
  const updateItem = useUpdateCatalogItem();
  const deleteItem = useDeleteCatalogItem();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [editForm, setEditForm] = useState({
    product_name: "", size: "", component: "", material: "",
    container_color: "", num_colors: "", print_colors: "",
    first_run: "", last_run: "",
  });

  const filtered = showArchived ? items : items.filter(i => !i.archived);

  const openEdit = (item: CatalogItem) => {
    setEditItem(item);
    setEditForm({
      product_name: item.product_name || "",
      size: item.size || "",
      component: item.component || "",
      material: item.material || "",
      container_color: item.container_color || "",
      num_colors: item.num_colors?.toString() || "",
      print_colors: item.print_colors || "",
      first_run: item.first_run || "",
      last_run: item.last_run || "",
    });
  };

  const saveEdit = async () => {
    if (!editItem) return;
    await updateItem.mutateAsync({
      id: editItem.id,
      product_name: editForm.product_name,
      size: editForm.size || null,
      component: editForm.component || null,
      material: editForm.material || null,
      container_color: editForm.container_color || null,
      num_colors: editForm.num_colors ? parseInt(editForm.num_colors) : null,
      print_colors: editForm.print_colors || null,
      first_run: editForm.first_run || null,
      last_run: editForm.last_run || null,
    } as any);
    toast.success("Product updated");
    setEditItem(null);
  };

  const archiveItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Archive this catalog item?")) return;
    await updateItem.mutateAsync({ id, archived: true });
    toast.success("Item archived");
  };

  const confirmDeleteItem = async () => {
    if (!deleteTarget) return;
    await deleteItem.mutateAsync(deleteTarget.id);
    toast.success("Catalog item deleted");
    setDeleteTarget(null);
  };

  const exportToExcel = () => {
    const headers = ["Client", "Product", "Size", "Component", "Material", "Container Color", "# Colors", "PMS Colors", "First Run", "Last Run"];
    const rows = filtered.map(i => [
      i.clients?.company, i.product_name, i.size, i.component, i.material, i.container_color, i.num_colors, i.print_colors, i.first_run, formatLastRun(i.last_run)
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product_catalog.csv";
    a.click();
  };

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 space-y-4 max-w-[1600px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Product Catalog</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            Show Archived
          </label>
          <Button variant="outline" onClick={exportToExcel}>Export to Excel</Button>
        </div>
      </div>

      <div className="bg-card rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium">Client</th>
              <th className="text-left p-3 font-medium">Product</th>
              <th className="text-left p-3 font-medium">Size</th>
              <th className="text-left p-3 font-medium">Component</th>
              <th className="text-left p-3 font-medium">Material</th>
              <th className="text-left p-3 font-medium">Color</th>
              <th className="text-left p-3 font-medium"># Colors</th>
              <th className="text-left p-3 font-medium">PMS Colors</th>
              <th className="text-left p-3 font-medium">First Run</th>
              <th className="text-left p-3 font-medium">Last Run</th>
              <th className="text-left p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer" onClick={() => openEdit(item)}>
                <td className="p-3">{item.clients?.company}</td>
                <td className="p-3 font-medium">{item.product_name}</td>
                <td className="p-3">{item.size}</td>
                <td className="p-3">{item.component}</td>
                <td className="p-3">{item.material}</td>
                <td className="p-3">{item.container_color}</td>
                <td className="p-3">{item.num_colors}</td>
                <td className="p-3">{item.print_colors}</td>
                <td className="p-3">{item.first_run || "—"}</td>
                <td className="p-3">{formatLastRun(item.last_run)}</td>
                <td className="p-3" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {!item.archived && (
                      <button onClick={(e) => archiveItem(item.id, e)} className="text-muted-foreground hover:text-foreground" title="Archive">
                        <Archive size={14} />
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: item.id, name: item.product_name }); }} className="text-muted-foreground hover:text-destructive" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">No catalog items</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Catalog Item Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Catalog Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Product Name</Label>
              <Input value={editForm.product_name} onChange={e => setEditForm(f => ({ ...f, product_name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Size</Label>
                <Input value={editForm.size} onChange={e => setEditForm(f => ({ ...f, size: e.target.value }))} />
              </div>
              <div>
                <Label>Component</Label>
                <Input value={editForm.component} onChange={e => setEditForm(f => ({ ...f, component: e.target.value }))} />
              </div>
              <div>
                <Label>Material</Label>
                <Input value={editForm.material} onChange={e => setEditForm(f => ({ ...f, material: e.target.value }))} />
              </div>
              <div>
                <Label>Container Color</Label>
                <Input value={editForm.container_color} onChange={e => setEditForm(f => ({ ...f, container_color: e.target.value }))} />
              </div>
              <div>
                <Label># Colors</Label>
                <Input type="number" value={editForm.num_colors} onChange={e => setEditForm(f => ({ ...f, num_colors: e.target.value }))} />
              </div>
              <div>
                <Label>Print Colors</Label>
                <Input value={editForm.print_colors} onChange={e => setEditForm(f => ({ ...f, print_colors: e.target.value }))} />
              </div>
              <div>
                <Label>First Run</Label>
                <Input value={editForm.first_run} onChange={e => setEditForm(f => ({ ...f, first_run: e.target.value }))} placeholder="e.g. Jan 2022" />
              </div>
              <div>
                <Label>Last Run</Label>
                <Input value={editForm.last_run} onChange={e => setEditForm(f => ({ ...f, last_run: e.target.value }))} placeholder="e.g. Mar 2024" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Catalog Item Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Catalog Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{deleteTarget?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
