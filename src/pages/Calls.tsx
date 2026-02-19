import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCalls, useUpdateCall, Call } from "@/lib/emailData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, CheckCircle, PhoneCall, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type StatusTab = "pending" | "resolved";
type CategoryFilter = "all" | "sales" | "support" | "callback" | "urgent";

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
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [generatingQuote, setGeneratingQuote] = useState(false);

  const { data: pendingCalls = [], isLoading: loadingPending } = useCalls("pending");
  const { data: resolvedCalls = [], isLoading: loadingResolved } = useCalls("resolved");
  const updateCall = useUpdateCall();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
    } catch {
      toast.error("Failed to generate quote");
    } finally {
      setGeneratingQuote(false);
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

  const baseCalls = statusTab === "pending" ? pendingCalls : resolvedCalls;
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
    <div className="p-6 space-y-5 max-w-[1200px]">
      <h1 className="text-2xl font-serif font-normal">Calls</h1>

      {/* Status tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {([
          { key: "pending" as StatusTab, label: "Pending", count: pendingCalls.length },
          { key: "resolved" as StatusTab, label: "Resolved", count: resolvedCalls.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setStatusTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-sans font-medium transition-colors ${
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
            className={`px-3 py-1 rounded-full text-xs font-sans font-medium border transition-colors ${
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
        className="rounded-xl h-8 text-sm w-64"
      />

      <p className="text-[11px] text-muted-foreground font-sans">Call logs are automatically deleted after 1 year.</p>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : calls.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <PhoneCall size={32} className="mx-auto mb-2 opacity-50" />
          <p className="font-sans text-sm">No calls found.</p>
        </div>
      ) : (
        calls.map(call => (
          <div
            key={call.id}
            className="floating-card mb-3 cursor-pointer hover:ring-1 hover:ring-primary/20 transition-all"
            onClick={() => setSelectedCall(call)}
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

      {/* Detail Side Sheet — same pattern as email inbox */}
      <Sheet open={!!selectedCall} onOpenChange={open => !open && setSelectedCall(null)}>
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
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-sans">
                  {selectedCall.company_name && <span>{selectedCall.company_name}</span>}
                  {selectedCall.company_name && <span>·</span>}
                  <span>{formatTime(selectedCall.created_at)}</span>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Contact info */}
                <div className="flex items-center gap-4">
                  {selectedCall.phone_number && (
                    <a href={`tel:${selectedCall.phone_number}`} className="flex items-center gap-1.5 text-sm text-primary hover:underline font-sans">
                      <Phone size={14} /> {selectedCall.phone_number}
                    </a>
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

                {/* Quote details — plain text display */}
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
                    variant="default"
                    className="rounded-xl gap-1.5 text-xs"
                    disabled={generatingQuote}
                    onClick={() => handleGenerateQuote(selectedCall)}
                  >
                    {generatingQuote ? <Loader2 size={14} className="animate-spin" /> : null}
                    Generate Quote
                  </Button>
                )}

                {/* Draft response — rendered as HTML */}
                {selectedCall.draft_response && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Draft Response</h3>
                    <div
                      className="text-sm font-sans bg-muted/50 rounded-xl p-4 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: selectedCall.draft_response }}
                    />
                  </div>
                )}

                {/* Transcript */}
                {selectedCall.transcript && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Transcript</h3>
                    <p className="text-sm font-sans whitespace-pre-wrap bg-muted/50 rounded-xl p-4 max-h-60 overflow-y-auto">{selectedCall.transcript}</p>
                  </div>
                )}

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
    </div>
  );
}
