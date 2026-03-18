import React, { useState, useEffect } from "react";
import { Email } from "@/lib/emailData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, UsersRound, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface AlertBannersProps {
  email: Email;
  onNavigateToEmail: (id: string) => void;
}

export function AlertBanners({ email, onNavigateToEmail }: AlertBannersProps) {
  const queryClient = useQueryClient();
  const e = email as any;
  const [unresolvedTopics, setUnresolvedTopics] = useState<{ id: string; summary: string; date: string; subject: string }[] | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);

  // On mount/change, parse multi_topic_alert and check actual status in Supabase
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
      console.log("[AlertBanners] Multi-topic filter: total=", topics!.length, "resolved=", resolvedIds.size, "showing=", filtered.length);
      setUnresolvedTopics(filtered);
      setTopicsLoading(false);
    });
  }, [e.multi_topic_alert, e.id]);

  return (
    <>
      {/* Skip alert */}
      {e.skip_alert && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-sans" style={{ backgroundColor: '#FEE2E2', border: '1px solid #FECACA' }}>
          <AlertCircle size={16} className="shrink-0" style={{ color: '#DC2626' }} />
          <span className="flex-1" style={{ color: '#991B1B' }}>{e.skip_alert}</span>
          {e.skip_link_id && (
            <button className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap" style={{ backgroundColor: '#DC2626', color: '#fff' }}
              onClick={() => onNavigateToEmail(e.skip_link_id)}>
              Go to Latest <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}

      {/* Multi-topic alert — only show unresolved topics */}
      {e.multi_topic_alert && !topicsLoading && (() => {
        // If we couldn't parse as array, show raw text
        let rawTopics: any[] | null = null;
        try { const p = JSON.parse(e.multi_topic_alert); if (Array.isArray(p)) rawTopics = p; } catch {}
        if (!rawTopics) {
          return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-sans" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
              <AlertTriangle size={16} className="shrink-0" style={{ color: '#D97706' }} />
              <span className="flex-1" style={{ color: '#92400E' }}>{e.multi_topic_alert}</span>
            </div>
          );
        }
        // If all topics resolved, hide panel entirely
        if (!unresolvedTopics || unresolvedTopics.length === 0) return null;

        return (
          <div className="px-3 py-2 rounded-lg text-sm font-sans" style={{ backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={16} className="shrink-0" style={{ color: '#D97706' }} />
              <span className="font-medium" style={{ color: '#92400E' }}>{unresolvedTopics.length} other pending topic{unresolvedTopics.length !== 1 ? 's' : ''} from this sender:</span>
            </div>
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
                  console.log("[AlertBanners] Resolve All: resolving", unresolvedTopics.length, "emails:", unresolvedTopics.map(t => t.id));
                  for (const t of unresolvedTopics) {
                    const { error } = await supabase.from("emails").update({ status: 'resolved', resolved_at: now }).eq("id", t.id);
                    if (error) console.error("[AlertBanners] Error resolving:", t.id, error);
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
        );
      })()}

      {/* Same company alert */}
      {e.same_company_alert && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-sans" style={{ backgroundColor: '#DBEAFE', border: '1px solid #BFDBFE' }}>
          <UsersRound size={16} className="shrink-0" style={{ color: '#2563EB' }} />
          <span className="flex-1" style={{ color: '#1E3A5F' }}>{e.same_company_alert}</span>
          {e.same_company_link_id && (
            <button className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap" style={{ backgroundColor: '#2563EB', color: '#fff' }}
              onClick={() => onNavigateToEmail(e.same_company_link_id)}>
              View <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
