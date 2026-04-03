import React, { useRef, useState } from "react";
import { Email, useUpdateEmail, sendEmailViaWebhook } from "@/lib/emailData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Archive, Trash2, Paperclip, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { AlertBanners } from "./AlertBanners";
import { EmailCrossMatchBanner } from "@/components/CrossMatchBanner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  splitDraftAtHr, stripN8nFooter, formatEmailBodyAsHtml, parseAttachments, getAttachmentUrl, getReplyAllCc,
} from "./InboxHelpers";

interface DraftEditorProps {
  email: Email | null;
  onClose: () => void;
  onNavigateToEmail: (id: string) => void;
}

export function DraftEditor({ email, onClose, onNavigateToEmail }: DraftEditorProps) {
  const editRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [ccValue, setCcValue] = useState("");
  const [bccValue, setBccValue] = useState("");
  const [quotePromptOpen, setQuotePromptOpen] = useState(false);
  const [subjectValue, setSubjectValue] = useState("");
  const updateEmail = useUpdateEmail();
  const queryClient = useQueryClient();

  // Reset CC and subject when email changes
  React.useEffect(() => {
    if (!email) return;
    const replyAllCc = getReplyAllCc(email);
    setCcValue(replyAllCc || email.cc_recipients || "");
    setSubjectValue(`Re: ${email.subject || ""}`);
  }, [email?.id]);

  if (!email) return null;

  const cleaned = stripN8nFooter(email.draft_response || "");
  const atts = parseAttachments(email.attachments);

  const isQuoteDraft = (() => {
    try {
      if (!email.quote_data) return false;
      const qd = typeof email.quote_data === "string" ? JSON.parse(email.quote_data) : email.quote_data;
      return qd?.draft_type === "QUOTE";
    } catch { return false; }
  })();

  const executeSend = async (markAsQuoted: boolean) => {
    if (!email.from_email || !email.draft_response) return;
    setSending(true);
    try {
      const draftContent = editRef.current ? editRef.current.innerHTML : email.draft_response;
      const payload = {
        to_email: email.from_email,
        subject: subjectValue,
        draft: stripN8nFooter(draftContent),
        gmail_id: email.gmail_id || undefined,
        email_id: email.id,
        cc: ccValue || undefined,
        bcc: bccValue || undefined,
        attachments: attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })),
        original_draft: email.draft_response || undefined,
      };
      await sendEmailViaWebhook(payload);
      await updateEmail.mutateAsync({ id: email.id, status: "approved_sent" as any });
      if (markAsQuoted) {
        await supabase.from("emails").update({ quoted_at: new Date().toISOString() } as any).eq("id", email.id);
      }
      // Schedule follow-ups for SALES
      if (email.category === "SALES") {
        const { data: existing } = await supabase.from("follow_ups").select("id").eq("email_id", email.id).limit(1);
        if (!existing || existing.length === 0) {
          const now = new Date();
          await supabase.from("follow_ups").insert([
            { email_id: email.id, client_email: email.from_email, client_name: email.from_name, subject: email.subject, follow_up_number: 1, scheduled_for: new Date(now.getTime() + 7 * 86400000).toISOString(), sent: false, cancelled: false },
            { email_id: email.id, client_email: email.from_email, client_name: email.from_name, subject: email.subject, follow_up_number: 2, scheduled_for: new Date(now.getTime() + 14 * 86400000).toISOString(), sent: false, cancelled: false },
          ] as any);
        }
      }
      // Resolve multi-topic related
      const mta = (email as any).multi_topic_alert;
      if (mta) {
        try {
          const parsed = JSON.parse(mta);
          if (Array.isArray(parsed)) {
            const now = new Date().toISOString();
            for (const t of parsed) {
              if (t.id) await supabase.from("emails").update({ status: "resolved", resolved_at: now }).eq("id", t.id);
            }
          }
        } catch {}
      }
      await queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success(markAsQuoted ? "Email sent & marked as quoted" : "Email sent");
      onClose();
    } catch {
      toast.error("Failed to send");
    }
    setSending(false);
  };

  const handleSend = () => {
    if (!email.from_email || !email.draft_response) return;
    if (isQuoteDraft) {
      setQuotePromptOpen(true);
    } else {
      executeSend(false);
    }
  };

  const handleDiscardDraft = async () => {
    await supabase.from("emails").update({ draft_response: null } as any).eq("id", email.id);
    await queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success("Draft discarded — email stays in inbox");
    onClose();
  };

  const handleArchive = async () => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("emails").update({ status: "resolved", draft_response: null, resolved_at: now } as any).eq("id", email.id);
    if (error) console.error("[DraftEditor] Archive error:", error);
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

  return (
    <>
      <Sheet open={!!email} onOpenChange={() => onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-[80vw] p-0 flex flex-col h-full">
          <SheetHeader className="p-4 pb-3 border-b shrink-0">
            <div className="text-sm text-muted-foreground font-sans">
              <span className="font-medium text-foreground">{email.from_name || email.from_email}</span>
              <span className="ml-1">&lt;{email.from_email}&gt;</span>
            </div>
            <div>
              <label className="text-xs font-sans text-muted-foreground">Subject</label>
              <Input value={subjectValue} onChange={e => setSubjectValue(e.target.value)} className="rounded-xl h-8 text-sm" />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            <div className="md:w-[40%] border-r overflow-y-auto p-4 space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground font-sans uppercase tracking-wide">Original Email</h3>
              {email.incoming_summary && (
                <div className="text-sm font-sans rounded-lg px-3 py-2 bg-blue-50 text-blue-800 border border-blue-200">
                  🤖 {email.incoming_summary}
                </div>
              )}
              <AlertBanners email={email} onNavigateToEmail={onNavigateToEmail} />
              <EmailCrossMatchBanner email={email} onClose={onClose} />
              {atts.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">📎 Attachments</span>
                  <div className="flex flex-wrap gap-1.5">
                    {atts.map((att: any, i: number) => {
                      const url = getAttachmentUrl(att);
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-muted/50 border text-[11px] font-sans hover:bg-muted">
                          <Paperclip size={10} />
                          <span className="truncate max-w-[120px]">{att.name || "Attachment"}</span>
                          <ExternalLink size={9} />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="bg-muted/20 rounded-xl p-3 text-sm font-sans email-html-content max-w-none"
                dangerouslySetInnerHTML={{ __html: formatEmailBodyAsHtml(stripN8nFooter(email.body || "")) }} />
            </div>

            <div className="md:w-[60%] overflow-y-auto p-4 space-y-3 flex flex-col">
              <h3 className="text-xs font-medium text-muted-foreground font-sans uppercase tracking-wide">Draft Response</h3>
              <div>
                <label className="text-xs font-sans text-muted-foreground">CC</label>
                <Input value={ccValue} onChange={e => setCcValue(e.target.value)} placeholder="cc@example.com" className="rounded-xl h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-sans text-muted-foreground">BCC</label>
                <Input value={bccValue} onChange={e => setBccValue(e.target.value)} placeholder="bcc@example.com" className="rounded-xl h-8 text-sm" />
              </div>
              <FormattingToolbar />
              <div ref={editRef} contentEditable suppressContentEditableWarning
                className="flex-1 text-sm font-sans rounded-xl border bg-background p-4 min-h-[300px] focus:outline-none focus:ring-2 focus:ring-ring email-html-content max-w-none overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: cleaned }} />
              <AttachmentPicker files={attachments} onChange={setAttachments} />
            </div>
          </div>

          <div className="border-t p-4 flex items-center gap-2 flex-wrap bg-background shrink-0">
            <Button size="sm" className="rounded-xl gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]"
              onClick={handleSend} disabled={sending}>
              <Send size={12} /> Send
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs text-amber-600 border-amber-300 hover:bg-amber-50 min-h-[44px]"
              onClick={handleDiscardDraft}>
              <Trash2 size={12} /> Discard Draft
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs min-h-[44px]"
              onClick={handleArchive}>
              <Archive size={12} /> Archive Email
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Quote confirmation popup */}
      <Dialog open={quotePromptOpen} onOpenChange={setQuotePromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Mark as Quoted?</DialogTitle>
            <DialogDescription className="font-sans">
              This looks like a quote — would you like to mark it as Quoted?
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 pt-2">
            <Button
              size="sm"
              className="rounded-xl gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white min-h-[44px] flex-1"
              disabled={sending}
              onClick={() => { setQuotePromptOpen(false); executeSend(true); }}
            >
              Yes, Mark as Quoted
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-1 text-xs min-h-[44px] flex-1"
              disabled={sending}
              onClick={() => { setQuotePromptOpen(false); executeSend(false); }}
            >
              No, Just Send
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}