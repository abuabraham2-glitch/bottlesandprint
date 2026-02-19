import { useState } from "react";
import { useCalls, useUpdateCall, Call } from "@/lib/emailData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, CheckCircle, PhoneCall, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";

type StatusTab = "pending" | "resolved";
type CategoryFilter = "all" | "sales" | "support" | "callback" | "urgent";

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  SALES_NEW: { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
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

function QuoteDetailsView({ details }: { details: any }) {
  if (!details || typeof details !== "object") return null;
  const fields = ["component", "material", "colors", "quantity", "shape", "size"];
  const entries = Object.entries(details).filter(([, v]) => v != null && v !== "");
  if (entries.length === 0) return null;

  // Show prioritized fields first, then the rest
  const ordered = [
    ...fields.filter(f => details[f] != null && details[f] !== "").map(f => [f, details[f]] as [string, any]),
    ...entries.filter(([k]) => !fields.includes(k)),
  ];

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {ordered.map(([key, val]) => (
        <div key={key}>
          <span className="text-[11px] font-medium text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
          <div className="text-sm font-sans">{typeof val === "object" ? JSON.stringify(val) : String(val)}</div>
        </div>
      ))}
    </div>
  );
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
      // Placeholder webhook — will be wired up next
      toast.info("Quote generation will be wired up to a webhook next.");
    } catch {
      toast.error("Failed to generate quote");
    } finally {
      setGeneratingQuote(false);
    }
  };

  const canGenerateQuote = (call: Call) => {
    if (call.category !== "SALES_NEW") return false;
    const qd = call.quote_details;
    return qd && typeof qd === "object" && (qd as any).component && (qd as any).quantity;
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "MMM d, h:mm a");
  };

  const filterCalls = (calls: Call[]) => {
    let filtered = calls;

    // Category filter
    if (categoryFilter === "sales") filtered = filtered.filter(c => c.category === "SALES_NEW");
    else if (categoryFilter === "support") filtered = filtered.filter(c => c.category === "SUPPORT");
    else if (categoryFilter === "callback") filtered = filtered.filter(c => c.category === "CALLBACK_REQUEST");
    else if (categoryFilter === "urgent") filtered = filtered.filter(c => c.is_urgent);

    // Search
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
  const isResolved = statusTab === "resolved";

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

      {/* Detail Drawer */}
      <Drawer open={!!selectedCall} onOpenChange={open => !open && setSelectedCall(null)}>
        <DrawerContent className="max-h-[85vh]">
          {selectedCall && (
            <div className="overflow-y-auto px-6 pb-8">
              <DrawerHeader className="px-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <DrawerTitle className="font-serif font-normal text-xl">
                    {selectedCall.caller_name || "Unknown Caller"}
                  </DrawerTitle>
                  {selectedCall.is_urgent && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                      <AlertTriangle size={10} /> URGENT
                    </Badge>
                  )}
                  <CategoryBadge category={selectedCall.category} />
                </div>
                <DrawerDescription className="font-sans">
                  {selectedCall.company_name && <span>{selectedCall.company_name} · </span>}
                  {formatTime(selectedCall.created_at)}
                </DrawerDescription>
              </DrawerHeader>

              <div className="space-y-5">
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

                {/* Quote details */}
                {selectedCall.quote_details && typeof selectedCall.quote_details === "object" && Object.keys(selectedCall.quote_details).length > 0 && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-2 font-sans">Quote Details</h3>
                    <div className="bg-muted/50 rounded-xl p-4">
                      <QuoteDetailsView details={selectedCall.quote_details} />
                    </div>
                  </div>
                )}

                {/* Draft response */}
                {selectedCall.draft_response && (
                  <div>
                    <h3 className="text-xs font-medium text-muted-foreground mb-1 font-sans">Draft Response</h3>
                    <p className="text-sm font-sans whitespace-pre-wrap bg-muted/50 rounded-xl p-4">{selectedCall.draft_response}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2">
                  {selectedCall.status !== "resolved" ? (
                    <Button size="sm" className="rounded-xl gap-1.5 text-xs" onClick={() => handleResolve(selectedCall.id)}>
                      <CheckCircle size={14} /> Mark Resolved
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" className="rounded-xl gap-1.5 text-xs" onClick={() => handleRestore(selectedCall.id)}>
                      <Phone size={14} /> Restore to Pending
                    </Button>
                  )}

                  {canGenerateQuote(selectedCall) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="rounded-xl gap-1.5 text-xs"
                      disabled={generatingQuote}
                      onClick={() => handleGenerateQuote(selectedCall)}
                    >
                      {generatingQuote ? <Loader2 size={14} className="animate-spin" /> : null}
                      Generate Quote
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
