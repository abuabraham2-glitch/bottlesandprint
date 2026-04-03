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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RelatedEmails } from "@/components/calls/RelatedEmails";
import { OutboundCallDrawer } from "@/components/calls/OutboundCallDrawer";

type StatusTab = "pending" | "resolved";
type CategoryFilter = "all" | "sales" | "support" | "callback" | "urgent";
type DirectionTab = "inbound" | "outbound";

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  SALES_NEW: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  SALES_FOLLOWUP: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  SUPPORT: { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" },
  EXISTING_CLIENT: { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300" },
  CALLBACK_REQUEST: { bg: "bg-yellow-100 dark:bg-yellow-900/40", text: "text-yellow-700 dark:text-yellow-300" },
  SHIPPING: { bg: "bg-red-100 dark:bg-red-900/40", text: "text-red-700 dark:text-red-300" },
};

function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  const colors = CATEGORY_COLORS[category] || { bg: "bg-secondary", text: "text-secondary-foreground" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
      {category.replace(/_/g, " ")}
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
  const [statusTab, setStatusTab] = useState<StatusTab>("pending");
  const [directionTab, setDirectionTab] = useState<DirectionTab>("inbound");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
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
  const draftRef = useRef<HTMLDivElement>(null);

  // Sync editable email when selectedCall changes
  useEffect(() => {
    setEditableEmail(selectedCall?.email || "");
  }, [selectedCall?.id, selectedCall?.email]);

  const { data: pendingCalls = [], isLoading: loadingPending } = useCalls({ neq: "resolved" });
  const { data: resolvedCalls = [], isLoading: loadingResolved } = useCalls({ eq: "resolved" });
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
    if (categoryFilter === "sales") filtered = filtered.filter(c => c.category?.startsWith("SALES"));
    else if (categoryFilter === "support") filtered = filtered.filter(c => c.category === "SUPPORT");
    else if (categoryFilter === "callback") filtered = filtered.filter(c => c.category === "CALLBACK_REQUEST");
    else if (categoryFilter === "urgent") filtered = filtered.filter(c => c.is_urgent);

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
  const inboundPendingCount = inboundPending.filter(c => c.status === "pending").length;
  const outboundPendingCount = outboundPending.filter(c => c.status === "pending").length;

  const directionFilteredPending = directionTab === "inbound" ? inboundPending : outboundPending;
  const directionFilteredResolved = directionTab === "inbound"
    ? resolvedCalls.filter(c => c.category !== "OUTBOUND")
    : resolvedCalls.filter(c => c.category === "OUTBOUND");

  const baseCalls = statusTab === "pending" ? directionFilteredPending : directionFilteredResolved;
  const calls = filterCalls(baseCalls);
  const loading = statusTab === "pending" ? loadingPending : loadingResolved;

  const categoryTabs: { key: CategoryFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "sales", label: "Sales" },
    { key: "support", label: "Support" },
    { key: "callback", label: "Callback" },
    { key: "urgent", label: "Urgent" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-serif font-normal">Calls</h1>
        <div className="flex items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5 text-xs"
                disabled={clearingResolved || resolvedCalls.length === 0}
              >
                <Trash2 size={14} /> Clear Resolved
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear resolved calls?</AlertDialogTitle>
                <AlertDialogDescription>
                  Mark all resolved calls as archived? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    setClearingResolved(true);
                    try {
                      const { error } = await supabase
                        .from("calls")
                        .update({ status: "archived" } as any)
                        .eq("status", "resolved");
                      if (error) throw error;
                      queryClient.invalidateQueries({ queryKey: ["calls"] });
                      toast.success("Resolved calls archived");
                    } catch {
                      toast.error("Failed to archive calls");
                    } finally {
                      setClearingResolved(false);
                    }
                  }}
                >
                  Archive All
                </AlertDialogAction>
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

      {/* Direction sub-tabs: Inbound / Outbound */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {([
          { key: "inbound" as DirectionTab, label: "Inbound", count: inboundPendingCount },
          { key: "outbound" as DirectionTab, label: "Outbound", count: outboundPendingCount },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setDirectionTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-sans font-medium transition-colors min-h-[44px] ${
              directionTab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {([
          { key: "pending" as StatusTab, label: "Pending", count: pendingCalls.length },
          { key: "resolved" as StatusTab, label: "Resolved", count: resolvedCalls.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-sans font-medium transition-colors min-h-[44px] ${
              statusTab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Category filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {categoryTabs.map(t => (
          <button
            key={t.key}
            onClick={() => setCategoryFilter(t.key)}
            className={`px-3 py-2 rounded-full text-xs font-sans font-medium border transition-colors min-h-[44px] ${
              categoryFilter === t.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {t.label}
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
            {directionTab === "outbound" ? "No outbound calls recorded yet." : "No calls found."}
          </p>
        </div>
      ) : (
        calls.map(call => (
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
        ))
      )}

      {/* Outbound Call Drawer */}
      <OutboundCallDrawer
        call={directionTab === "outbound" ? selectedCall : null}
        open={directionTab === "outbound" && !!selectedCall}
        onClose={() => setSelectedCall(null)}
      />

      {/* Inbound Detail Side Sheet */}
      <Sheet open={directionTab === "inbound" && !!selectedCall} onOpenChange={open => !open && setSelectedCall(null)}>
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
