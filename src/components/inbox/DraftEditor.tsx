import React, { useRef, useState } from "react";
import { Email, useUpdateEmail, sendEmailViaWebhook } from "@/lib/emailData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Archive, Trash2, Paperclip, ExternalLink, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { TemplateShortcuts } from "@/components/TemplateShortcuts";
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
  const [regenerating, setRegenerating] = useState(false);
  const [toValue, setToValue] = useState("");
  const [ccValue, setCcValue] = useState("");
  const [bccValue, setBccValue] = useState("");
  const [quotePromptOpen, setQuotePromptOpen] = useState(false);
  const [subjectValue, setSubjectValue] = useState("");
  const updateEmail = useUpdateEmail();
  const queryClient = useQueryClient();

  // Reset CC and subject when email changes
  React.useEffect(() => {
    if (!email) return;
    setToValue(email.from_email || "");
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

  const getEditorContent = () => {
    const html = editRef.current ? editRef.current.innerHTML : "";
    const text = editRef.current ? editRef.current.innerText.trim() : "";
    return { html, text };
  };

  const executeSend = async (markAsQuoted: boolean) => {
    const { html: draftContent, text: draftText } = getEditorContent();
    if (!toValue || !draftText) return;
    setSending(true);
    try {
      const payload = {
        to_email: toValue,
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
      await supabase.from("emails").update({ status: "approved_sent", approved_sent_at: new Date().toISOString(), direction: "outbound" } as any).eq("id", email.id);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
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
      // Silently resolve linked call if present
      if ((email as any).call_id) {
        await supabase.from("calls").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", (email as any).call_id);
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
    const { text: draftText } = getEditorContent();
    if (!toValue || !draftText) return;
    if (isQuoteDraft) {
      setQuotePromptOpen(true);
    } else {
      executeSend(false);
    }
  };

  const handleDiscardDraft = async () => {
    await supabase.from("emails").update({ draft_response: null } as any).eq("id", email.id);
    if (editRef.current) editRef.current.innerHTML = "";
    await queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success("Draft discarded — editor cleared");
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      // Build thread context if part of a thread
      let bodyForWebhook = email.body || "";
      let mostRecentCreatedAt: string | null = email.created_at || null;
      if (email.thread_id) {
        const { data: threadRows } = await supabase
          .from("emails")
          .select("from_name, from_email, body, draft_response, direction, created_at, status")
          .eq("thread_id", email.thread_id)
          .order("created_at", { ascending: true });
        const rows = (threadRows || []).filter((r: any) => r.status !== "deleted" && r.status !== "spam");
        if (rows.length > 0) {
          mostRecentCreatedAt = rows[rows.length - 1].created_at || mostRecentCreatedAt;
          const stripHtml = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          const lines: string[] = [`[Thread context — ${rows.length} messages, oldest first]`, ""];
          rows.forEach((r: any, idx: number) => {
            const isOutbound = r.direction === "outbound";
            const rawBody = (isOutbound && r.draft_response) ? r.draft_response : (r.body || "");
            const cleaned = stripHtml(stripN8nFooter(rawBody));
            const dateStr = r.created_at
              ? new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "";
            const sender = isOutbound ? "Abu (You)" : (r.from_name || r.from_email || "Unknown");
            const isLast = idx === rows.length - 1;
            const suffix = isLast ? " (most recent — respond to this)" : "";
            lines.push(`=== ${dateStr} — From ${sender}${suffix} ===`);
            lines.push(cleaned);
            lines.push("");
          });
          bodyForWebhook = lines.join("\n");
        }
      }
      const emailDate = mostRecentCreatedAt
        ? new Date(mostRecentCreatedAt).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const res = await fetch("https://bottlesandprint.app.n8n.cloud/webhook/regenerate-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_id: email.id,
          category: email.category || "",
          from_email: email.from_email || "",
          from_name: email.from_name || "",
          subject: email.subject || "",
          body: bodyForWebhook,
          email_date: emailDate,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error("not ok");
      // Wait 3s for n8n workflow to write the new draft to Supabase
      await new Promise(r => setTimeout(r, 3000));
      const { data: updated, error } = await supabase
        .from("emails")
        .select("draft_response")
        .eq("id", email.id)
        .single();
      if (error || !updated?.draft_response) throw new Error("empty draft");
      if (editRef.current) {
        editRef.current.innerHTML = stripN8nFooter(updated.draft_response);
      }
      await queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("Draft regenerated.");
    } catch {
      toast.error("Regeneration failed — try again");
    } finally {
      clearTimeout(timeoutId);
      setRegenerating(false);
    }
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
            <div>
              <label className="text-xs font-sans text-muted-foreground">To</label>
              <Input value={toValue} onChange={e => setToValue(e.target.value)} placeholder="recipient@example.com" className="rounded-xl h-8 text-sm" />
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
                <Input name="draft-cc" autoComplete="off" value={ccValue} onChange={e => setCcValue(e.target.value)} placeholder="cc@example.com" className="rounded-xl h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-sans text-muted-foreground">BCC</label>
                <Input name="draft-bcc" autoComplete="off" value={bccValue} onChange={e => setBccValue(e.target.value)} placeholder="bcc@example.com" className="rounded-xl h-8 text-sm" />
              </div>
              <TemplateShortcuts
                editorRef={editRef}
                setSubject={setSubjectValue}
                currentSubject={subjectValue}
              />
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
              onClick={handleRegenerate} disabled={regenerating}>
              <RotateCw size={12} className={regenerating ? "animate-spin" : ""} />
              {regenerating ? "Regenerating draft (this can take 10-20 seconds for long threads)…" : "Regenerate Draft"}
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