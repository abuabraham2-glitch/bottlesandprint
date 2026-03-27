import React from "react";
import { Email } from "@/lib/emailData";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Archive, FileText, Paperclip, ExternalLink, CheckCircle, Reply, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { EmailCrossMatchBanner } from "@/components/CrossMatchBanner";
import { AlertBanners } from "./AlertBanners";
import {
  displaySenderName, stripN8nFooter, formatEmailBodyAsHtml,
  formatTimeFull, parseAttachments, getAttachmentUrl,
} from "./InboxHelpers";

interface ThreadViewProps {
  email: Email | null;
  onClose: () => void;
  onOpenDraft: (email: Email) => void;
  onNavigateToEmail: (id: string) => void;
  onArchive?: (email: Email) => void;
  onDelete?: (email: Email) => void;
  onUpdateLabel?: (emailId: string, label: string | null) => void;
}

export function ThreadView({ email, onClose, onOpenDraft, onNavigateToEmail, onArchive, onDelete, onUpdateLabel }: ThreadViewProps) {
  const queryClient = useQueryClient();

  if (!email) return null;

  const atts = parseAttachments(email.attachments);
  const hasDraft = !!email.draft_response;
  const isResolved = email.status === "resolved" || email.status === "approved_sent";

  const handleArchive = () => {
    if (onArchive) {
      onClose();
      onArchive(email);
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(email);
    }
  };

  const labelOptions = [
    { value: "receipt", label: "Receipt" },
    { value: "other", label: "Other" },
    { value: null, label: "Clear" },
  ];

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
                  <a
                    href={`https://mail.google.com/mail/u/0/#all/${email.thread_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-red-300 text-red-600 text-[11px] font-medium hover:bg-red-50 transition-colors"
                  >
                    <ExternalLink size={14} />
                    Gmail
                  </a>
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
              <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs h-8 text-destructive hover:text-destructive" onClick={handleDelete}>
                <Trash2 size={12} />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Label editor for archived emails */}
          {email.status === "resolved" && onUpdateLabel && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-sans text-muted-foreground font-medium">Label:</span>
              {labelOptions.map(opt => (
                <button
                  key={opt.value || "clear"}
                  onClick={() => onUpdateLabel(email.id, opt.value)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-sans font-medium transition-colors ${
                    email.label === opt.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* AI Summary */}
          {email.incoming_summary && (
            <div className="text-sm font-sans rounded-lg px-3 py-2 bg-accent/50 text-accent-foreground border border-border">
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
