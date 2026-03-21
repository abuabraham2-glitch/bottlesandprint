import React, { useState, useEffect } from "react";
import { Email } from "@/lib/emailData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, FileText, Paperclip, ChevronDown, ExternalLink, CheckCircle, MessageSquare, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { EmailCrossMatchBanner } from "@/components/CrossMatchBanner";
import { AlertBanners } from "./AlertBanners";
import {
  CATEGORY_COLORS, CATEGORIES, displaySenderName, stripN8nFooter, formatEmailBodyAsHtml,
  formatTimeFull, parseAttachments, getAttachmentUrl,
} from "./InboxHelpers";

const THREAD_WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/fetch-thread";

interface ThreadMessage {
  sender: string;
  timestamp: string;
  body: string;
}

interface ThreadViewProps {
  email: Email | null;
  onClose: () => void;
  onOpenDraft: (email: Email) => void;
  onNavigateToEmail: (id: string) => void;
}

export function ThreadView({ email, onClose, onOpenDraft, onNavigateToEmail }: ThreadViewProps) {
  const [conversationEmails, setConversationEmails] = useState<Email[]>([]);
  const [expandedConvo, setExpandedConvo] = useState<Set<string>>(new Set());
  const [threadMessages, setThreadMessages] = useState<ThreadMessage[] | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadExpanded, setThreadExpanded] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!email?.from_email) { setConversationEmails([]); return; }
    supabase.from("emails").select("*")
      .eq("from_email", email.from_email)
      .neq("id", email.id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => setConversationEmails((data || []) as unknown as Email[]));
  }, [email?.id, email?.from_email]);

  // Reset thread state when email changes
  useEffect(() => {
    setThreadMessages(null);
    setThreadExpanded(false);
  }, [email?.id]);

  if (!email) return null;

  const atts = parseAttachments(email.attachments);
  const hasDraft = !!email.draft_response;
  const isResolved = email.status === "resolved" || email.status === "approved_sent";

  const handleChangeCategory = async (newCategory: string) => {
    const updates: any = { category: newCategory };
    if (newCategory === "SPAM") {
      updates.status = "resolved";
      updates.resolved_at = new Date().toISOString();
    }
    await supabase.from("emails").update(updates).eq("id", email.id);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`Category → ${newCategory}`);
    if (newCategory === "SPAM") onClose();
  };

  const handleArchive = async () => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("emails").update({ status: "resolved", draft_response: null, resolved_at: now } as any).eq("id", email.id);
    if (error) console.error("[ThreadView] Archive error:", error);
    if (email.thread_id) {
      await supabase.from("emails")
        .update({ status: "resolved", draft_response: null, resolved_at: now } as any)
        .eq("thread_id", email.thread_id)
        .in("status", ["pending", "needs_response"])
        .neq("id", email.id);
    }
    await queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success("Archived");
    onClose();
  };

  const fetchThread = async () => {
    if (!email.thread_id) return;
    setThreadLoading(true);
    try {
      const response = await fetch(THREAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmail_thread_id: email.thread_id }),
      });
      if (!response.ok) throw new Error("Failed to fetch thread");
      const data = await response.json();
      const messages: ThreadMessage[] = Array.isArray(data) ? data : data.messages || [];
      setThreadMessages(messages);
      setThreadExpanded(true);
    } catch (err) {
      console.error("[ThreadView] Thread fetch error:", err);
      toast.error("Failed to load thread");
    }
    setThreadLoading(false);
  };

  const showViewThread = !!email.thread_id;

  return (
    <Sheet open={!!email} onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[55vw] p-0 flex flex-col h-full">
        {/* Header */}
        <SheetHeader className="p-5 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <SheetTitle className="font-serif text-lg leading-tight mb-1">{email.subject}</SheetTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-sans flex-wrap">
                <span className="font-medium text-foreground">{displaySenderName(email.from_name, email.from_email)}</span>
                <span className="text-xs">&lt;{email.from_email}&gt;</span>
                <span>•</span>
                <span className="text-xs">{formatTimeFull(email.created_at)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isResolved ? (
                <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs px-3 py-1">
                  <CheckCircle size={12} className="mr-1" />
                  {email.status === "approved_sent" ? "Sent" : "Resolved"}
                </Badge>
              ) : (
                <>
                  {hasDraft && (
                    <Button size="sm" variant="default" className="rounded-xl gap-1 text-xs h-8" onClick={() => { onClose(); setTimeout(() => onOpenDraft(email), 150); }}>
                      <FileText size={12} /> View Draft →
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs h-8" onClick={handleArchive}>
                    <Archive size={12} /> Archive
                  </Button>
                </>
              )}
            </div>
          </div>
          {/* Category dropdown */}
          <div className="flex items-center gap-2 mt-2">
            <Select value={email.category || "OTHER"} onValueChange={handleChangeCategory}>
              <SelectTrigger className="w-[130px] h-7 text-xs rounded-lg">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[cat]}`}>{cat}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* AI Summary */}
          {email.incoming_summary && (
            <div className="text-sm font-sans rounded-lg px-3 py-2 bg-blue-50 text-blue-800 border border-blue-200">
              🤖 {email.incoming_summary}
            </div>
          )}

          {/* Alert banners */}
          <AlertBanners email={email} onNavigateToEmail={onNavigateToEmail} />
          <EmailCrossMatchBanner email={email} onClose={onClose} />

          {/* Attachments */}
          {atts.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground font-sans block mb-1.5">📎 Attachments</span>
              <div className="flex flex-wrap gap-2">
                {atts.map((att: any, i: number) => {
                  const url = getAttachmentUrl(att);
                  return (
                    <div key={i} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border text-xs font-sans">
                      <Paperclip size={12} className="text-muted-foreground shrink-0" />
                      <span className="truncate max-w-[160px] font-medium">{att.name || "Attachment"}</span>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline whitespace-nowrap">Open</a>
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Email body */}
          <div>
            <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">Email Body</span>
            <div className="bg-muted/20 rounded-xl p-4 text-sm font-sans email-html-content max-w-none"
              dangerouslySetInnerHTML={{ __html: formatEmailBodyAsHtml(stripN8nFooter(email.body || "")) }} />
          </div>

          {/* View Thread button */}
          {showViewThread && (
            <div>
              {!threadMessages && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl gap-1.5 text-xs"
                  onClick={fetchThread}
                  disabled={threadLoading}
                >
                  {threadLoading ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
                  {threadLoading ? "Loading thread..." : "View Thread"}
                </Button>
              )}

              {/* Thread messages */}
              {threadMessages && threadMessages.length > 1 && (
                <div className="space-y-2">
                  <button
                    className="flex items-center gap-1.5 text-xs font-sans font-medium text-muted-foreground hover:text-foreground"
                    onClick={() => setThreadExpanded(!threadExpanded)}
                  >
                    <ChevronDown size={14} className={`transition-transform ${threadExpanded ? "rotate-180" : ""}`} />
                    Gmail Thread ({threadMessages.length} messages)
                  </button>
                  {threadExpanded && (
                    <div className="space-y-3 pl-2 border-l-2 border-muted">
                      {threadMessages.map((msg, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center gap-2 text-xs font-sans">
                            <span className="font-medium">{msg.sender}</span>
                            <span className="text-muted-foreground">{formatTimeFull(msg.timestamp)}</span>
                          </div>
                          <div
                            className="text-sm font-sans email-html-content max-w-none bg-muted/10 rounded-lg p-3"
                            dangerouslySetInnerHTML={{ __html: formatEmailBodyAsHtml(stripN8nFooter(msg.body || "")) }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {threadMessages && threadMessages.length <= 1 && (
                <p className="text-xs text-muted-foreground font-sans">Only one message in this thread.</p>
              )}
            </div>
          )}

          {/* Conversation History */}
          {conversationEmails.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground font-sans block mb-2">
                Previous emails from this sender ({conversationEmails.length})
              </span>
              <div className="space-y-2">
                {conversationEmails.map(ce => {
                  const isExpanded = expandedConvo.has(ce.id);
                  const preview = (ce.body || "").replace(/<[^>]*>/g, "").substring(0, 120);
                  const ceAtts = parseAttachments(ce.attachments);
                  return (
                    <div key={ce.id} className="border rounded-xl overflow-hidden">
                      <button className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-muted/30 transition-colors"
                        onClick={() => setExpandedConvo(prev => {
                          const next = new Set(prev); next.has(ce.id) ? next.delete(ce.id) : next.add(ce.id); return next;
                        })}>
                        <ChevronDown size={14} className={`shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-medium">{formatTimeFull(ce.created_at)}</span>
                            <span className="text-muted-foreground truncate">{ce.subject}</span>
                            {ce.status && (
                              <span className={`text-[10px] px-1 py-0.5 rounded-full ${ce.status === "resolved" || ce.status === "approved_sent" ? "bg-gray-100 text-gray-500" : "bg-yellow-100 text-yellow-700"}`}>
                                {ce.status.replace(/_/g, " ")}
                              </span>
                            )}
                            {ceAtts.length > 0 && <Paperclip size={10} className="text-muted-foreground" />}
                          </div>
                          {!isExpanded && <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}…</p>}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 border-t pt-3 space-y-2">
                          <div className="text-sm font-sans email-html-content max-w-none"
                            dangerouslySetInnerHTML={{ __html: formatEmailBodyAsHtml(stripN8nFooter(ce.body || "")) }} />
                          {ceAtts.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {ceAtts.map((att: any, j: number) => (
                                <a key={j} href={getAttachmentUrl(att)} target="_blank" rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted/50 text-[11px] font-sans border hover:bg-muted">
                                  <Paperclip size={10} /> {att.name || "Attachment"}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
