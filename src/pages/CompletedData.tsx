import { useState } from "react";
import { useArchivedOrders } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const currentYear = new Date().getFullYear();
const years = [currentYear, currentYear - 1, currentYear - 2].map(String);

export default function CompletedData() {
  const [selectedYear, setSelectedYear] = useState(years[0]);
  const { data: archived = [], isLoading } = useArchivedOrders(selectedYear);

  // Group by month
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
    a.download = `completed_data_${selectedYear}.csv`;
    a.click();
  };

  return (
    <div className="p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Completed Data</h1>
        <Button variant="outline" onClick={exportToExcel}>Export to Excel</Button>
      </div>

      <Tabs value={selectedYear} onValueChange={setSelectedYear}>
        <TabsList>
          {years.map(y => <TabsTrigger key={y} value={y}>{y}</TabsTrigger>)}
        </TabsList>

        <TabsContent value={selectedYear}>
          {isLoading ? (
            <div className="text-muted-foreground py-8">Loading...</div>
          ) : grouped.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">No completed orders for {selectedYear}</div>
          ) : (
            <div className="bg-card rounded-lg border overflow-hidden">
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
                        <td className="p-3">{order.date_completed}</td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
