import { useOrders } from "@/lib/data";
import { STAGES, daysUntilDue, daysSinceCreated } from "@/lib/constants";
import { useNavigate } from "react-router-dom";
import { StickyNote, Link2, ChevronRight, ChevronDown, X, CheckSquare, ClipboardList, Pencil } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


interface DashboardProps {
  searchQuery: string;
}

interface SystemLogEntry {
  timestamp: string;
  counts?: { resolved?: number; sent?: number; deleted?: number; spam?: number };
  details?: {
    resolved?: { name?: string; subject?: string }[];
    sent?: { name?: string; subject?: string }[];
    deleted?: { name?: string; subject?: string }[];
    spam?: { name?: string; subject?: string }[];
  };
}

interface UserNote {
  id: string;
  text: string;
  created_at: string;
}

const stageColors: Record<string, { border: string; text: string; bg: string; stripe: string }> = {
  preflight: { border: "border-stage-new", text: "text-stage-new", bg: "bg-stage-new", stripe: "bg-stage-new" },
  wip: { border: "border-stage-wip", text: "text-stage-wip", bg: "bg-stage-wip", stripe: "bg-stage-wip" },
  completed: { border: "border-stage-completed", text: "text-stage-completed", bg: "bg-stage-completed", stripe: "bg-stage-completed" },
  to_ship: { border: "border-stage-ship", text: "text-stage-ship", bg: "bg-stage-ship", stripe: "bg-stage-ship" },
  close: { border: "border-stage-close", text: "text-stage-close", bg: "bg-stage-close", stripe: "bg-stage-close" },
};

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

export default function Dashboard({ searchQuery }: DashboardProps) {
  const { data: orders = [], isLoading } = useOrders();
  const { data: todos = [] } = useTodos();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [calDate, setCalDate] = useState<Date | undefined>(new Date());
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set(["wip"]));
  const [mobileExpandedStage, setMobileExpandedStage] = useState<string | null>(null);

  // Quick notes (persistent: system_log + user_notes from quick_notes row id=1)
  const [notesOpen, setNotesOpen] = useState(true);
  const [notesOpenMobile, setNotesOpenMobile] = useState(false);
  const [systemLog, setSystemLog] = useState<SystemLogEntry[]>([]);
  const [userNotes, setUserNotes] = useState<UserNote[]>([]);
  const [newNoteInput, setNewNoteInput] = useState("");
  const [expandedLogIdx, setExpandedLogIdx] = useState<Set<number>>(new Set());

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

  // Initial fetch + realtime subscription for quick_notes row id=1
  useEffect(() => {
    let mounted = true;
    const parseNotes = (v: any): UserNote[] => Array.isArray(v) ? v as UserNote[] : [];
    (async () => {
      const { data } = await supabase.from("quick_notes").select("id, system_log, user_notes").eq("id", 1).maybeSingle();
      if (!mounted || !data) return;
      const log = Array.isArray(data.system_log) ? (data.system_log as unknown as SystemLogEntry[]) : [];
      setSystemLog(log);
      setUserNotes(parseNotes(data.user_notes));
    })();
    const channel = supabase
      .channel("quick_notes_row")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quick_notes", filter: "id=eq.1" }, (payload) => {
        const row: any = payload.new;
        if (!row) return;
        const log = Array.isArray(row.system_log) ? (row.system_log as SystemLogEntry[]) : [];
        setSystemLog(log);
        setUserNotes(parseNotes(row.user_notes));
      })
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const addUserNote = async () => {
    const trimmed = newNoteInput.trim();
    if (!trimmed) return;
    const note: UserNote = { id: Date.now().toString(), text: trimmed, created_at: new Date().toISOString() };
    const prev = userNotes;
    const next = [note, ...userNotes];
    setUserNotes(next);
    setNewNoteInput("");
    const { error } = await supabase.from("quick_notes").update({ user_notes: next as any } as any).eq("id", 1);
    if (error) {
      console.error("Failed to save note:", error);
      toast.error("Failed to save note");
      setUserNotes(prev);
    }
  };

  const deleteUserNote = async (id: string) => {
    const prev = userNotes;
    const next = userNotes.filter(n => n.id !== id);
    setUserNotes(next);
    const { error } = await supabase.from("quick_notes").update({ user_notes: next as any } as any).eq("id", 1);
    if (error) {
      console.error("Failed to delete note:", error);
      toast.error("Failed to delete note");
      setUserNotes(prev);
    }
  };

  const deleteSystemLogEntry = async (timestamp: string) => {
    const prev = systemLog;
    const next = systemLog.filter(e => e.timestamp !== timestamp);
    setSystemLog(next);
    const { error } = await supabase.from("quick_notes").update({ system_log: next as any } as any).eq("id", 1);
    if (error) {
      console.error("Failed to delete log entry:", error);
      toast.error("Failed to delete log entry");
      setSystemLog(prev);
    }
  };

  const formatNoteTime = (iso: string) => {
    try { return format(new Date(iso), "MMM d, h:mma").replace("AM", "am").replace("PM", "pm"); }
    catch { return iso; }
  };

  // Sort newest first
  const sortedLog = useMemo(() => {
    return [...systemLog].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [systemLog]);

  const toggleLogIdx = (i: number) => {
    setExpandedLogIdx(prev => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });
  };

  const formatLogTime = (iso: string) => {
    try { return format(new Date(iso), "MMM d, h:mma").replace("AM", "am").replace("PM", "pm"); }
    catch { return iso; }
  };

  const countSummary = (counts?: SystemLogEntry["counts"]) => {
    if (!counts) return "";
    const order: (keyof NonNullable<SystemLogEntry["counts"]>)[] = ["resolved", "sent", "deleted", "spam"];
    return order.filter(k => (counts[k] || 0) > 0).map(k => `${counts[k]} ${k}`).join(", ");
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

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;

  const now = new Date();
  const dateStr = format(now, "EEEE · MMMM dd · yyyy").toUpperCase();

  // Render notes panel (shared) — System Log (read-only) + My Notes (editable, persistent)
  const renderNotesPanel = (mobile: boolean) => {
    const open = mobile ? notesOpenMobile : notesOpen;
    const toggle = () => mobile ? setNotesOpenMobile(o => !o) : setNotesOpen(o => !o);
    return (
      <div className="rounded-[13px] overflow-hidden bg-card" style={{ border: '1.5px solid hsl(var(--primary))' }}>
        <button onClick={toggle}
          className="flex items-center justify-between w-full px-4 py-3 text-left min-h-[44px]">
          <span className="text-sm font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            Quick Notes
          </span>
          <ChevronDown size={14} className={`text-muted-foreground transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        <div className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-[700px]' : 'max-h-0'}`}>
          {/* System log section */}
          <div className="px-4 py-3 bg-muted/40 border-t" style={{ borderTopWidth: '1px' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <ClipboardList size={12} className="text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground">System log</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto space-y-1.5 pr-1">
              {sortedLog.length === 0 && (
                <p className="text-xs italic text-muted-foreground">No reconciliation activity yet.</p>
              )}
              {sortedLog.map((entry, i) => {
                const isOpen = expandedLogIdx.has(i);
                const summary = countSummary(entry.counts);
                const cats: ("resolved" | "sent" | "deleted" | "spam")[] = ["resolved", "sent", "deleted", "spam"];
                return (
                  <div key={`${entry.timestamp}-${i}`} className="text-xs">
                    <div className="flex items-start gap-1">
                      <button
                        onClick={() => toggleLogIdx(i)}
                        className="flex items-start gap-1 flex-1 text-left italic text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isOpen
                          ? <ChevronDown size={12} className="mt-0.5 shrink-0" />
                          : <ChevronRight size={12} className="mt-0.5 shrink-0" />}
                        <span className="flex-1">
                          {formatLogTime(entry.timestamp)} · {summary || "no activity"}
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSystemLogEntry(entry.timestamp); }}
                        className="shrink-0 p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                        aria-label="Delete log entry"
                      >
                        <X size={11} />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="pl-4 mt-1 space-y-1.5">
                        {cats.map(cat => {
                          const items = entry.details?.[cat] || [];
                          if (items.length === 0) return null;
                          return (
                            <div key={cat}>
                              <div className="text-[10px] font-semibold capitalize text-muted-foreground">{cat}:</div>
                              <ul className="pl-3">
                                {items.map((it, j) => (
                                  <li key={j} className="text-[11px] italic text-muted-foreground">
                                    • {it.name || "Unknown"}{it.subject ? ` — ${it.subject}` : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* Divider */}
          <div className="border-t" />
          {/* My notes section */}
          <div className="px-4 py-3 bg-card">
            <div className="flex items-center gap-1.5 mb-2">
              <Pencil size={12} className="text-muted-foreground" />
              <span className="text-xs font-bold text-muted-foreground">My notes</span>
            </div>
            <input
              type="text"
              value={newNoteInput}
              onChange={(e) => setNewNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUserNote(); } }}
              placeholder="Type a note and press Enter..."
              className="w-full text-xs bg-transparent border rounded-[9px] px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mt-2 max-h-[220px] overflow-y-auto space-y-1 pr-1">
              {userNotes.length === 0 && (
                <p className="text-xs italic text-muted-foreground">No notes yet.</p>
              )}
              {userNotes.map((n, i) => (
                <div
                  key={n.id}
                  className={`flex items-start gap-2.5 text-xs py-1.5 min-h-[36px] group ${i !== userNotes.length - 1 ? 'border-b border-border/60' : ''}`}
                >
                  <span aria-hidden="true" className="shrink-0 mt-[7px] w-1.5 h-1.5 rounded-full bg-sidebar-background" />
                  <span className="flex-1 break-words">{n.text}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground/70 mt-0.5">{formatNoteTime(n.created_at)}</span>
                  <button
                    onClick={() => deleteUserNote(n.id)}
                    className="shrink-0 p-0.5 text-muted-foreground/60 hover:text-muted-foreground transition-colors mt-0.5"
                    aria-label="Delete note"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
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
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold flex items-center gap-1.5">
                      {t.text.startsWith("QB:") && (
                        <span className="inline-block text-[9px] font-bold px-1.5 py-px rounded" style={{ backgroundColor: '#dcfce7', color: '#16a34a', borderRadius: 4 }}>QB</span>
                      )}
                      {t.text.startsWith("QB:") ? t.text.slice(3).trim() : t.text}
                    </span>
                    {t.created_at && <span className="block text-[10px] text-muted-foreground mt-0.5">{format(new Date(t.created_at), "MMM d, yyyy")}</span>}
                  </div>
                </div>
              ))}
              {checkedTodos.map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1.5 min-h-[36px] opacity-50">
                  <Checkbox checked={true} onCheckedChange={() => toggleTodoMutation.mutate({ id: t.id, is_checked: false })} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold line-through flex items-center gap-1.5">
                      {t.text.startsWith("QB:") && (
                        <span className="inline-block text-[9px] font-bold px-1.5 py-px rounded" style={{ backgroundColor: '#dcfce7', color: '#16a34a', borderRadius: 4 }}>QB</span>
                      )}
                      {t.text.startsWith("QB:") ? t.text.slice(3).trim() : t.text}
                    </span>
                    {t.created_at && <span className="block text-[10px] text-muted-foreground mt-0.5">{format(new Date(t.created_at), "MMM d, yyyy")}</span>}
                  </div>
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

      {/* ===== LOWER SECTION: 3-column layout ===== */}
      {/* Desktop: To-Do (55%) | Quick Notes (45% of remaining) | Calendar (same width as Close card) */}
      <div className="hidden md:grid gap-[14px] items-start" style={{ gridTemplateColumns: '11fr 9fr 1fr' }}>
        {/* Left: To-Do */}
        {renderTodoPanel(false)}
        {/* Middle: Quick Notes */}
        {renderNotesPanel(false)}
        {/* Right: Calendar */}
        <div className="floating-card" style={{ gridColumn: '3' }}>
          <h3 className="text-sm font-bold mb-3">Calendar</h3>
          <p className="text-xs text-muted-foreground mb-2">{format(calDate || new Date(), "MMMM yyyy")}</p>
          <Calendar mode="single" selected={calDate} onSelect={setCalDate} className="p-0 pointer-events-auto" />
        </div>
      </div>

      {/* Mobile: stacked */}
      <div className="md:hidden space-y-3">
        {renderTodoPanel(true)}
        {renderNotesPanel(true)}
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
