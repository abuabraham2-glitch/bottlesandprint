import React from "react";
import { Email } from "@/lib/emailData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Archive, FileText, Paperclip, ExternalLink, CheckCircle, Reply } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { EmailCrossMatchBanner } from "@/components/CrossMatchBanner";
import { AlertBanners } from "./AlertBanners";
import {
  CATEGORY_COLORS, CATEGORIES, displaySenderName, stripN8nFooter, formatEmailBodyAsHtml,
  formatTimeFull, parseAttachments, getAttachmentUrl,
} from "./InboxHelpers";

interface ThreadViewProps {
  email: Email | null;
  onClose: () => void;
  onOpenDraft: (email: Email) => void;
  onNavigateToEmail: (id: string) => void;
}

function stripQuotedText(body: string): string {
  // Remove HTML quoted blocks first
  let cleaned = body
    .replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, "")
    .replace(/(<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*)/gi, "")
    .replace(/(<div[^>]*class="[^"]*yahoo_quoted[^"]*"[^>]*>[\s\S]*)/gi, "");

  // Convert to text lines for pattern matching
  const isHtml = /<(?:div|p|br|span|table)\b/i.test(cleaned);
  if (isHtml) {
    // For HTML, remove common reply header patterns
    cleaned = cleaned
      .replace(/<hr[^>]*>[\s\S]*/gi, "")
      .replace(/On\s+.{10,80}\s+wrote:\s*(<br\s*\/?>|<\/p>|<\/div>)[\s\S]*/gi, "")
      .replace(/From:\s*.+[\s\S]*/gi, "")
      .replace(/------\s*Original Message\s*------[\s\S]*/gi, "")
      .replace(/_{5,}[\s\S]*/g, "");
  } else {
    // For plain text
    const lines = cleaned.split(/\r?\n/);
    const cutLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^>/.test(trimmed)) continue;
      if (/^On\s+.{10,80}\s+wrote:\s*$/.test(trimmed)) break;
      if (/^From:\s+/i.test(trimmed)) break;
      if (/^------\s*Original Message/i.test(trimmed)) break;
      if (/^_{5,}$/.test(trimmed)) break;
      cutLines.push(line);
    }
    cleaned = cutLines.join("\n");
  }

  // Trim trailing empty tags/whitespace
  cleaned = cleaned.replace(/(<br\s*\/?\s*>|\s|&nbsp;)+$/gi, "").trim();
  return cleaned || "(no new content)";
}

export function ThreadView({ email, onClose, onOpenDraft, onNavigateToEmail }: ThreadViewProps) {
  const queryClient = useQueryClient();

  const sortedMessages = useMemo(() => {
    if (!threadMessages) return [];
    return [...threadMessages].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }, [threadMessages]);

  const visibleMessages = useMemo(() => {
    if (sortedMessages.length <= 3 || showAllMessages) return sortedMessages;
    return [sortedMessages[0], sortedMessages[sortedMessages.length - 1]];
  }, [sortedMessages, showAllMessages]);

  const hiddenCount = sortedMessages.length > 3 && !showAllMessages
    ? sortedMessages.length - 2 : 0;

  if (!email) return null;

  const atts = parseAttachments(email.attachments);
  const hasDraft = !!email.draft_response;
  const isResolved = email.status === "resolved" || email.status === "approved_sent";

  const handleChangeCategory = async (newCategory: string) => {
    const updates: any = { category: newCategory };
    if (newCategory === "SPAM") {
      updates.status = "resolved";
      updates.resolved_at = new Date().toISOString();
    } else {
      updates.status = "needs_response";
      updates.resolved_at = null;
    }
    await supabase.from("emails").update(updates).eq("id", email.id);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["all-emails"] });
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
                {email.thread_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl gap-1.5 text-xs h-7"
                    asChild
                  >
                    <a
                      href={`https://mail.google.com/mail/u/0/#all/${email.thread_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={12} />
                      Open in Gmail
                    </a>
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isResolved && (
                <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs px-3 py-1">
                  <CheckCircle size={12} className="mr-1" />
                  {email.status === "approved_sent" ? "Sent" : "Resolved"}
                </Badge>
              )}
              {hasDraft && (
                <Button size="sm" variant="default" className="rounded-xl gap-1 text-xs h-8" onClick={() => { onClose(); setTimeout(() => onOpenDraft(email), 150); }}>
                  <FileText size={12} /> View Draft →
                </Button>
              )}
              <Button size="sm" className="rounded-xl gap-1 text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => { onClose(); setTimeout(() => onOpenDraft(email), 150); }}>
                <Reply size={12} /> Reply
              </Button>
              {!isResolved && (
                <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs h-8" onClick={handleArchive}>
                  <Archive size={12} /> Archive
                </Button>
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

        </div>
      </SheetContent>
    </Sheet>
  );
}

const ABU_IDENTIFIERS = ["abu@bottlesandprint.com", "abu mathew", "abu abraham", "bottles & print", "bottles and print"];

function isOutbound(sender: string | undefined): boolean {
  if (!sender) return false;
  const lower = sender.toLowerCase();
  return ABU_IDENTIFIERS.some(id => lower.includes(id));
}

function ThreadMessageCard({ msg, index, isLatest }: { msg: ThreadMessage; index: number; isLatest: boolean }) {
  const cleanBody = stripQuotedText(stripN8nFooter(msg.body || ""));
  const outbound = isOutbound(msg.sender);

  return (
    <div className={`rounded-xl border p-4 space-y-2 ${outbound
      ? "bg-primary/5 border-primary/20 ml-6"
      : "bg-muted/20 border-border mr-6"
    }`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-sans">
          <span className={`inline-flex items-center gap-1 font-semibold ${outbound ? "text-primary" : "text-foreground"}`}>
            {outbound ? (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-primary/10 text-primary mr-1">You</span>
            ) : (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground mr-1">From</span>
            )}
            {msg.sender}
          </span>
          <span className="text-muted-foreground">{formatTimeFull(msg.timestamp)}</span>
        </div>
        {isLatest && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            Latest
          </span>
        )}
      </div>
      <div
        className="text-sm font-sans email-html-content max-w-none leading-relaxed"
        dangerouslySetInnerHTML={{ __html: formatEmailBodyAsHtml(cleanBody) }}
      />
    </div>
  );
}