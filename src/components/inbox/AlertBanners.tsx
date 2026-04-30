import React, { useState, useEffect } from "react";
import { Email } from "@/lib/emailData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

interface AlertBannersProps {
  email: Email;
  onNavigateToEmail: (id: string) => void;
  onBeforeNavigate?: (currentEmail: Email) => void;
}

export function AlertBanners({ email, onNavigateToEmail, onBeforeNavigate }: AlertBannersProps) {
  const queryClient = useQueryClient();
  const e = email as any;
  const [unresolvedTopics, setUnresolvedTopics] = useState<{ id: string; summary: string; date: string; subject: string }[] | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!e.multi_topic_alert) { setUnresolvedTopics(null); return; }
    let topics: { id: string; summary: string; date: string; subject: string }[] | null = null;
    try { const parsed = JSON.parse(e.multi_topic_alert); if (Array.isArray(parsed)) topics = parsed; } catch {}
    if (!topics || topics.length === 0) { setUnresolvedTopics(null); return; }

    setTopicsLoading(true);
    const ids = topics.map(t => t.id);
    supabase.from("emails").select("id, status").in("id", ids).then(({ data }) => {
      const resolvedIds = new Set(
        (data || []).filter(r => r.status === "resolved" || r.status === "approved_sent").map(r => r.id)
      );
      const filtered = topics!.filter(t => !resolvedIds.has(t.id));
      setUnresolvedTopics(filtered);
      setTopicsLoading(false);
    });
  }, [e.multi_topic_alert, e.id]);

  // Derive sender first name
  const senderFirst = (() => {
    const n = (email.from_name || email.from_email || "").trim();
    if (!n) return "this sender";
    const first = n.split(/[\s@]/)[0];
    return first || "this sender";
  })();

  if (!e.multi_topic_alert || topicsLoading) return null;

  // Raw (non-array) case — still render simple inline strip
  let rawTopics: any[] | null = null;
  try { const p = JSON.parse(e.multi_topic_alert); if (Array.isArray(p)) rawTopics = p; } catch {}
  if (!rawTopics) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-sans" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
        <AlertTriangle size={14} className="shrink-0" style={{ color: '#D97706' }} />
        <span className="flex-1 truncate" style={{ color: '#92400E' }}>{e.multi_topic_alert}</span>
      </div>
    );
  }

  if (!unresolvedTopics || unresolvedTopics.length === 0) return null;

  return (
    <div className="rounded-md text-xs font-sans" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left"
      >
        <AlertTriangle size={14} className="shrink-0" style={{ color: '#D97706' }} />
        <span className="flex-1 font-medium" style={{ color: '#92400E' }}>
          {unresolvedTopics.length} other pending topic{unresolvedTopics.length !== 1 ? 's' : ''} from {senderFirst}
        </span>
        <span className="inline-flex items-center gap-0.5 text-[11px] font-medium" style={{ color: '#92400E' }}>
          {expanded ? "Hide" : "View all"}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          <ul className="ml-6 space-y-1">
            {unresolvedTopics.map(t => (
              <li key={t.id} className="flex items-start justify-between gap-2">
                <span style={{ color: '#92400E' }}>• {t.summary} <span className="opacity-70">({t.date})</span></span>
                <button className="inline-flex items-center gap-0.5 text-xs font-medium whitespace-nowrap shrink-0" style={{ color: '#D97706' }}
                  onClick={() => onNavigateToEmail(t.id)}>
                  View <ArrowRight size={10} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end mt-2">
            <button className="text-xs font-medium px-3 py-1 rounded-md" style={{ backgroundColor: '#92400E', color: '#FFF7ED' }}
              onClick={async (ev) => {
                const btn = ev.currentTarget; btn.textContent = 'Resolving...'; btn.disabled = true;
                const now = new Date().toISOString();
                for (const t of unresolvedTopics) {
                  await supabase.from("emails").update({ status: 'resolved', resolved_at: now }).eq("id", t.id);
                }
                setUnresolvedTopics([]);
                toast.success(`${unresolvedTopics.length} email${unresolvedTopics.length !== 1 ? 's' : ''} resolved`);
                await queryClient.invalidateQueries({ queryKey: ["emails"] });
                btn.textContent = 'Resolve All'; btn.disabled = false;
              }}>
              Resolve All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
