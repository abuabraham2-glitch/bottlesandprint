import React, { useState, useEffect, useRef } from "react";
import { Email, useUpdateEmail, sendEmailViaWebhook } from "@/lib/emailData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Send, Edit, Mail, Users, X, ThumbsDown, Paperclip, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { EmailCrossMatchBanner } from "@/components/CrossMatchBanner";
import { AlertBanners } from "./AlertBanners";
import {
  CATEGORY_COLORS, STATUS_COLORS, splitDraftAtHr, stripN8nFooter, formatEmailBodyAsHtml,
  formatTimeFull, parseAttachments, getReplyAllCc, SIGNATURE,
} from "./InboxHelpers";
import { useClients } from "@/lib/data";

interface ThreadViewProps {
  email: Email | null;
  onClose: () => void;
  onOpenDraft: (email: Email) => void;
  onReply: (email: Email, replyAll: boolean) => void;
  onDismiss: (id: string) => void;
  onFeedback: (id: string) => void;
  onNavigateToEmail: (id: string) => void;
  sending: string | null;
  onSendDraft: (email: Email) => void;
  onEditSend: (email: Email) => void;
}

export function ThreadView({ email, onClose, onOpenDraft, onReply, onDismiss, onFeedback, onNavigateToEmail, sending, onSendDraft, onEditSend }: ThreadViewProps) {
  const { data: clients = [] } = useClients();
  const [conversationEmails, setConversationEmails] = useState<Email[]>([]);
  const [expandedConvo, setExpandedConvo] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!email?.from_email) { setConversationEmails([]); return; }
    supabase.from("emails").select("*")
      .eq("from_email", email.from_email)
      .neq("id", email.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setConversationEmails((data || []) as unknown as Email[]));
  }, [email?.id, email?.from_email]);

  if (!email) return null;

  const client = clients.find(c => c.email === email.from_email);
  const atts = parseAttachments(email.attachments);
  const hasDraft = !!email.draft_response;
  const isActionable = email.status === "needs_response" || email.status === "pending";

  return (
    <Sheet open={!!email} onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[55vw] p-0 flex flex-col h-full">
        {/* Header */}
        <SheetHeader className="p-5 pb-4 border-b shrink-0">
          <SheetTitle className="font-serif text-lg leading-tight">{email.subject}</SheetTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-sans flex-wrap">
            <span className="font-medium text-foreground">{email.from_name}</span>
            <span>&lt;{email.from_email}&gt;</span>
            <span>•</span>
            <span>{formatTimeFull(email.created_at)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {email.category && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.UNKNOWN}`}>
                {email.category}
              </span>
            )}
            {email.status && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium ${STATUS_COLORS[email.status] || "bg-muted text-muted-foreground"}`}>
                {email.status.replace(/_/g, " ")}
              </span>
            )}
            {hasDraft && (
              <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs h-7" onClick={() => { onClose(); setTimeout(() => onOpenDraft(email), 150); }}>
                Go to Draft →
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Alert banners */}
          <AlertBanners email={email} onNavigateToEmail={onNavigateToEmail} />
          <EmailCrossMatchBanner email={email} onClose={onClose} />

          {/* PO Received / Converted */}
          {email.category === "SALES" && email.status === "approved_sent" && !(email as any).converted && (
            <Button size="sm" className="rounded-xl gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]"
              onClick={async () => {
                if (!confirm("Mark as converted?")) return;
                await supabase.from("emails").update({ po_received_at: new Date().toISOString(), converted: true, status: "converted" } as any).eq("id", email.id);
                toast.success("Marked as converted");
                onClose();
              }}>
              ✅ PO Received
            </Button>
          )}
          {(email as any).converted && (email as any).po_received_at && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium font-sans">
              ✅ Converted on {format(new Date((email as any).po_received_at), "MMM d, yyyy")}
            </div>
          )}

          {/* Client info */}
          {client && (
            <div className="bg-muted/30 rounded-xl p-3 text-sm font-sans">
              <span className="font-medium">{client.company}</span>
              {client.phone && <span className="ml-3 text-muted-foreground">{client.phone}</span>}
            </div>
          )}

          {/* Incoming summary */}
          {email.incoming_summary && (
            <div className="text-sm font-sans font-medium rounded-lg px-3 py-2" style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}>
              💬 {email.incoming_summary}
            </div>
          )}

          {/* Attachments */}
          {atts.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">Attachments</span>
              <div className="flex flex-wrap gap-2">
                {atts.map((att: any, i: number) => {
                  const url = `https://abu-n8n.app.n8n.cloud/webhook/download-attachment?messageId=${encodeURIComponent(email.gmail_id || "")}&filename=${encodeURIComponent(att.name || "")}`;
                  return (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-xs font-sans font-medium text-foreground transition-colors border">
                      <Paperclip size={12} className="text-muted-foreground" />
                      <span className="truncate max-w-[160px]">{att.name}</span>
                    </a>
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

          {/* Draft preview */}
          {hasDraft && (() => {
            const cleaned = stripN8nFooter(email.draft_response!);
            const { draftPart, quotedPart } = splitDraftAtHr(cleaned);
            return (
              <div>
                <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">AI Draft Response</span>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm font-sans email-html-content max-w-none"
                  dangerouslySetInnerHTML={{ __html: draftPart }} />
                {quotedPart && (
                  <Accordion type="single" collapsible className="w-full mt-2">
                    <AccordionItem value="quoted" className="border rounded-xl">
                      <AccordionTrigger className="px-4 py-2 text-xs font-medium text-muted-foreground font-sans hover:no-underline">Quoted Original</AccordionTrigger>
                      <AccordionContent className="px-4 pb-3">
                        <div className="text-sm font-sans email-html-content max-w-none" style={{ borderLeft: '3px solid #ccc', paddingLeft: '12px', color: '#555' }}
                          dangerouslySetInnerHTML={{ __html: quotedPart }} />
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>
            );
          })()}

          {/* Conversation history */}
          {conversationEmails.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground font-sans block mb-2">
                Conversation History ({conversationEmails.length} previous)
              </span>
              <div className="space-y-2">
                {conversationEmails.map(ce => {
                  const isExpanded = expandedConvo.has(ce.id);
                  const preview = (ce.body || "").replace(/<[^>]*>/g, "").substring(0, 120);
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
                          </div>
                          {!isExpanded && <p className="text-xs text-muted-foreground truncate mt-0.5">{preview}…</p>}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 text-sm font-sans email-html-content max-w-none border-t pt-3"
                          dangerouslySetInnerHTML={{ __html: formatEmailBodyAsHtml(stripN8nFooter(ce.body || "")) }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sticky actions */}
        <div className="border-t p-4 flex items-center gap-2 flex-wrap bg-background shrink-0">
          {isActionable && (
            <>
              <Button size="sm" className="rounded-xl gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => onSendDraft(email)} disabled={sending === email.id || !hasDraft}>
                <Send size={12} /> Send
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs"
                onClick={() => onEditSend(email)}>
                <Edit size={12} /> Edit & Send
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { onClose(); onReply(email, false); }}>
            <Mail size={12} /> Reply
          </Button>
          <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { onClose(); onReply(email, true); }}>
            <Users size={12} /> Reply All
          </Button>
          <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs text-muted-foreground" onClick={() => { onDismiss(email.id); onClose(); }}>
            <X size={12} /> Dismiss
          </Button>
          {isActionable && (
            <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs text-muted-foreground" onClick={() => { onFeedback(email.id); onClose(); }}>
              <ThumbsDown size={12} />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
