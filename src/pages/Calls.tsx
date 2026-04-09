import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCalls, useUpdateCall, Call } from "@/lib/emailData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, CheckCircle, PhoneCall, AlertTriangle, Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { CallCrossMatchBanner } from "@/components/CrossMatchBanner";
import { OutboundCallModal } from "@/components/OutboundCallModal";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RelatedEmails } from "@/components/calls/RelatedEmails";
import { OutboundCallDrawer } from "@/components/calls/OutboundCallDrawer";

type MainTab = "inbound" | "outbound" | "resolved";


const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  SALES_NEW: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  SALES_FOLLOWUP: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  SUPPORT: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" },
  EXISTING_CLIENT: { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300" },
  CALLBACK_REQUEST: { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-700 dark:text-yellow-300" },
  SHIPPING: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" },
};

function CategoryBadge({ category }: { category: string | null }) {
  if (!category || !category.startsWith("SALES")) return null;
  const colors = CATEGORY_COLORS[category] || { bg: "bg-secondary", text: "text-secondary-foreground" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
      SALES
    </span>
  );
}

function hasQuoteDetails(qd: any): boolean {
  if (!qd) return false;
  if (typeof qd === "string") return qd.trim() !== "" && qd.trim() !== "{}";
  if (typeof qd === "object") return Object.keys(qd).length > 0;
  return false;
}

export default function Calls() {
  const [mainTab, setMainTab] = useState<MainTab>("inbound");
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [generatingQuote, setGeneratingQuote] = useState(false);
  const [sendingQuote, setSendingQuote] = useState(false);
  const [editableEmail, setEditableEmail] = useState("");
  const [quoteAttachments, setQuoteAttachments] = useState<AttachedFile[]>([]);
  const [outboundOpen, setOutboundOpen] = useState(false);
  const [outboundNumber, setOutboundNumber] = useState("");
  const [outboundName, setOutboundName] = useState("");
  const [clearingResolved, setClearingResolved] = useState(false);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearConfirmStep, setClearConfirmStep] = useState<"archive" | "delete" | null>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  // Sync editable email when selectedCall changes
  useEffect(() => {
    setEditableEmail(selectedCall?.email || "");
  }, [selectedCall?.id, selectedCall?.email]);

  const { data: pendingCalls = [], isLoading: loadingPending } = useCalls({ neq: "resolved" });
  const { data: resolvedCalls = [], isLoading: loadingResolved } = useCalls({ eq: "resolved" });

  // Fetch call IDs that were auto-resolved via email send
  const { data: emailResolvedCallIds = [] } = useQuery({
    queryKey: ["email_resolved_calls"],
    queryFn: async () => {
      const { data } = await supabase
        .from("emails")
        .select("call_id")
        .not("call_id", "is", null);
      return (data || []).map(r => r.call_id).filter(Boolean) as string[];
    },
  });
  const updateCall = useUpdateCall();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const refreshSelectedCall = async (id: string) => {
    const { data } = await supabase.from("calls").select("*").eq("id", id).single();
    if (data) setSelectedCall(data as unknown as Call);
  };

  const handleResolve = async (id: string) => {
    await updateCall.mutateAsync({ id, status: "resolved" as any, resolved_at: new Date().toISOString() });
    toast.success("Marked as resolved");
    setSelectedCall(null);
  };

  const handleRestore = async (id: string) => {
    await updateCall.mutateAsync({ id, status: "pending" as any, resolved_at: null });
    toast.success("Restored to Pending");
    setSelectedCall(null);
  };

  const handleGenerateQuote = async (call: Call) => {
    setGeneratingQuote(true);
    try {
      const res = await fetch("https://bottlesandprint.app.n8n.cloud/webhook/generate-call-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          call_id: call.id,
          caller_name: call.caller_name,
          company_name: call.company_name,
          email: call.email,
          phone_number: call.phone_number,
          call_reason: call.call_reason,
          quote_details: call.quote_details,
          summary: call.summary,
        }),
      });
      if (!res.ok) throw new Error("Webhook failed");
      toast.success("Quote generated successfully");
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      await refreshSelectedCall(call.id);
    } catch {
      toast.error("Failed to generate quote");
    } finally {
      setGeneratingQuote(false);
    }
  };

  const handleSendQuote = async (call: Call) => {
    setSendingQuote(true);
    try {
      const res = await fetch("https://bottlesandprint.app.n8n.cloud/webhook/email-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_new",
          to_email: call.email,
          subject: "Quote from Bottles & Print",
          draft: call.draft_response,
          email_id: "",
          attachments: quoteAttachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })),
        }),
      });
      if (!res.ok) throw new Error("Send failed");

      // Archive a copy in the emails table so it appears in Inbox → Sent
      await supabase.from("emails").insert({
        status: "approved_sent",
        subject: "Quote from Bottles & Print",
        draft_response: call.draft_response,
        to_email_all: call.email,
        to_recipients: call.email,
        from_email: "abu@bottlesandprint.com",
        from_name: "Bottles & Print",
        category: "QUOTE",
        body: call.draft_response,
      } as any);

      // Schedule follow-ups if call has an email address
      if (call.email) {
        const now = new Date();
        const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const fourteenDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("follow_ups").insert([
          {
            email_id: null,
            client_email: call.email,
            client_name: call.caller_name,
            subject: "Quote from Bottles & Print",
            follow_up_number: 1,
            scheduled_for: sevenDays,
            sent: false,
            cancelled: false,
          },
          {
            email_id: null,
            client_email: call.email,
            client_name: call.caller_name,
            subject: "Quote from Bottles & Print",
            follow_up_number: 2,
            scheduled_for: fourteenDays,
            sent: false,
            cancelled: false,
          },
        ] as any);
      }

      await updateCall.mutateAsync({ id: call.id, status: "resolved" as any, resolved_at: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      setQuoteAttachments([]);
      toast.success("Quote sent and call resolved");
      setSelectedCall(null);
    } catch {
      toast.error("Failed to send quote");
    } finally {
      setSendingQuote(false);
    }
  };

  const canGenerateQuote = (call: Call) => {
    return call.category?.startsWith("SALES") ?? false;
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "MMM d, h:mm a");
  };

  const filterCalls = (calls: Call[]) => {
    let filtered = calls;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(c =>
        c.caller_name?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q) ||
        c.phone_number?.includes(q) ||
        c.call_reason?.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q)
      );
    }
    return filtered;
  };

  // Filter by direction (inbound vs outbound)
  const inboundPending = pendingCalls.filter(c => c.category !== "OUTBOUND");
  const outboundPending = pendingCalls.filter(c => c.category === "OUTBOUND");

  const baseCalls = mainTab === "inbound" ? inboundPending : mainTab === "outbound" ? outboundPending : resolvedCalls;
  const calls = filterCalls(baseCalls);
  const loading = mainTab === "resolved" ? loadingResolved : loadingPending;


  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-serif font-normal">Calls</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl gap-1.5 text-xs"
            disabled={clearingResolved || resolvedCalls.length === 0}
            onClick={() => { setClearDialogOpen(true); setClearConfirmStep(null); }}
          >
            <Trash2 size={14} /> Clear Resolved
          </Button>

          {/* Clear Resolved – choice dialog */}
          <Dialog open={clearDialogOpen && !clearConfirmStep} onOpenChange={open => { if (!open) setClearDialogOpen(false); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>What would you like to do with all resolved calls?</DialogTitle>
              </DialogHeader>
              <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-2">
                <Button onClick={() => setClearConfirmStep("archive")} className="gap-1.5">
                  Archive All
                </Button>
                <Button variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10 gap-1.5" onClick={() => setClearConfirmStep("delete")}>
                  Delete All
                </Button>
                <Button variant="ghost" onClick={() => setClearDialogOpen(false)}>Cancel</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Archive confirmation */}
          <AlertDialog open={clearDialogOpen && clearConfirmStep === "archive"} onOpenChange={open => { if (!open) { setClearConfirmStep(null); setClearDialogOpen(false); } }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive {resolvedCalls.length} resolved calls?</AlertDialogTitle>
                <AlertDialogDescription>All resolved calls will be archived.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setClearConfirmStep(null)}>Back</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  setClearingResolved(true);
                  try {
                    const { error } = await supabase.from("calls").update({ status: "archived" } as any).eq("status", "resolved");
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["calls"] });
                    queryClient.invalidateQueries({ queryKey: ["inbox_counts"] });
                    toast.success("Resolved calls archived");
                  } catch { toast.error("Failed to archive calls"); }
                  finally { setClearingResolved(false); setClearDialogOpen(false); setClearConfirmStep(null); }
                }}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete confirmation */}
          <AlertDialog open={clearDialogOpen && clearConfirmStep === "delete"} onOpenChange={open => { if (!open) { setClearConfirmStep(null); setClearDialogOpen(false); } }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Permanently delete {resolvedCalls.length} resolved calls?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setClearConfirmStep(null)}>Back</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => {
                  setClearingResolved(true);
                  try {
                    const { error } = await supabase.from("calls").delete().eq("status", "resolved");
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["calls"] });
                    queryClient.invalidateQueries({ queryKey: ["inbox_counts"] });
                    toast.success("Resolved calls deleted");
                  } catch { toast.error("Failed to delete calls"); }
                  finally { setClearingResolved(false); setClearDialogOpen(false); setClearConfirmStep(null); }
                }}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            size="sm"
            className="rounded-xl gap-1.5 text-xs"
            onClick={() => {
              setOutboundNumber("");
              setOutboundName("");
              setOutboundOpen(true);
            }}
          >
            <Phone size={14} /> + New Call
          </Button>
        </div>
      </div>

      {/* Main tabs: Inbound / Outbound / Resolved */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {([
          { key: "inbound" as MainTab, label: "Inbound", count: inboundPending.length },
          { key: "outbound" as MainTab, label: "Outbound", count: outboundPending.length },
          { key: "resolved" as MainTab, label: "Resolved", count: 0 },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setMainTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-sans font-medium transition-colors min-h-[44px] ${
              mainTab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>


      <Input
        placeholder="Search calls..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="rounded-xl h-10 text-sm w-full sm:w-64"
      />

      <p className="text-[11px] text-muted-foreground font-sans">Call logs are automatically deleted after 1 year.</p>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : calls.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <PhoneCall size={32} className="mx-auto mb-2 opacity-50" />
          <p className="font-sans text-sm">
            {mainTab === "outbound" ? "No outbound calls recorded yet." : mainTab === "resolved" ? "No resolved calls." : "No calls found."}
          </p>
        </div>
      ) : (
        calls.map(call => {
          const showNoActionNeeded =
            (mainTab === "outbound" || mainTab === "resolved") &&
            call.is_actionable !== true &&
            call.has_quote_request !== true;

          return (
            <div
              key={call.id}
              className="floating-card mb-3 cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all"
              onClick={() => {
                setSelectedCall(call);
                if (!call.is_read) {
                  supabase.from("calls").update({ is_read: true } as any).eq("id", call.id).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["calls"] });
                    queryClient.invalidateQueries({ queryKey: ["inbox_counts"] });
                  });
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-medium text-sm font-sans">{call.caller_name || "Unknown Caller"}</span>
                    {showNoActionNeeded && (
                      <Badge variant="secondary" className="shrink-0 border-transparent bg-foreground text-background px-2 py-0.5 text-[10px] font-semibold leading-none">
                        No Action Needed
                      </Badge>
                    )}
                    {call.company_name && (
                      <span className="text-xs text-muted-foreground font-sans">• {call.company_name}</span>
                    )}
                    {call.is_urgent && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                        <AlertTriangle size={10} /> URGENT
                      </Badge>
                    )}
                    <CategoryBadge category={call.category} />
                    {call.status === "quote_generated" && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Quote Ready
                      </span>
                    )}
                    {call.status === "resolved" && emailResolvedCallIds.includes(call.id) && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        <Send size={9} /> Email Sent
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-sans">{formatTime(call.created_at)}</div>
                  {call.summary && (
                    <div className="text-sm text-foreground/80 font-sans mt-1.5 line-clamp-2">{call.summary}</div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {call.phone_number && (
                      <span className="flex items-center gap-1 text-xs text-primary font-sans">
                        <Phone size={12} /> {call.phone_number}
                      </span>
                    )}
                    {call.email && (
                      <span className="flex items-center gap-1 text-xs text-primary font-sans">
                        <Mail size={12} /> {call.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* Outbound Call Drawer */}
      <OutboundCallDrawer
        call={selectedCall?.category === "OUTBOUND" ? selectedCall : null}
        open={selectedCall?.category === "OUTBOUND" && !!selectedCall}
        onClose={() => setSelectedCall(null)}
      />

      {/* Inbound Detail Side Sheet */}
      <Sheet open={selectedCall?.category !== "OUTBOUND" && !!selectedCall} onOpenChange={open => !open && setSelectedCall(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0 flex flex-col h-full">
          {selectedCall && (
            <>
              <SheetHeader className="p-6 pb-4 border-b shrink-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <SheetTitle className="font-serif text-lg">
                    {selectedCall.caller_name || "Unknown Caller"}
                  </SheetTitle>
                  {selectedCall.is_urgent && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                      <AlertTriangle size={10} /> URGENT
                    </Badge>
                  )}
                  <CategoryBadge category={selectedCall.category} />
                  {selectedCall.status === "quote_generated" && (
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      Quote Ready
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-sans">
                  {selectedCall.company_name && <span>{selectedCall.company_name}</span>}
                  {selectedCall.company_name && <span>·</span>}
                  <span>{formatTime(selectedCall.created_at)}</span>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Cross-match banner */}
                {/* Cross-match banner */}
                <CallCrossMatchBanner
                  call={selectedCall}
                  onNavigateToEmail={(emailId) => {
                    setSelectedCall(null);
                    navigate("/inbox", { state: { openEmailId: emailId } });
                  }}
                />

                {/* Contact info */}
                <div className="flex items-center gap-4">
                  {selectedCall.phone_number && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOutboundNumber(selectedCall.phone_number || "");
                        setOutboundName(selectedCall.caller_name || "");
                        setOutboundOpen(true);
                      }}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline font-sans"
                    >
                      <Phone size={14} /> {selectedCall.phone_number}
                    </button>
                  )}
                  {selectedCall.email && (
                    <button
                      onClick={() => {
                        setSelectedCall(null);
                        navigate("/inbox", { state: { composeTo: selectedCall.email } });
                      }}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline font-sans"
                    >
                      <Mail size={14} /> {selectedCall.email}
                    </button>
                  )}
                </div>

                {/* Summary */}
                {selectedCall.summary && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Summary</h3>
                    <p className="text-sm font-sans whitespace-pre-wrap">{selectedCall.summary}</p>
                  </div>
                )}

                {/* Full call reason */}
                {selectedCall.call_reason && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Call Reason</h3>
                    <p className="text-sm font-sans whitespace-pre-wrap">{selectedCall.call_reason}</p>
                  </div>
                )}

                {/* Quote details */}
                {hasQuoteDetails(selectedCall.quote_details) && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-2 font-sans">Quote Details</h3>
                    <div className="bg-muted/50 rounded-md p-3 text-sm font-sans whitespace-pre-wrap">
                      {typeof selectedCall.quote_details === "string"
                        ? selectedCall.quote_details
                        : JSON.stringify(selectedCall.quote_details, null, 2)}
                    </div>
                  </div>
                )}

                {/* Generate Quote button */}
                {canGenerateQuote(selectedCall) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl gap-1.5 text-xs bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                    disabled={generatingQuote}
                    onClick={() => handleGenerateQuote(selectedCall)}
                  >
                    {generatingQuote ? <Loader2 size={14} className="animate-spin" /> : null}
                    Create Draft
                  </Button>
                )}

                {/* Editable To email */}
                {selectedCall.draft_response && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">To</h3>
                    <Input
                      type="email"
                      value={editableEmail}
                      onChange={e => setEditableEmail(e.target.value)}
                      placeholder="recipient@example.com"
                      className="rounded-lg h-8 text-sm"
                    />
                  </div>
                )}

                {/* Draft quote email — editable */}
                {selectedCall.draft_response && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Draft Quote Email</h3>
                    <div
                      ref={draftRef}
                      contentEditable
                      suppressContentEditableWarning
                      className="text-sm font-sans bg-muted/30 rounded-lg p-4 border border-border prose prose-sm max-w-none focus:outline-none focus:ring-1 focus:ring-primary/30 min-h-[120px]"
                      dangerouslySetInnerHTML={{ __html: selectedCall.draft_response }}
                    />
                  </div>
                )}

                {/* Attachments for quote */}
                {selectedCall.draft_response && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Attachments</h3>
                    <AttachmentPicker files={quoteAttachments} onChange={setQuoteAttachments} />
                  </div>
                )}

                {/* Send Quote button */}
                {editableEmail && selectedCall.draft_response && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl gap-1.5 text-xs bg-amber-50 border-amber-600 text-amber-800 hover:bg-amber-100 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/50"
                    disabled={sendingQuote}
                    onClick={() => {
                      const editedDraft = draftRef.current?.innerHTML || selectedCall.draft_response;
                      handleSendQuote({ ...selectedCall, email: editableEmail, draft_response: editedDraft });
                    }}
                  >
                    {sendingQuote ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Send Quote
                  </Button>
                )}

                {/* Transcript */}
                {selectedCall.transcript && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Transcript</h3>
                    <p className="text-sm font-sans whitespace-pre-wrap bg-muted/50 rounded-xl p-4 max-h-60 overflow-y-auto">{selectedCall.transcript}</p>
                  </div>
                )}

                {/* Related Emails */}
                <RelatedEmails
                  email={selectedCall.email}
                  onNavigateToEmail={(emailId) => {
                    setSelectedCall(null);
                    navigate("/inbox", { state: { openEmailId: emailId } });
                  }}
                />

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t">
                  {selectedCall.status !== "resolved" ? (
                    <Button size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => handleResolve(selectedCall.id)}>
                      <CheckCircle size={14} /> Mark Resolved
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" onClick={() => handleRestore(selectedCall.id)}>
                      <Phone size={14} /> Restore to Pending
                    </Button>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="rounded-xl gap-1.5 text-xs text-destructive hover:text-destructive">
                        <Trash2 size={14} /> Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this call?</AlertDialogTitle>
                        <AlertDialogDescription>This will permanently remove this call record. This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                          try {
                            const { error } = await supabase.from("calls").delete().eq("id", selectedCall.id);
                            if (error) throw error;
                            queryClient.invalidateQueries({ queryKey: ["calls"] });
                            queryClient.invalidateQueries({ queryKey: ["inbox_counts"] });
                            toast.success("Call deleted");
                            setSelectedCall(null);
                          } catch {
                            toast.error("Failed to delete call");
                          }
                        }}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
      <OutboundCallModal
        open={outboundOpen}
        onOpenChange={setOutboundOpen}
        prefillNumber={outboundNumber}
        prefillName={outboundName}
      />
    </div>
  );
}
