import { useOrders } from "@/lib/data";
import { useInboxCounts } from "@/lib/emailData";
import { STAGES, getStageBadgeClass, getStageLabel, checklistCount, daysUntilDue, daysSinceCreated, formatDateShort } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { StickyNote, Link2, ClipboardList, Mail, PhoneCall, Zap } from "lucide-react";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

interface DashboardProps {
  searchQuery: string;
}

const stageCardColors: Record<string, string> = {
  preflight: "bg-sky-100 text-sky-900",
  wip: "hsl-wip",
  completed: "hsl-completed",
  to_ship: "hsl-toship",
  close: "bg-stone-200 text-stone-700",
};

const SESSION_KEY_NOTIFS = "dashboard_dismissed_notifs";
const SESSION_KEY_QB = "dashboard_dismissed_qb";
const SESSION_KEY_NOTIFS_COUNTS = "dashboard_notifs_counts";

export default function Dashboard({ searchQuery }: DashboardProps) {
  const { data: orders = [], isLoading } = useOrders();
  const { data: inboxCounts } = useInboxCounts();
  const navigate = useNavigate();
  const [calDate, setCalDate] = useState<Date | undefined>(new Date());
  
  // Dismissable card state — persisted in sessionStorage
  const [dismissedNotifs, setDismissedNotifs] = useState(() => sessionStorage.getItem(SESSION_KEY_NOTIFS) === "true");
  const [dismissedQb, setDismissedQb] = useState(() => sessionStorage.getItem(SESSION_KEY_QB) === "true");
  const [fadingNotifs, setFadingNotifs] = useState(false);
  const [fadingQb, setFadingQb] = useState(false);

  // Persist dismissed state
  useEffect(() => { sessionStorage.setItem(SESSION_KEY_NOTIFS, String(dismissedNotifs)); }, [dismissedNotifs]);
  useEffect(() => { sessionStorage.setItem(SESSION_KEY_QB, String(dismissedQb)); }, [dismissedQb]);

  // Re-show cards when new activity comes in
  useEffect(() => {
    if (!inboxCounts) return;
    const prev = sessionStorage.getItem(SESSION_KEY_NOTIFS_COUNTS);
    const prevCounts = prev ? JSON.parse(prev) : null;
    
    if (prevCounts) {
      if (inboxCounts.actionNeeded > prevCounts.actionNeeded || inboxCounts.autoHandledToday > prevCounts.autoHandledToday || inboxCounts.newCalls > prevCounts.newCalls) {
        setDismissedNotifs(false);
      }
    }
    sessionStorage.setItem(SESSION_KEY_NOTIFS_COUNTS, JSON.stringify(inboxCounts));
  }, [inboxCounts]);

  const dismissCard = (card: "notifs" | "qb") => {
    if (card === "notifs") {
      setFadingNotifs(true);
      setTimeout(() => { setDismissedNotifs(true); setFadingNotifs(false); }, 300);
    } else {
      setFadingQb(true);
      setTimeout(() => { setDismissedQb(true); setFadingQb(false); }, 300);
    }
  };

  const filtered = searchQuery
    ? orders.filter(o =>
        o.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.clients?.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.client_po?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        o.vendor_po?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : orders;

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

  const stageColorMap: Record<string, string> = {
    preflight: "bg-sky-50 border-sky-200",
    wip: "bg-orange-50 border-orange-200",
    completed: "bg-emerald-50 border-emerald-200",
    to_ship: "bg-blue-50 border-blue-200",
    close: "bg-stone-100 border-stone-200",
  };

  const stageTextMap: Record<string, string> = {
    preflight: "text-sky-800",
    wip: "text-orange-800",
    completed: "text-emerald-800",
    to_ship: "text-blue-800",
    close: "text-stone-700",
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1600px]">
      <h1 className="text-2xl font-serif font-normal">Dashboard</h1>

      {/* Stage Count Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stageCounts.map((s) => (
          <div key={s.key} className={`rounded-2xl border p-4 ${stageColorMap[s.key] || "bg-card"}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 rounded-full ${s.color}`} />
              <span className={`text-sm font-semibold font-sans ${stageTextMap[s.key] || ""}`}>{s.label}</span>
            </div>
            <div className={`text-3xl font-bold font-sans ${stageTextMap[s.key] || ""}`}>{s.count}</div>
            <p className="text-xs text-muted-foreground mt-1 font-sans">{s.description}</p>
          </div>
        ))}
      </div>

      {/* Main content: Pipeline + Calendar side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5">
        {/* Left: Pipeline + Priority */}
        <div className="space-y-5">
          {/* Kanban Board */}
          <div className="floating-card">
            <h2 className="text-lg font-serif mb-4">Order Pipeline</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 overflow-x-auto">
              {STAGES.map((stage) => {
                const stageOrders = filtered.filter(o => o.stage === stage.key);
                return (
                  <div key={stage.key} className="space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                      <span className="text-xs font-semibold font-sans">{stage.label}</span>
                      <span className="text-xs text-muted-foreground">({stageOrders.length})</span>
                    </div>
                    <div className="space-y-2 min-h-[80px]">
                      {stageOrders.map((order) => {
                        const checked = checklistCount(order);
                        const daysInPreflight = daysSinceCreated(order.date_entered);
                        const days = daysUntilDue(order.due_date);
                        const poPos = getPoPosition(order);

                        return (
                          <div
                            key={order.id}
                            onClick={() => navigate(`/orders/${order.id}`)}
                            className="bg-background/60 border rounded-xl p-3 cursor-pointer hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-sm font-sans">{order.item_name}</span>
                              {order.notes && <StickyNote size={11} className="text-warning shrink-0" />}
                            </div>
                            <div className="text-xs text-muted-foreground font-sans">{order.clients?.company}</div>

                            {poPos && (
                              <div className="flex items-center gap-1 mt-1 text-xs text-primary font-sans">
                                <Link2 size={10} />
                                <span>{poPos.index} of {poPos.total}</span>
                              </div>
                            )}

                            {stage.key === "preflight" && (
                              <div className={`text-xs mt-1.5 font-medium font-sans ${daysInPreflight > 14 ? "text-destructive" : daysInPreflight > 7 ? "text-warning" : "text-muted-foreground"}`}>
                                {daysInPreflight} day{daysInPreflight !== 1 ? "s" : ""} in New Order
                              </div>
                            )}
                            {stage.key === "wip" && days !== null && (
                              <div className={`text-xs mt-1.5 font-medium font-sans ${days < 0 ? "text-destructive" : days < 7 ? "text-warning" : "text-muted-foreground"}`}>
                                {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                              </div>
                            )}
                            {stage.key === "completed" && (
                              <div className={`text-xs mt-1.5 font-medium font-sans ${order.paid ? "text-success" : "text-destructive"}`}>
                                {order.paid ? "✓ Paid" : "Awaiting Payment"}
                              </div>
                            )}
                            {stage.key === "to_ship" && (
                              <div className={`text-xs mt-1.5 font-medium font-sans ${order.outgoing_bol ? "text-success" : "text-destructive"}`}>
                                {order.outgoing_bol ? "✓ BOL Ready" : "BOL Needed"}
                              </div>
                            )}
                            {stage.key === "close" && (
                              <div className={`text-xs mt-1.5 font-medium font-sans text-success`}>
                                Ready to Archive
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
            <div className="floating-card">
              <h2 className="text-lg font-serif mb-4">Priority List — W.I.P. & Completed</h2>
              <div className="overflow-x-auto rounded-xl">
                <table className="w-full text-sm font-sans min-w-[700px]">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Customer</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Description</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Size</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Qty.</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Pass</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Stage</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Date In</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Due Date</th>
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
                          <td className="p-3 font-medium">
                            <span className="flex items-center gap-1">
                              {order.item_name}
                              {order.notes && <StickyNote size={12} className="text-warning shrink-0" />}
                            </span>
                          </td>
                          <td className="p-3">{order.bottle_size}</td>
                          <td className="p-3">{order.quantity?.toLocaleString()}</td>
                          <td className="p-3">{order.pass}</td>
                          <td className="p-3">
                            <Badge variant="secondary" className={`text-xs ${getStageBadgeClass(order.stage)}`}>
                              {getStageLabel(order.stage)}
                            </Badge>
                          </td>
                          <td className="p-3">{formatDateShort(order.date_entered)}</td>
                          <td className={`p-3 font-medium ${days !== null && days < 0 ? "text-destructive" : days !== null && days < 7 ? "text-warning" : ""}`}>
                            {formatDateShort(order.due_date)}
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

        {/* Right: QB Review + Calendar */}
        <div className="space-y-5">
          {/* Inbox & Calls Notifications */}
          {!dismissedNotifs && inboxCounts && (inboxCounts.actionNeeded > 0 || inboxCounts.autoHandledToday > 0 || inboxCounts.newCalls > 0) && (
            <div className={`floating-card space-y-2 relative transition-opacity duration-300 ${fadingNotifs ? "opacity-0" : "opacity-100"}`}>
              <button onClick={() => dismissCard("notifs")} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors">
                <X size={14} />
              </button>
              <h3 className="text-base font-serif mb-2">Notifications</h3>
              {inboxCounts.actionNeeded > 0 && (
                <button onClick={() => navigate("/inbox")} className="flex items-center gap-2 text-sm font-sans hover:text-primary transition-colors w-full text-left">
                  <Mail size={14} className="text-primary shrink-0" />
                  <span className="font-medium">{inboxCounts.actionNeeded} email{inboxCounts.actionNeeded !== 1 ? "s" : ""} need attention</span>
                </button>
              )}
              {inboxCounts.autoHandledToday > 0 && (
                <button onClick={() => navigate("/inbox")} className="flex items-center gap-2 text-sm font-sans hover:text-primary transition-colors w-full text-left">
                  <Zap size={14} className="text-success shrink-0" />
                  <span className="font-medium">{inboxCounts.autoHandledToday} auto-handled today</span>
                </button>
              )}
              {inboxCounts.newCalls > 0 && (
                <button onClick={() => navigate("/calls")} className="flex items-center gap-2 text-sm font-sans hover:text-primary transition-colors w-full text-left">
                  <PhoneCall size={14} className="text-warning shrink-0" />
                  <span className="font-medium">{inboxCounts.newCalls} call{inboxCounts.newCalls !== 1 ? "s" : ""} to return</span>
                </button>
              )}
            </div>
          )}
          {/* QuickBooks Review */}
          {!dismissedQb && (() => {
            const invoicesToReview = filtered.filter(o => o.invoice_num && !(o as any).invoice_reviewed).length;
            const vendorPosToReview = filtered.filter(o => o.vendor_po && !(o as any).vendor_po_reviewed).length;
            return (
              <div className={`floating-card relative transition-opacity duration-300 ${fadingQb ? "opacity-0" : "opacity-100"}`}>
                <button onClick={() => dismissCard("qb")} className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors">
                  <X size={14} />
                </button>
                <h3 className="text-base font-serif mb-3 flex items-center gap-2">
                  <ClipboardList size={16} className="text-primary" />
                  QuickBooks Review
                </h3>
                {invoicesToReview === 0 && vendorPosToReview === 0 ? (
                  <p className="text-sm text-success font-medium">All caught up! ✓</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {invoicesToReview > 0 && (
                      <button onClick={() => navigate("/orders")} className="flex items-center gap-2 hover:text-primary transition-colors w-full text-left">
                        <span className="font-medium">{invoicesToReview} invoice{invoicesToReview !== 1 ? "s" : ""} to review</span>
                      </button>
                    )}
                    {vendorPosToReview > 0 && (
                      <button onClick={() => navigate("/orders")} className="flex items-center gap-2 hover:text-primary transition-colors w-full text-left">
                        <span className="font-medium">{vendorPosToReview} vendor PO{vendorPosToReview !== 1 ? "s" : ""} to review</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="floating-card h-fit">
            <h3 className="text-base font-serif mb-3">Calendar</h3>
            <p className="text-sm text-muted-foreground font-sans mb-2">
              {format(calDate || new Date(), "MMMM yyyy")}
            </p>
            <Calendar
              mode="single"
              selected={calDate}
              onSelect={setCalDate}
              className="p-0 pointer-events-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
