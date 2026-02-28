import React, { useRef, useState } from "react";
import { Email, useUpdateEmail, sendEmailViaWebhook } from "@/lib/emailData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Send, X, Paperclip, Download } from "lucide-react";
import { toast } from "sonner";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { AlertBanners } from "./AlertBanners";
import { EmailCrossMatchBanner } from "@/components/CrossMatchBanner";
import {
  CATEGORY_COLORS, splitDraftAtHr, stripN8nFooter, formatTimeFull, formatAge, parseAttachments, getAttachmentUrl,
} from "./InboxHelpers";

interface DraftEditorProps {
  email: Email | null;
  onClose: () => void;
  onOpenThread: (email: Email) => void;
  onNavigateToEmail: (id: string) => void;
  onSendSuccess: () => void;
}

export function DraftEditor({ email, onClose, onOpenThread, onNavigateToEmail, onSendSuccess }: DraftEditorProps) {
  const editRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [sending, setSending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const updateEmail = useUpdateEmail();
  const queryClient = useQueryClient();

  if (!email) return null;

  const cleaned = stripN8nFooter(email.draft_response || "");
  const { draftPart, quotedPart } = splitDraftAtHr(cleaned);
  const age = formatAge(email.created_at);
  const atts = parseAttachments(email.attachments);

  const cascadeResolve = async (senderEmail: string) => {
    const now = new Date().toISOString();
    await supabase.from("emails")
      .update({ status: "resolved", draft_response: null, resolved_at: now } as any)
      .eq("from_email", senderEmail)
      .in("status", ["pending", "needs_response"]);
  };

  const resolveMultiTopicRelated = async (): Promise<number> => {
    const mta = (email as any).multi_topic_alert;
    if (!mta) return 0;
    try {
      const parsed = JSON.parse(mta);
      if (!Array.isArray(parsed) || parsed.length === 0) return 0;
      const ids = parsed.map((t: any) => t.id).filter(Boolean);
      const now = new Date().toISOString();
      for (const id of ids) { await supabase.from("emails").update({ status: 'resolved', resolved_at: now }).eq("id", id); }
      queryClient.invalidateQueries({ queryKey: ["emails"] });
      return ids.length;
    } catch { return 0; }
  };

  const scheduleFollowUps = async () => {
    if (email.category !== "SALES") return;
    const { data: existing } = await supabase.from("follow_ups").select("id").eq("email_id", email.id).limit(1);
    if (existing && existing.length > 0) return;
    const now = new Date();
    await supabase.from("follow_ups").insert([
      { email_id: email.id, client_email: email.from_email, client_name: email.from_name, subject: email.subject, follow_up_number: 1, scheduled_for: new Date(now.getTime() + 7 * 86400000).toISOString(), sent: false, cancelled: false },
      { email_id: email.id, client_email: email.from_email, client_name: email.from_name, subject: email.subject, follow_up_number: 2, scheduled_for: new Date(now.getTime() + 14 * 86400000).toISOString(), sent: false, cancelled: false },
    ] as any);
  };

  const handleSend = async () => {
    if (!email.from_email || !email.draft_response) return;
    setSending(true);
    try {
      const draftContent = isEditing && editRef.current ? editRef.current.innerHTML : email.draft_response;
      await sendEmailViaWebhook({
        to_email: email.from_email,
        subject: `Re: ${email.subject || ""}`,
        draft: stripN8nFooter(draftContent),
        gmail_id: email.gmail_id || undefined,
        email_id: email.id,
        attachments: attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })),
        original_draft: email.draft_response || undefined,
      });
      if (isEditing) {
        await updateEmail.mutateAsync({ id: email.id, status: "approved_sent" as any, draft_response: stripN8nFooter(editRef.current?.innerHTML || "") });
      } else {
        await updateEmail.mutateAsync({ id: email.id, status: "approved_sent" as any });
      }
      await scheduleFollowUps();
      const resolvedCount = await resolveMultiTopicRelated();
      toast.success(resolvedCount > 0 ? `Email sent + ${resolvedCount} related emails resolved` : "Email sent");
      onSendSuccess();
      onClose();
    } catch {
      toast.error("Failed to send");
    }
    setSending(false);
  };

  const handleDismiss = async () => {
    const now = new Date().toISOString();
    await updateEmail.mutateAsync({ id: email.id, status: "resolved" as any, resolved_at: now });
    if (email.from_email) {
      await cascadeResolve(email.from_email);
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success("Email dismissed");
    onClose();
  };

  const handleChangeCategory = async (newCategory: string) => {
    const updates: any = { category: newCategory };
    if (newCategory === "SPAM") { updates.status = "resolved"; updates.resolved_at = new Date().toISOString(); }
    await updateEmail.mutateAsync({ id: email.id, ...updates });
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`Category changed to ${newCategory}`);
  };

  return (
    <Sheet open={!!email} onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[55vw] p-0 flex flex-col h-full">
        <SheetHeader className="p-5 pb-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-serif text-lg leading-tight">Draft Response</SheetTitle>
            <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs h-7" onClick={() => { onClose(); setTimeout(() => onOpenThread(email), 150); }}>
              View Thread ↗
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm font-sans flex-wrap">
            <span className="font-medium">{email.from_name || email.from_email}</span>
            <span className="text-muted-foreground">&lt;{email.from_email}&gt;</span>
          </div>
          <div className="text-xs text-muted-foreground font-sans">{email.subject}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Category pills - clickable */}
            {(["SALES", "SUPPORT", "SPAM"] as const).map(cat => (
              <button key={cat} onClick={() => handleChangeCategory(cat)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium transition-opacity ${CATEGORY_COLORS[cat]} ${email.category === cat ? "ring-1 ring-offset-1 ring-current opacity-100" : "opacity-40 hover:opacity-70"}`}>
                {cat}
              </button>
            ))}
            <span className={`text-xs font-sans ${age.color}`}>{age.text}</span>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Alert banners */}
          <AlertBanners email={email} onNavigateToEmail={onNavigateToEmail} />
          <EmailCrossMatchBanner email={email} onClose={onClose} />

          {/* Incoming summary */}
          {email.incoming_summary && (
            <div className="text-sm font-sans font-medium rounded-lg px-3 py-2" style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}>
              💬 {email.incoming_summary}
            </div>
          )}

          {/* Incoming attachments */}
          {atts.length > 0 && (
            <div>
              <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">Attachments</span>
              <div className="flex flex-wrap gap-2">
                {atts.map((att: any, i: number) => {
                  const url = getAttachmentUrl(att);
                  return (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-xs font-sans font-medium border">
                      <Paperclip size={12} className="text-muted-foreground" />
                      <span className="truncate max-w-[160px]">{att.name || "Attachment"}</span>
                      <Download size={10} className="text-muted-foreground" />
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Draft content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground font-sans">Draft</span>
              {!isEditing && (
                <button className="text-xs text-primary font-sans hover:underline" onClick={() => setIsEditing(true)}>Edit</button>
              )}
            </div>
            {isEditing ? (
              <>
                <FormattingToolbar />
                <div ref={editRef} contentEditable suppressContentEditableWarning
                  className="text-sm font-sans rounded-xl border bg-background p-4 min-h-[200px] focus:outline-none focus:ring-2 focus:ring-ring email-html-content max-w-none"
                  dangerouslySetInnerHTML={{ __html: draftPart }} />
              </>
            ) : (
              <div className="bg-muted/20 rounded-xl p-4 text-sm font-sans email-html-content max-w-none"
                dangerouslySetInnerHTML={{ __html: draftPart }} />
            )}
          </div>

          {/* Quoted part */}
          {quotedPart && (
            <div>
              <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">Quoted Original</span>
              <div className="bg-muted/10 rounded-xl p-4 text-sm font-sans email-html-content max-w-none"
                style={{ borderLeft: '3px solid #ccc', paddingLeft: '12px', color: '#666' }}
                dangerouslySetInnerHTML={{ __html: quotedPart }} />
            </div>
          )}

          {/* Attachment picker */}
          <AttachmentPicker files={attachments} onChange={setAttachments} />
        </div>

        {/* Actions */}
        <div className="border-t p-4 flex items-center gap-2 flex-wrap bg-background shrink-0">
          <Button size="sm" className="rounded-xl gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white min-h-[44px]"
            onClick={handleSend} disabled={sending}>
            <Send size={12} /> {isEditing ? "Send Edited" : "Send"}
          </Button>
          <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs text-muted-foreground min-h-[44px]"
            onClick={handleDismiss}>
            <X size={12} /> Dismiss
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
