import { useState } from "react";
import { useArchivedOrders, useArchivedYears } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function CompletedData() {
  const { data: years = [], isLoading: yearsLoading } = useArchivedYears();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const activeYear = selectedYear || years[0] || "";
  const { data: archived = [], isLoading } = useArchivedOrders(activeYear);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const grouped = months
    .map(month => ({ month, orders: archived.filter(a => a.month === month) }))
    .filter(g => g.orders.length > 0);

  const exportToExcel = () => {
    const headers = ["Month", "Customer", "Description", "Size", "Qty", "Pass", "Comments", "Date"];
    const rows = archived.map(a => [a.month, a.client_company, a.description, a.size, a.quantity, a.pass, a.comments, a.date_completed]);
    const csv = [headers.join(","), ...rows.map(r => r.map(v => `"${v || ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `completed_data_${activeYear}.csv`;
    a.click();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("archived_orders").delete().eq("id", deleteTarget);
    if (error) { toast.error("Failed to delete"); return; }
    queryClient.invalidateQueries({ queryKey: ["archived_orders"] });
    toast.success("Record deleted");
    setDeleteTarget(null);
  };

  if (yearsLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Completed Data</h1>
        <Button variant="outline" onClick={exportToExcel}>Export to Excel</Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {years.map(y => (
          <button
            key={y}
            onClick={() => setSelectedYear(y)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeYear === y
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground py-8">Loading...</div>
      ) : grouped.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center">No completed orders for {activeYear}</div>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="text-xs text-muted-foreground p-3 border-b">{archived.length} records</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Month</th>
                <th className="text-left p-3 font-medium">Customer</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-left p-3 font-medium">Size</th>
                <th className="text-left p-3 font-medium">Qty.</th>
                <th className="text-left p-3 font-medium">Pass</th>
                <th className="text-left p-3 font-medium">Comments</th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                group.orders.map((order, i) => (
                  <tr key={order.id} className={`border-b last:border-b-0 ${i === 0 ? "bg-muted/20" : ""}`}>
                    {i === 0 && <td className="p-3 font-semibold" rowSpan={group.orders.length}>{group.month}</td>}
                    <td className="p-3">{order.client_company}</td>
                    <td className="p-3">{order.description}</td>
                    <td className="p-3">{order.size}</td>
                    <td className="p-3">{order.quantity?.toLocaleString()}</td>
                    <td className="p-3">{order.pass}</td>
                    <td className="p-3">{order.comments}</td>
                    <td className="p-3">{order.date_completed || "—"}</td>
                    <td className="p-3">
                      <button onClick={() => setDeleteTarget(order.id)} className="text-destructive hover:text-destructive/80">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Archived Record</AlertDialogTitle>
            <AlertDialogDescription>Delete this archived record? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
