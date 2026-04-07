import { useOrders } from "@/lib/data";
import { useInboxCounts } from "@/lib/emailData";
import { STAGES, daysUntilDue, daysSinceCreated } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { StickyNote, Link2, Mail, PhoneCall, Zap, ClipboardList, ChevronRight, ChevronDown, X, FilePenLine, BarChart3, CheckSquare } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { format, formatDistanceToNowStrict } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";


interface DashboardProps {
  searchQuery: string;
}

const SESSION_KEY_NOTES = "dashboard_quick_notes";

const stageColors: Record<string, { border: string; text: string; bg: string; stripe: string }> = {
  preflight: { border: "border-stage-new", text: "text-stage-new", bg: "bg-stage-new", stripe: "bg-stage-new" },
  wip: { border: "border-stage-wip", text: "text-stage-wip", bg: "bg-stage-wip", stripe: "bg-stage-wip" },
  completed: { border: "border-stage-completed", text: "text-stage-completed", bg: "bg-stage-completed", stripe: "bg-stage-completed" },
  to_ship: { border: "border-stage-ship", text: "text-stage-ship", bg: "bg-stage-ship", stripe: "bg-stage-ship" },
  close: { border: "border-stage-close", text: "text-stage-close", bg: "bg-stage-close", stripe: "bg-stage-close" },
};

function getCategoryColor(cat: string | null) {
  switch (cat?.toUpperCase()) {
    case "SALES": return "text-primary";
    case "SUPPORT": return "text-success";
    case "SPAM": return "text-muted-foreground";
    default: return "text-foreground";
  }
}

function getCategoryDot(cat: string | null) {
  switch (cat?.toUpperCase()) {
    case "SALES": return "bg-primary";
    case "SUPPORT": return "bg-success";
    case "SPAM": return "bg-muted-foreground";
    default: return "bg-foreground/40";
  }
}

function useRecentEmails() {
  return useQuery({
    queryKey: ["emails", "recent_inbox"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id, from_name, from_email, subject, category, status, created_at")
        .in("status", ["pending", "needs_response"])
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });
}

function useLatestInsightsNotification() {
  return useQuery({
    queryKey: ["stats", "latest_insight_notification"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_stats")
        .select("insights, month_start")
        .order("month_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

interface TodoItem {
  id: string;
  text: string;
  is_checked: boolean;
  created_at: string;
  checked_at: string | null;
}

function useTodos() {
  return useQuery({
    queryKey: ["dashboard_todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_todos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as TodoItem[];
    },
  });
}

function useSalesPipeline() {
  return useQuery({
    queryKey: ["sales_pipeline"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const [leadsRes, quotedRes, followUpRes, wonRes] = await Promise.all([
        supabase.from("emails").select("*", { count: "exact", head: true })
          .eq("category", "SALES").in("status", ["pending", "needs_response"]),
        supabase.from("emails").select("*", { count: "exact", head: true })
          .not("quoted_at", "is", null),
        supabase.from("emails").select("*", { count: "exact", head: true })
          .eq("status", "waiting").eq("direction", "outbound"),
        supabase.from("orders").select("*", { count: "exact", head: true })
          .gte("created_at", monthStart),
      ]);

      const leads = leadsRes.count || 0;
      const quoted = quotedRes.count || 0;
      const followUp = followUpRes.count || 0;
      const won = wonRes.count || 0;
      const conversion = leads > 0 ? Math.round((won / leads) * 100) : 0;

      return { leads, quoted, followUp, won, conversion };
    },
  });
}
export default function Dashboard({ searchQuery }: DashboardProps) {
  const { data: orders = [], isLoading } = useOrders();
  const { data: inboxCounts } = useInboxCounts();
  const { data: recentEmails = [] } = useRecentEmails();
  const { data: latestInsight } = useLatestInsightsNotification();
  const { data: todos = [] } = useTodos();
  const { data: pipeline } = useSalesPipeline();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [calDate, setCalDate] = useState<Date | undefined>(new Date());
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(["wip"]));
  // Mobile: only one stage expanded at a time
  const [mobileExpandedStage, setMobileExpandedStage] = useState<string | null>(null);

  // Notifications panel
  const [notifsOpen, setNotifsOpen] = useState(true);
  const [notifsOpenMobile, setNotifsOpenMobile] = useState(false); // collapsed on mobile by default
  const [dismissedNotifItems, setDismissedNotifItems] = useState<Set<string>>(new Set());
  const [dismissingNotifItems, setDismissingNotifItems] = useState<Set<string>>(new Set());
  const [clearNotifsDialog, setClearNotifsDialog] = useState(false);

  // Quick notes
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesOpenMobile, setNotesOpenMobile] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [pipelineOpenMobile, setPipelineOpenMobile] = useState(false);
  const [notes, setNotes] = useState<{ id: string; text: string; color: string }[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY_NOTES) || '[]'); } catch { return []; }
  });
  const [newNote, setNewNote] = useState("");
  const [clearNotesDialog, setClearNotesDialog] = useState(false);
  const noteColors = ["text-warning", "text-destructive", "text-primary"];

  // To-Do
  const [todoOpen, setTodoOpen] = useState(true);
  const [todoOpenMobile, setTodoOpenMobile] = useState(false);
  const [newTodo, setNewTodo] = useState("");
  const [clearTodosDialog, setClearTodosDialog] = useState(false);

  const addTodoMutation = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.from("dashboard_todos").insert({ text } as any);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard_todos"] }),
  });

  const toggleTodoMutation = useMutation({
    mutationFn: async ({ id, is_checked }: { id: string; is_checked: boolean }) => {
      const { error } = await supabase.from("dashboard_todos").update({
        is_checked,
        checked_at: is_checked ? new Date().toISOString() : null,
      } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard_todos"] }),
  });

  const clearCompletedMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("dashboard_todos").delete().eq("is_checked", true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard_todos"] });
      setClearTodosDialog(false);
    },
  });

  const addTodo = () => {
    if (!newTodo.trim()) return;
    addTodoMutation.mutate(newTodo.trim());
    setNewTodo("");
  };

  const uncheckedTodos = todos.filter(t => !t.is_checked);
  const checkedTodos = todos.filter(t => t.is_checked);

  // Calendar
  const [calOpenMobile, setCalOpenMobile] = useState(false);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_NOTES, JSON.stringify(notes));
  }, [notes]);

  const addNote = () => {
    if (!newNote.trim()) return;
    setNotes(prev => [...prev, { id: Date.now().toString(), text: newNote.trim(), color: noteColors[prev.length % 3] }]);
    setNewNote("");
  };

  const dismissNotification = (id: string, delayMs = 0) => {
    setTimeout(() => {
      setDismissingNotifItems(prev => new Set([...prev, id]));
      setTimeout(() => {
        setDismissedNotifItems(prev => new Set([...prev, id]));
        setDismissingNotifItems(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
    }, delayMs);
  };

  const clearAllNotifications = () => {
    visibleNotifs.forEach((n, idx) => dismissNotification(n.id, idx * 80));
    setClearNotifsDialog(false);
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
      if (o.client_po && !o.archived) map.set(o.client_po, (map.get(o.client_po) || 0) + 1);
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

  const toggleStage = (key: string) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleMobileStage = (key: string) => {
    setMobileExpandedStage(prev => prev === key ? null : key);
  };

  // QB review data
  const invoicesToReview = filtered.filter(o => o.invoice_num && !o.invoice_reviewed).length;
  const vendorPosToReview = filtered.filter(o => o.vendor_po && !o.vendor_po_reviewed).length;
  const qbAllClear = invoicesToReview === 0 && vendorPosToReview === 0;

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const now = new Date();
  const dateStr = format(now, "EEEE · MMMM dd · yyyy").toUpperCase();

  // Notification items
  const hasInsightUpdate = Boolean(latestInsight?.insights?.trim());
  const insightMonthLabel = latestInsight?.month_start
    ? format(new Date(latestInsight.month_start), "MMMM")
    : "this month";

  const notifItems = [
    inboxCounts && inboxCounts.actionNeeded > 0 && {
      id: "action",
      icon: <Mail size={14} className="text-primary shrink-0" />,
      text: `${inboxCounts.actionNeeded} email${inboxCounts.actionNeeded !== 1 ? "s" : ""} need attention`,
      onClick: () => navigate("/inbox"),
    },
    inboxCounts && inboxCounts.draftsToReview > 0 && {
      id: "drafts",
      icon: <FilePenLine size={14} className="text-warning shrink-0" />,
      text: `${inboxCounts.draftsToReview} draft${inboxCounts.draftsToReview !== 1 ? "s" : ""} ready to review`,
      onClick: () => navigate("/inbox?tab=drafts"),
    },
    hasInsightUpdate && {
      id: "insights",
      icon: <BarChart3 size={14} className="text-primary shrink-0" />,
      text: `AI insights updated for ${insightMonthLabel}`,
      onClick: () => navigate("/stats"),
    },
    inboxCounts && inboxCounts.autoHandledToday > 0 && {
      id: "auto",
      icon: <Zap size={14} className="text-success shrink-0" />,
      text: `${inboxCounts.autoHandledToday} auto-handled today`,
      onClick: () => navigate("/inbox"),
    },
    inboxCounts && inboxCounts.newCalls > 0 && {
      id: "calls",
      icon: <PhoneCall size={14} className="text-warning shrink-0" />,
      text: `${inboxCounts.newCalls} call${inboxCounts.newCalls !== 1 ? "s" : ""} to return`,
      onClick: () => navigate("/calls"),
    },
  ].filter(Boolean) as { id: string; icon: React.ReactNode; text: string; onClick: () => void }[];

  const visibleNotifs = notifItems.filter(n => !dismissedNotifItems.has(n.id));

  // Determine responsive open state helpers
  const isNotifsOpen = (isMobile: boolean) => isMobile ? notifsOpenMobile : notifsOpen;
  const toggleNotifs = (isMobile: boolean) => isMobile ? setNotifsOpenMobile(o => !o) : setNotifsOpen(o => !o);
  const isNotesOpen = (isMobile: boolean) => isMobile ? notesOpenMobile : notesOpen;
  const toggleNotes = (isMobile: boolean) => isMobile ? setNotesOpenMobile(o => !o) : setNotesOpen(o => !o);

  // Render notification panel content (shared)
  const renderNotifPanel = (mobile: boolean) => {
    const open = mobile ? notifsOpenMobile : notifsOpen;
    const toggle = () => mobile ? setNotifsOpenMobile(o => !o) : setNotifsOpen(o => !o);
    return (
      <div className="floating-card !p-0 overflow-hidden">
        <button onClick={toggle}
          className="flex items-center justify-between w-full px-4 py-3 bg-surface-header border-b text-left min-h-[44px]"
          style={{ borderBottomWidth: '1.5px' }}>
          <span className="text-sm font-bold">
            Notifications & QB
            {!open && visibleNotifs.length > 0 && (
              <span className="ml-2 text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">{visibleNotifs.length}</span>
            )}
          </span>
          {visibleNotifs.length > 0 && open && (
            <span className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); setClearNotifsDialog(true); }}>Clear all</span>
          )}
        </button>
        <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[400px]' : 'max-h-0'}`}>
          <div className="p-3 md:p-4 space-y-2">
            {visibleNotifs.map(n => (
              <div key={n.id}
                className={`group relative flex items-start gap-2 text-sm rounded-[9px] pr-7 transition-all duration-300 ${dismissingNotifItems.has(n.id) ? "opacity-0 translate-x-5" : "opacity-100 translate-x-0"}`}>
                <button onClick={n.onClick} className="flex items-center gap-2 flex-1 text-left transition-colors min-h-[44px] py-1">
                  {n.icon}
                  <span className="font-medium text-xs leading-snug">{n.text}</span>
                </button>
                <button onClick={() => dismissNotification(n.id)}
                  className={`absolute top-1 right-1 transition-opacity w-7 h-7 md:w-5 md:h-5 rounded-full bg-muted flex items-center justify-center ${mobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                  aria-label="Dismiss notification">
                  <X size={mobile ? 12 : 10} />
                </button>
              </div>
            ))}
            {visibleNotifs.length === 0 && (
              <p className="text-xs text-muted-foreground">No new notifications</p>
            )}
            <div className="border-t pt-2 mt-2">
              <div className="flex items-center gap-2 text-sm">
                <ClipboardList size={14} className="text-primary shrink-0" />
                {qbAllClear ? (
                  <span className="font-bold text-success text-xs">QB: All caught up ✓</span>
                ) : (
                  <button onClick={() => navigate("/orders")} className="font-medium text-xs transition-colors">
                    {invoicesToReview + vendorPosToReview} QB items to review
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render notes panel (shared)
  const renderNotesPanel = (mobile: boolean) => {
    const open = mobile ? notesOpenMobile : notesOpen;
    const toggle = () => mobile ? setNotesOpenMobile(o => !o) : setNotesOpen(o => !o);
    return (
      <div className="rounded-[13px] overflow-hidden bg-card" style={{ border: '0.5px solid hsl(var(--border))' }}>
        <button onClick={toggle}
          className="flex items-center justify-between w-full px-4 py-3 text-left min-h-[44px]">
          <span className="text-sm font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            Quick Notes
            {!open && notes.length > 0 && (
              <span className="text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">{notes.length}</span>
            )}
          </span>
          <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[400px]' : 'max-h-0'}`}>
          <div className="px-4 pb-3 space-y-2">
            {notes.map((n, i) => (
              <div key={n.id} className="group flex items-start gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${n.color === 'text-warning' ? 'bg-warning' : n.color === 'text-destructive' ? 'bg-destructive' : 'bg-primary'}`} />
                <span className="flex-1 text-xs">{n.text}</span>
                <button onClick={() => setNotes(prev => prev.filter((_, j) => j !== i))}
                  className={`transition-opacity rounded-full bg-muted flex items-center justify-center shrink-0 ${mobile ? 'opacity-100 w-7 h-7' : 'opacity-0 group-hover:opacity-100 w-5 h-5'}`}>
                  <X size={mobile ? 12 : 10} />
                </button>
              </div>
            ))}
            {notes.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No notes yet</p>
            )}
            <div className="flex gap-2 mt-2">
              <input
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                placeholder="Add a note..."
                className="flex-1 text-xs bg-background border rounded-[9px] px-2.5 py-2 min-h-[40px] md:min-h-[36px]"
              />
              <button onClick={addNote} className="text-primary font-bold text-xs px-2 min-h-[40px] md:min-h-[36px]">+</button>
            </div>
            {notes.length > 0 && (
              <button onClick={() => setClearNotesDialog(true)}
                className="text-[10px] text-muted-foreground hover:text-foreground">Clear all</button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render sales pipeline panel
  const renderPipelinePanel = (mobile: boolean) => {
    const open = mobile ? pipelineOpenMobile : pipelineOpen;
    const toggle = () => mobile ? setPipelineOpenMobile(o => !o) : setPipelineOpen(o => !o);
    const p = pipeline || { leads: 0, quoted: 0, followUp: 0, won: 0, conversion: 0 };
    const maxCount = Math.max(p.leads, p.quoted, p.followUp, p.won, 1);

    const bars = [
      { label: "Leads", count: p.leads, color: "bg-primary" },
      { label: "Quoted", count: p.quoted, color: "bg-warning" },
      { label: "Follow-up", count: p.followUp, color: "bg-[hsl(263,70%,55%)]" },
      { label: "Won", count: p.won, color: "bg-success" },
    ];

    return (
      <div className="rounded-[13px] overflow-hidden bg-card" style={{ border: '1.5px solid hsl(var(--warning))' }}>
        <button onClick={toggle}
          className="flex items-center justify-between w-full px-4 py-3 text-left min-h-[44px]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-warning shrink-0" />
            <span className="text-sm font-bold">Sales Pipeline</span>
            {!open && (
              <span className="text-[10px] text-muted-foreground ml-1">
                {p.leads} leads · {p.won} won
              </span>
            )}
          </div>
          <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[400px]' : 'max-h-0'}`}>
          <div className="px-4 pb-3 space-y-2.5">
            {bars.map(b => (
              <div key={b.label} className="flex items-center gap-2">
                <span className="text-xs font-medium w-16 shrink-0">{b.label}</span>
                <div className="flex-1 h-5 bg-muted/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${b.color} transition-all duration-500`}
                    style={{ width: `${Math.max((b.count / maxCount) * 100, b.count > 0 ? 8 : 0)}%` }} />
                </div>
                <span className="text-xs font-bold w-6 text-right">{b.count}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-1 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Conversion Rate</span>
              <span className={`text-sm font-bold ${p.conversion >= 20 ? 'text-success' : p.conversion >= 10 ? 'text-warning' : 'text-destructive'}`}>
                {p.conversion}%
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render to-do panel
  const renderTodoPanel = (mobile: boolean) => {
    const open = mobile ? todoOpenMobile : todoOpen;
    const toggle = () => mobile ? setTodoOpenMobile(o => !o) : setTodoOpen(o => !o);
    return (
      <div className="floating-card !p-0 overflow-hidden">
        <button onClick={toggle}
          className="flex items-center justify-between w-full px-4 py-3 bg-surface-header border-b text-left min-h-[44px]"
          style={{ borderBottomWidth: '1.5px' }}>
          <span className="text-sm font-bold flex items-center gap-1.5">
            <CheckSquare size={14} className="text-primary" />
            To-Do
            {!open && todos.length > 0 && (
              <span className="ml-1 text-[10px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">{uncheckedTodos.length}</span>
            )}
          </span>
        </button>
        <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[500px]' : 'max-h-0'}`}>
          <div className="p-3 md:p-4 space-y-2">
            {/* Quick-add input */}
            <div className="flex gap-2">
              <input
                value={newTodo}
                onChange={e => setNewTodo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTodo()}
                placeholder="Add a to-do..."
                className="flex-1 text-xs bg-background border rounded-[9px] px-2.5 py-2 min-h-[40px] md:min-h-[36px]"
              />
              <button onClick={addTodo} className="text-xs font-bold bg-primary text-primary-foreground px-3 rounded-[9px] min-h-[40px] md:min-h-[36px]">Add</button>
            </div>
            {/* Todo list */}
            <div className="max-h-[250px] overflow-y-auto space-y-1">
              {uncheckedTodos.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1.5 min-h-[36px]">
                  <Checkbox checked={false} onCheckedChange={() => toggleTodoMutation.mutate({ id: t.id, is_checked: true })} />
                  <span className="text-sm font-semibold flex-1">{t.text}</span>
                </div>
              ))}
              {checkedTodos.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1.5 min-h-[36px] opacity-50">
                  <Checkbox checked={true} onCheckedChange={() => toggleTodoMutation.mutate({ id: t.id, is_checked: false })} />
                  <span className="text-sm font-semibold flex-1 line-through">{t.text}</span>
                </div>
              ))}
              {todos.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-1">No to-dos yet</p>
              )}
            </div>
            {/* Clear completed */}
            {checkedTodos.length > 0 && (
              <button onClick={() => setClearTodosDialog(true)}
                className="text-[10px] font-medium text-destructive hover:underline mt-1">
                Clear Completed ({checkedTodos.length})
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderStageOrders = (stageKey: string) => {
    const stageOrders = filtered.filter(o => o.stage === stageKey);
    const s = stageCounts.find(sc => sc.key === stageKey)!;
    return (
      <div className="space-y-2 p-3">
        {stageOrders.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">No orders in this stage</p>
        ) : (
          stageOrders.map((order) => {
            const days = daysUntilDue(order.due_date);
            const daysIn = daysSinceCreated(order.date_entered);
            const poPos = getPoPosition(order);
            return (
              <div key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="bg-background/60 border rounded-[9px] p-3 cursor-pointer active:scale-[0.98] md:hover:shadow-md md:hover:-translate-y-[3px] transition-all duration-[180ms]"
              >
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm">{order.item_name}</span>
                  {order.notes && <StickyNote size={11} className="text-warning shrink-0" />}
                </div>
                <div className="text-xs text-muted-foreground">{order.clients?.company}</div>
                {poPos && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                    <Link2 size={10} />
                    <span>{poPos.index} of {poPos.total}</span>
                  </div>
                )}
                {stageKey === "preflight" && (
                  <div className={`text-xs mt-1.5 font-medium ${daysIn > 14 ? "text-destructive" : daysIn > 7 ? "text-warning" : "text-muted-foreground"}`}>
                    {daysIn} day{daysIn !== 1 ? "s" : ""} in New Order
                  </div>
                )}
                {stageKey === "wip" && days !== null && (
                  <div className={`text-xs mt-1.5 font-medium ${days < 0 ? "text-destructive" : days < 7 ? "text-warning" : "text-muted-foreground"}`}>
                    {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                  </div>
                )}
                {stageKey === "completed" && (
                  <div className={`text-xs mt-1.5 font-medium ${order.paid ? "text-success" : "text-destructive"}`}>
                    {order.paid ? "✓ Paid" : "Awaiting Payment"}
                  </div>
                )}
                {stageKey === "to_ship" && (
                  <div className={`text-xs mt-1.5 font-medium ${order.outgoing_bol ? "text-success" : "text-destructive"}`}>
                    {order.outgoing_bol ? "✓ BOL Ready" : "BOL Needed"}
                  </div>
                )}
                {stageKey === "close" && (
                  <div className="text-xs mt-1.5 font-medium text-success">Ready to Archive</div>
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  const mobileEmails = recentEmails.slice(0, 4);

  return (
    <div className="p-3 md:p-6 space-y-3 md:space-y-5 max-w-[1600px]">
      {/* Date header */}
      <div className="flex justify-center">
        <div className="inline-block bg-surface border border-border-mid px-4 md:px-6 py-1.5 md:py-2.5 rounded-[7px] md:rounded-[9px] shadow-sm">
          <span className="text-[12px] md:text-[15px] font-bold md:font-extrabold tracking-[0.05em] text-foreground">{dateStr}</span>
        </div>
      </div>

      {/* ===== MOBILE PIPELINE: horizontal scroll strip ===== */}
      <div className="md:hidden">
        <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
          {stageCounts.map((s) => {
            const colors = stageColors[s.key] || stageColors.close;
            const isActive = mobileExpandedStage === s.key;
            return (
              <div key={s.key}
                className={`flex-shrink-0 w-[120px] snap-start floating-card !p-0 overflow-hidden cursor-pointer active:scale-[0.97] transition-transform ${isActive ? 'ring-2 ring-primary/30' : ''}`}
                onClick={() => toggleMobileStage(s.key)}
              >
                <div className={`h-[3px] ${colors.stripe}`} />
                <div className="p-2.5">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{s.label}</div>
                  <div className={`text-[36px] leading-none font-extrabold ${colors.text}`}>{s.count}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{s.description}</div>
                </div>
              </div>
            );
          })}
        </div>
        {/* Mobile expanded stage panel */}
        {mobileExpandedStage && (
          <div className="floating-card !p-0 overflow-hidden mt-2 animate-in slide-in-from-top-2 duration-200">
            <div className={`h-[3px] ${stageColors[mobileExpandedStage]?.stripe || ''}`} />
            <div className="flex items-center justify-between px-3 py-2 bg-surface-header border-b" style={{ borderBottomWidth: '1px' }}>
              <span className="text-xs font-bold uppercase tracking-wide">
                {stageCounts.find(s => s.key === mobileExpandedStage)?.label}
              </span>
              <button onClick={() => setMobileExpandedStage(null)} className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
                <X size={12} />
              </button>
            </div>
            {renderStageOrders(mobileExpandedStage)}
          </div>
        )}
      </div>

      {/* ===== DESKTOP PIPELINE: 5-column grid ===== */}
      <div className="hidden md:grid grid-cols-2 lg:grid-cols-5 gap-[11px]">
        {stageCounts.map((s) => {
          const colors = stageColors[s.key] || stageColors.close;
          const isOpen = expandedStages.has(s.key);
          const stageOrders = filtered.filter(o => o.stage === s.key);

          return (
            <div key={s.key}
              className={`floating-card !p-0 overflow-hidden cursor-pointer transition-all duration-[350ms] ${isOpen ? colors.border : ''}`}
              style={{ borderTopWidth: isOpen ? '1.5px' : '1.5px' }}
              onClick={() => toggleStage(s.key)}
            >
              <div className={`h-[3px] ${colors.stripe}`} />
              <div className="p-4 flex items-start justify-between">
                <div>
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{s.label}</div>
                  <div className={`text-[54px] leading-none font-extrabold ${colors.text}`}>{s.count}</div>
                  <div className="text-[11.5px] text-muted-foreground mt-1">{s.description}</div>
                </div>
                <ChevronRight size={16} className={`text-muted-foreground mt-1 transition-transform duration-300 ${isOpen ? 'rotate-90' : ''}`} />
              </div>
              <div className={`overflow-hidden transition-all duration-[350ms] ease-[cubic-bezier(0.4,0,0.2,1)] ${isOpen ? 'max-h-[600px]' : 'max-h-0'}`}
                style={isOpen && s.key === 'wip' ? { borderLeft: `3px solid hsl(var(--stage-wip))` } : {}}>
                <div className="px-4 pb-4 space-y-2">
                  {stageOrders.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">No orders in this stage</p>
                  ) : (
                    stageOrders.map((order) => {
                      const days = daysUntilDue(order.due_date);
                      const daysIn = daysSinceCreated(order.date_entered);
                      const poPos = getPoPosition(order);
                      return (
                        <div key={order.id}
                          onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}`); }}
                          className="bg-background/60 border rounded-[9px] p-3 cursor-pointer hover:shadow-md hover:-translate-y-[3px] transition-all duration-[180ms]"
                        >
                          <div className="flex items-center gap-1">
                            <span className="font-semibold text-sm">{order.item_name}</span>
                            {order.notes && <StickyNote size={11} className="text-warning shrink-0" />}
                          </div>
                          <div className="text-xs text-muted-foreground">{order.clients?.company}</div>
                          {poPos && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                              <Link2 size={10} />
                              <span>{poPos.index} of {poPos.total}</span>
                            </div>
                          )}
                          {s.key === "preflight" && (
                            <div className={`text-xs mt-1.5 font-medium ${daysIn > 14 ? "text-destructive" : daysIn > 7 ? "text-warning" : "text-muted-foreground"}`}>
                              {daysIn} day{daysIn !== 1 ? "s" : ""} in New Order
                            </div>
                          )}
                          {s.key === "wip" && days !== null && (
                            <div className={`text-xs mt-1.5 font-medium ${days < 0 ? "text-destructive" : days < 7 ? "text-warning" : "text-muted-foreground"}`}>
                              {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d remaining`}
                            </div>
                          )}
                          {s.key === "completed" && (
                            <div className={`text-xs mt-1.5 font-medium ${order.paid ? "text-success" : "text-destructive"}`}>
                              {order.paid ? "✓ Paid" : "Awaiting Payment"}
                            </div>
                          )}
                          {s.key === "to_ship" && (
                            <div className={`text-xs mt-1.5 font-medium ${order.outgoing_bol ? "text-success" : "text-destructive"}`}>
                              {order.outgoing_bol ? "✓ BOL Ready" : "BOL Needed"}
                            </div>
                          )}
                          {s.key === "close" && (
                            <div className="text-xs mt-1.5 font-medium text-success">Ready to Archive</div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== LOWER SECTION ===== */}
      {/* Desktop: 2-column grid. Mobile: stacked */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-3 md:gap-[14px] items-start">
        {/* Left column: Recent Inbox + Notes & To-Do */}
        <div className="space-y-3 md:space-y-[14px]">
          {/* Recent Inbox */}
          <div className="floating-card !p-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 md:px-5 py-3 bg-surface-header border-b" style={{ borderBottomWidth: '1.5px' }}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold">Recent Inbox</span>
                {inboxCounts && inboxCounts.actionNeeded > 0 && (
                  <span className="text-[10px] font-bold bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded">{inboxCounts.actionNeeded} unread</span>
                )}
              </div>
              <button onClick={() => navigate("/inbox")} className="text-xs font-semibold text-primary">View all →</button>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs">From</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs">Subject</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs">Type</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs">Status</th>
                    <th className="text-left p-3 font-semibold text-muted-foreground text-xs">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEmails.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-xs text-muted-foreground">
                        <button onClick={() => navigate("/inbox")} className="text-primary font-medium">Open Inbox to view emails →</button>
                      </td>
                    </tr>
                  ) : (
                    recentEmails.map((e: any) => {
                      const senderName = e.from_name?.includes("@") ? e.from_name.split("@")[0] : (e.from_name || e.from_email || "Unknown");
                      const timeAgo = e.created_at ? formatDistanceToNowStrict(new Date(e.created_at), { addSuffix: true }) : "";
                      return (
                        <tr key={e.id} onClick={() => navigate("/inbox")} className="border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                          <td className="p-3 font-medium text-sm">{senderName}</td>
                          <td className="p-3 text-sm truncate max-w-[200px]">{e.subject || "—"}</td>
                          <td className="p-3">
                            <span className="flex items-center gap-1.5 text-xs">
                              <span className={`w-2 h-2 rounded-full ${getCategoryDot(e.category)}`} />
                              <span className={getCategoryColor(e.category)}>{e.category || "OTHER"}</span>
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="text-xs text-muted-foreground">{e.status}</span>
                          </td>
                          <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{timeAgo}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile email list: compact rows */}
            <div className="md:hidden">
              {mobileEmails.length === 0 ? (
                <div className="p-4 text-center">
                  <button onClick={() => navigate("/inbox")} className="text-primary font-medium text-xs">Open Inbox →</button>
                </div>
              ) : (
                mobileEmails.map((e: any) => {
                  const senderName = e.from_name?.includes("@") ? e.from_name.split("@")[0] : (e.from_name || e.from_email || "Unknown");
                  const timeAgo = e.created_at ? formatDistanceToNowStrict(new Date(e.created_at), { addSuffix: true }) : "";
                  return (
                    <div key={e.id} onClick={() => navigate("/inbox")}
                      className="px-3 py-3 border-b last:border-b-0 cursor-pointer active:bg-muted/30 min-h-[52px] flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-[13px] truncate">{senderName}</div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{e.subject || "—"}</div>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{timeAgo}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Notes & To-Do side by side on desktop */}
          <div className="hidden md:grid grid-cols-2 gap-[14px]">
            {renderNotesPanel(false)}
            {renderTodoPanel(false)}
          </div>
          {/* Mobile: stacked */}
          <div className="md:hidden space-y-3">
            {renderNotesPanel(true)}
            {renderTodoPanel(true)}
          </div>
        </div>

        {/* Right column: Notifications + Calendar */}
        <div className="space-y-3 md:space-y-[14px]">
          {/* Desktop */}
          <div className="hidden md:block space-y-[14px]">
            {renderNotifPanel(false)}
            <div className="floating-card">
              <h3 className="text-sm font-bold mb-3">Calendar</h3>
              <p className="text-xs text-muted-foreground mb-2">{format(calDate || new Date(), "MMMM yyyy")}</p>
              <Calendar mode="single" selected={calDate} onSelect={setCalDate} className="p-0 pointer-events-auto" />
            </div>
          </div>

          {/* Mobile: collapsible panels */}
          <div className="md:hidden space-y-3">
            {renderNotifPanel(true)}
            {/* Calendar - collapsible on mobile */}
            <div className="floating-card !p-0 overflow-hidden">
              <button onClick={() => setCalOpenMobile(o => !o)}
                className="flex items-center justify-between w-full px-4 py-3 bg-surface-header border-b text-left min-h-[44px]"
                style={{ borderBottomWidth: '1.5px' }}>
                <span className="text-sm font-bold">Calendar</span>
              </button>
              <div className={`overflow-hidden transition-all duration-300 ${calOpenMobile ? 'max-h-[400px]' : 'max-h-0'}`}>
                <div className="p-3">
                  <p className="text-xs text-muted-foreground mb-2">{format(calDate || new Date(), "MMMM yyyy")}</p>
                  <Calendar mode="single" selected={calDate} onSelect={setCalDate} className="p-0 pointer-events-auto [&_.rdp-day]:min-w-[36px] [&_.rdp-day]:min-h-[36px]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Clear notifications dialog */}
      <AlertDialog open={clearNotifsDialog} onOpenChange={setClearNotifsDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={clearAllNotifications}>Clear All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear notes dialog */}
      <AlertDialog open={clearNotesDialog} onOpenChange={setClearNotesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all notes?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setNotes([]); setClearNotesDialog(false); }}>Clear All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear todos dialog */}
      <AlertDialog open={clearTodosDialog} onOpenChange={setClearTodosDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove all completed to-do items?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => clearCompletedMutation.mutate()}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}