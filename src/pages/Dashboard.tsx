import { useOrders } from "@/lib/data";
import { STAGES, getStageBadgeClass, getStageLabel, checklistCount, daysUntilDue } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

interface DashboardProps {
  searchQuery: string;
}

export default function Dashboard({ searchQuery }: DashboardProps) {
  const { data: orders = [], isLoading } = useOrders();
  const navigate = useNavigate();

  const filtered = searchQuery
    ? orders.filter(o =>
        o.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.clients?.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.client_po?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.vendor_po?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : orders;

  const stageCounts = STAGES.map(s => ({
    ...s,
    count: filtered.filter(o => o.stage === s.key).length,
  }));

  const priorityOrders = filtered
    .filter(o => o.stage === "wip" || o.stage === "completed")
    .sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 space-y-6 max-w-[1600px]">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stage Count Cards */}
      <div className="grid grid-cols-5 gap-4">
        {stageCounts.map((s) => (
          <div key={s.key} className="bg-card rounded-lg border p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
              <div className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
            </div>
            <div className="text-3xl font-bold">{s.count}</div>
            <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Order Pipeline</h2>
        <div className="grid grid-cols-5 gap-3">
          {STAGES.map((stage) => {
            const stageOrders = filtered.filter(o => o.stage === stage.key);
            return (
              <div key={stage.key} className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                  <span className="text-sm font-semibold">{stage.label}</span>
                  <span className="text-xs text-muted-foreground">({stageOrders.length})</span>
                </div>
                <div className="space-y-2 min-h-[100px]">
                  {stageOrders.map((order) => {
                    const days = daysUntilDue(order.due_date);
                    const checked = checklistCount(order);
                    return (
                      <div
                        key={order.id}
                        onClick={() => navigate(`/orders/${order.id}`)}
                        className="bg-card border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <div className="font-medium text-sm">{order.item_name}</div>
                        <div className="text-xs text-muted-foreground">{order.clients?.company}</div>
                        {stage.key === "preflight" && (
                          <div className="text-xs mt-1.5 text-muted-foreground">✓ {checked}/6 items</div>
                        )}
                        {stage.key === "completed" && !order.invoiced && (
                          <div className="text-xs mt-1.5 text-destructive font-medium">Needs invoicing</div>
                        )}
                        {stage.key === "close" && !order.paid && (
                          <div className="text-xs mt-1.5 text-primary font-medium">Awaiting payment</div>
                        )}
                        {days !== null && (
                          <div className={`text-xs mt-1 font-medium ${days < 0 ? "text-destructive" : days < 7 ? "text-warning" : "text-muted-foreground"}`}>
                            {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Priority List */}
      {priorityOrders.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Priority List — W.I.P. & Completed Orders</h2>
          <div className="bg-card rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">Customer</th>
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Size</th>
                  <th className="text-left p-3 font-medium">Qty.</th>
                  <th className="text-left p-3 font-medium">Pass</th>
                  <th className="text-left p-3 font-medium">Stage</th>
                  <th className="text-left p-3 font-medium">Date In</th>
                  <th className="text-left p-3 font-medium">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {priorityOrders.map((order, i) => {
                  const days = daysUntilDue(order.due_date);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                      className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer"
                    >
                      <td className="p-3">{i + 1}</td>
                      <td className="p-3">{order.clients?.company}</td>
                      <td className="p-3 font-medium">{order.item_name}</td>
                      <td className="p-3">{order.bottle_size}</td>
                      <td className="p-3">{order.quantity?.toLocaleString()}</td>
                      <td className="p-3">{order.pass}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={`text-xs ${getStageBadgeClass(order.stage)}`}>
                          {getStageLabel(order.stage)}
                        </Badge>
                      </td>
                      <td className="p-3">{order.date_entered}</td>
                      <td className={`p-3 font-medium ${days !== null && days < 0 ? "text-destructive" : days !== null && days < 7 ? "text-warning" : ""}`}>
                        {order.due_date}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
