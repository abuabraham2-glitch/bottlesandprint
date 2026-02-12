import { useState } from "react";
import { useCatalog, useUpdateCatalogItem } from "@/lib/data";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Archive } from "lucide-react";
import { toast } from "sonner";

export default function Catalog() {
  const [showArchived, setShowArchived] = useState(false);
  const { data: items = [], isLoading } = useCatalog();
  const updateItem = useUpdateCatalogItem();

  const filtered = showArchived ? items : items.filter(i => !i.archived);

  const archiveItem = async (id: string) => {
    if (!confirm("Archive this catalog item?")) return;
    await updateItem.mutateAsync({ id, archived: true });
    toast.success("Item archived");
  };

  const exportToExcel = () => {
    const headers = ["Client", "Product", "Size", "Component", "Material", "Container Color", "# Colors", "PMS Colors", "First Run", "Last Run"];
    const rows = filtered.map(i => [
      i.clients?.company, i.product_name, i.size, i.component, i.material, i.container_color, i.num_colors, i.print_colors, i.first_run, i.last_run
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
              <tr key={item.id} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="p-3">{item.clients?.company}</td>
                <td className="p-3 font-medium">{item.product_name}</td>
                <td className="p-3">{item.size}</td>
                <td className="p-3">{item.component}</td>
                <td className="p-3">{item.material}</td>
                <td className="p-3">{item.container_color}</td>
                <td className="p-3">{item.num_colors}</td>
                <td className="p-3">{item.print_colors}</td>
                <td className="p-3">{item.first_run || "—"}</td>
                <td className="p-3">{item.last_run || "—"}</td>
                <td className="p-3">
                  {!item.archived && (
                    <button onClick={() => archiveItem(item.id)} className="text-muted-foreground hover:text-foreground">
                      <Archive size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="p-8 text-center text-muted-foreground">No catalog items</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
