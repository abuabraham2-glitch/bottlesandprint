import { useState } from "react";
import { useArchivedOrders, useArchivedYears, useOrderDocuments } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2, ChevronLeft, ChevronRight, Eye, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PAGE_SIZE = 50;

const MONTH_ORDER: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function monthNum(m: string | null): number {
  if (!m) return 99;
  return MONTH_ORDER[m.toLowerCase().trim()] ?? 99;
}

// Detail modal for archived order with documents
function ArchivedOrderDetail({ order, onClose }: { order: any; onClose: () => void }) {
  const { data: documents = [] } = useOrderDocuments(order.original_order_id || "");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const downloadFile = async (url: string, name: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <>
      <Dialog open onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{order.description || "Archived Order"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Customer:</span> <span className="ml-1 font-medium">{order.client_company || "—"}</span></div>
              <div><span className="text-muted-foreground">Month:</span> <span className="ml-1">{order.month || "—"}</span></div>
              <div><span className="text-muted-foreground">Year:</span> <span className="ml-1">{order.year || "—"}</span></div>
              <div><span className="text-muted-foreground">Size:</span> <span className="ml-1">{order.size || "—"}</span></div>
              <div><span className="text-muted-foreground">Quantity:</span> <span className="ml-1">{order.quantity?.toLocaleString() || "—"}</span></div>
              <div><span className="text-muted-foreground">Pass:</span> <span className="ml-1">{order.pass ?? "—"}</span></div>
              <div className="col-span-2"><span className="text-muted-foreground">Comments:</span> <span className="ml-1">{order.comments || "—"}</span></div>
              <div><span className="text-muted-foreground">Date Completed:</span> <span className="ml-1">{order.date_completed || "—"}</span></div>
            </div>

            {order.original_order_id && (
              <div>
                <h4 className="font-semibold mb-2 text-sm">Documents</h4>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents found for this order.</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map(doc => (
                      <div key={doc.id} className="flex items-center gap-3 p-2 rounded bg-muted/30">
                        <FileText size={16} className="text-muted-foreground shrink-0" />
                        <span className="text-sm flex-1">{doc.file_name}</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded shrink-0">{doc.file_type}</span>
                        <button onClick={() => setPreviewUrl(doc.file_url)} className="text-muted-foreground hover:text-foreground p-1" title="Preview">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => downloadFile(doc.file_url, doc.file_name)} className="text-muted-foreground hover:text-foreground p-1" title="Download">
                          <Download size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {!order.original_order_id && (
              <p className="text-sm text-muted-foreground italic">This archived record has no linked original order. Documents are not available.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Preview */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader><DialogTitle>Document Preview</DialogTitle></DialogHeader>
          {previewUrl && (
            previewUrl.toLowerCase().includes(".pdf") ? (
              <iframe src={previewUrl} className="w-full h-[70vh]" />
            ) : (
              <img src={previewUrl} alt="Document" className="max-w-full max-h-[70vh] mx-auto" />
            )
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CompletedData() {
  const { data: years = [], isLoading: yearsLoading } = useArchivedYears();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const activeYear = selectedYear || years[0] || "";
  const { data: archived = [], isLoading } = useArchivedOrders(activeYear);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const handleYearChange = (y: string) => {
    setSelectedYear(y);
    setPage(0);
  };

  // Sort by calendar month order, then date_completed
  const sorted = [...archived].sort((a, b) => {
    const ma = monthNum(a.month);
    const mb = monthNum(b.month);
    if (ma !== mb) return ma - mb;
    return (a.date_completed || "").localeCompare(b.date_completed || "");
  });

  // Group by month preserving calendar order
  const monthOrder: string[] = [];
  const monthMap = new Map<string, typeof sorted>();
  for (const a of sorted) {
    const m = a.month || "Unknown";
    if (!monthMap.has(m)) {
      monthOrder.push(m);
      monthMap.set(m, []);
    }
    monthMap.get(m)!.push(a);
  }
  const grouped = monthOrder.map(month => ({ month, orders: monthMap.get(month)! }));

  // Flatten for pagination
  const flatRows: { month: string; order: typeof sorted[0]; isFirst: boolean; groupSize: number }[] = [];
  for (const g of grouped) {
    g.orders.forEach((order, i) => {
      flatRows.push({ month: g.month, order, isFirst: i === 0, groupSize: g.orders.length });
    });
  }

  const totalPages = Math.ceil(flatRows.length / PAGE_SIZE);
  const pageRows = flatRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const exportToExcel = () => {
    const headers = ["Month", "Customer", "Description", "Size", "Qty", "Pass", "Comments", "Date"];
    const rows = sorted.map(a => [a.month, a.client_company, a.description, a.size, a.quantity, a.pass, a.comments, a.date_completed]);
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
            onClick={() => handleYearChange(y)}
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
      ) : flatRows.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center">No completed orders for {activeYear}</div>
      ) : (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="text-xs text-muted-foreground p-3 border-b flex justify-between items-center">
            <span>{archived.length} records</span>
            {totalPages > 1 && (
              <span>Page {page + 1} of {totalPages}</span>
            )}
          </div>
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
              {pageRows.map((row) => (
                <tr
                  key={row.order.id}
                  className={`border-b last:border-b-0 hover:bg-muted/30 cursor-pointer ${row.isFirst ? "bg-muted/20" : ""}`}
                  onClick={() => setDetailOrder(row.order)}
                >
                  {row.isFirst && (
                    <td
                      className="p-3 font-semibold"
                      rowSpan={Math.min(row.groupSize, pageRows.filter(r => r.month === row.month).length)}
                      onClick={e => e.stopPropagation()}
                    >
                      {row.month}
                    </td>
                  )}
                  <td className="p-3">{row.order.client_company}</td>
                  <td className="p-3">{row.order.description}</td>
                  <td className="p-3">{row.order.size}</td>
                  <td className="p-3">{row.order.quantity?.toLocaleString()}</td>
                  <td className="p-3">{row.order.pass}</td>
                  <td className="p-3">{row.order.comments}</td>
                  <td className="p-3">{row.order.date_completed || "—"}</td>
                  <td className="p-3" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setDeleteTarget(row.order.id)} className="text-destructive hover:text-destructive/80">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 p-3 border-t">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={14} className="mr-1" /> Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight size={14} className="ml-1" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {detailOrder && (
        <ArchivedOrderDetail order={detailOrder} onClose={() => setDetailOrder(null)} />
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
