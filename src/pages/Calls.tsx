import { useState } from "react";
import { useCalls, useUpdateCall, Call } from "@/lib/emailData";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, CheckCircle, ChevronDown, ChevronUp, PhoneCall, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";

type Tab = "pending" | "resolved";

export default function Calls() {
  const [tab, setTab] = useState<Tab>("pending");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const { data: pendingCalls = [], isLoading: loadingPending } = useCalls("pending");
  const { data: resolvedCalls = [], isLoading: loadingResolved } = useCalls("resolved");
  const updateCall = useUpdateCall();
  const navigate = useNavigate();

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleResolve = async (id: string) => {
    await updateCall.mutateAsync({ id, status: "resolved" as any, resolved_at: new Date().toISOString() });
    toast.success("Marked as resolved");
  };

  const handleRestore = async (id: string) => {
    await updateCall.mutateAsync({ id, status: "pending" as any, resolved_at: null });
    toast.success("Restored to Pending");
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "MMM d, h:mm a");
  };

  const filterCalls = (calls: Call[]) => {
    if (!search.trim()) return calls;
    const q = search.toLowerCase();
    return calls.filter(c =>
      c.caller_name?.toLowerCase().includes(q) ||
      c.company_name?.toLowerCase().includes(q) ||
      c.phone_number?.includes(q) ||
      c.call_reason?.toLowerCase().includes(q) ||
      c.summary?.toLowerCase().includes(q)
    );
  };

  const calls = tab === "pending" ? filterCalls(pendingCalls) : filterCalls(resolvedCalls);
  const loading = tab === "pending" ? loadingPending : loadingResolved;

  const renderCallCard = (call: Call, isResolved: boolean) => {
    const isExpanded = expandedIds.has(call.id);
    const hasQuoteDetails = call.quote_details && typeof call.quote_details === 'object' && Object.keys(call.quote_details).length > 0;

    return (
      <div key={call.id} className="floating-card mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm font-sans">{call.caller_name || "Unknown Caller"}</span>
              {call.company_name && (
                <span className="text-xs text-muted-foreground font-sans">• {call.company_name}</span>
              )}
              {call.is_urgent && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                  <AlertTriangle size={10} /> Urgent
                </Badge>
              )}
              {call.category && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{call.category}</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-sans">{formatTime(call.created_at)}</div>
            {call.summary && (
              <div className="text-sm text-foreground/80 font-sans mt-1.5 line-clamp-2">{call.summary}</div>
            )}
            {!call.summary && call.call_reason && (
              <div className="text-sm text-foreground/80 font-sans mt-1.5 line-clamp-2">{call.call_reason}</div>
            )}
            <div className="flex items-center gap-3 mt-2">
              {call.phone_number && (
                <a href={`tel:${call.phone_number}`} className="flex items-center gap-1 text-xs text-primary hover:underline font-sans">
                  <Phone size={12} /> {call.phone_number}
                </a>
              )}
              {call.email && (
                <button
                  onClick={() => navigate("/inbox", { state: { composeTo: call.email } })}
                  className="flex items-center gap-1 text-xs text-primary hover:underline font-sans"
                >
                  <Mail size={12} /> {call.email}
                </button>
              )}
            </div>
          </div>
          {(hasQuoteDetails || call.draft_response) && (
            <button onClick={() => toggleExpand(call.id)} className="shrink-0 text-muted-foreground">
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="mt-3 border-t pt-3 space-y-3">
            {hasQuoteDetails && (
              <div>
                <span className="text-xs font-medium text-muted-foreground font-sans">Quote Details</span>
                <div className="text-sm font-sans mt-1 whitespace-pre-wrap">{JSON.stringify(call.quote_details, null, 2)}</div>
              </div>
            )}
            {call.draft_response && (
              <div>
                <span className="text-xs font-medium text-muted-foreground font-sans">Draft Response</span>
                <div className="text-sm font-sans mt-1 whitespace-pre-wrap">{call.draft_response}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          {!isResolved ? (
            <Button size="sm" className="rounded-xl gap-1 text-xs" onClick={() => handleResolve(call.id)}>
              <CheckCircle size={12} /> Mark Resolved
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => handleRestore(call.id)}>
              <Phone size={12} /> Restore
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-[1200px]">
      <h1 className="text-2xl font-serif font-normal">Calls</h1>

      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
        {[
          { key: "pending" as Tab, label: "Pending", count: pendingCalls.length },
          { key: "resolved" as Tab, label: "Resolved", count: resolvedCalls.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-sans font-medium transition-colors ${
              tab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
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
        className="rounded-xl h-8 text-sm w-64"
      />

      <p className="text-[11px] text-muted-foreground font-sans">Call logs are automatically deleted after 1 year.</p>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : calls.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <PhoneCall size={32} className="mx-auto mb-2 opacity-50" />
          <p className="font-sans text-sm">{tab === "pending" ? "No pending calls." : "No resolved calls."}</p>
        </div>
      ) : (
        calls.map(c => renderCallCard(c, tab === "resolved"))
      )}
    </div>
  );
}
