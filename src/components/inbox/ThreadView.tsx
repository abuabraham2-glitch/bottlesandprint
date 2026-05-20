import React, { useState, useRef, useEffect } from "react";
import { Email } from "@/lib/emailData";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ThreadSummaryCard } from "@/components/inbox/ThreadSummaryCard";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Archive,
  FileText,
  Paperclip,
  ExternalLink,
  CheckCircle,
  Reply,
  Trash2,
  BookCheck,
  ArrowRightLeft,
  ArrowLeft,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertBanners } from "./AlertBanners";
import {
  displaySenderName,
  stripN8nFooter,
  formatEmailBodyAsHtml,
  formatTimeFull,
  parseAttachments,
  getAttachmentUrl,
} from "./InboxHelpers";
import { format } from "date-fns";
import { getContributorCount } from "@/lib/threadHelpers";

interface ThreadViewProps {
  email: Email | null;
  onClose: () => void;
  onOpenDraft: (email: Email) => void;
  onNavigateToEmail: (id: string) => void;
  onArchive?: (email: Email) => void;
  onDelete?: (email: Email) => void;
  onUpdateLabel?: (emailId: string, label: string | null) => void;
  onMoveToWaiting?: (email: Email) => void;
  crossThreadBack?: { id: string; subject: string } | null;
  onCaptureCrossThreadBack?: (current: Email) => void;
  onClearCrossThreadBack?: () => void;
}

export function ThreadView({
  email,
  onClose,
  onOpenDraft,
  onNavigateToEmail,
  onArchive,
  onDelete,
  onUpdateLabel,
  onMoveToWaiting,
  crossThreadBack,
  onCaptureCrossThreadBack,
  onClearCrossThreadBack,
}: ThreadViewProps) {
  const queryClient = useQueryClient();
  const [markingQuoted, setMarkingQuoted] = useState(false);
  const [showAllAttachments, setShowAllAttachments] = useState(false);
  const [fullThreadExpanded, setFullThreadExpanded] = useState(false);
  const [collapsedMessages, setCollapsedMessages] = useState<{ [key: string]: boolean }>({});

  const threadId = email?.thread_id ?? null;

  const { data: threadCount = 0 } = useQuery({
    queryKey: ["thread-message-count", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id,status")
        .eq("thread_id", threadId as string);
      if (error) return 0;
      return (data || []).filter((r: any) => r.status !== "deleted" && r.status !== "spam").length;
    },
    enabled: !!threadId,
    staleTime: 60 * 1000,
  });

  const { data: threadMessages = [] } = useQuery({
    queryKey: ["thread-messages", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("thread_id", threadId as string)
        .order("created_at", { ascending: true });
      if (error) return [];
      return (data || []).filter((r: any) => r.status !== "deleted" && r.status !== "spam");
    },
    enabled: !!threadId,
    staleTime: 60 * 1000,
  });

  const originalEmailIdRef = useRef<string | null>(null);
  const lastThreadIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!email) {
      originalEmailIdRef.current = null;
      lastThreadIdRef.current = null;
      return;
    }
    const tid = email.thread_id ?? email.id;
    if (lastThreadIdRef.current !== tid) {
      lastThreadIdRef.current = tid;
      originalEmailIdRef.current = email.id;
    }
  }, [email?.id, email?.thread_id]);

  useEffect(() => {
    setShowAllAttachments(false);
  }, [email?.id]);

  if (!email) return null;

  const isViewingOlderMessage =
    !!originalEmailIdRef.current && originalEmailIdRef.current !== email.id && threadCount > 1;

  const atts = parseAttachments(email.attachments);
  const hasDraft = !!email.draft_response;
  const isResolved = email.status === "resolved" || email.status === "approved_sent";
  const isMultiMessageThread = threadCount >= 2;

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

  const handleMarkAsQuoted = async () => {
    setMarkingQuoted(true);
    try {
      await supabase
        .from("emails")
        .update({ quoted_at: new Date().toISOString() } as any)
        .eq("id", email.id);
      await queryClient.invalidateQueries({ queryKey: ["emails"] });
      toast.success("Marked as quoted");
    } catch {
      toast.error("Failed to mark as quoted");
    }
    setMarkingQuoted(false);
  };

  const labelOptions = [
    { value: "receipt", label: "Receipt" },
    { value: "other", label: "Other" },
    { value: null, label: "Clear" },
  ];

  const quotedAt = (email as any).quoted_at;
  const visibleAtts = showAllAttachments || atts.length <= 4 ? atts : atts.slice(0, 3);
  const hiddenCount = atts.length - visibleAtts.length;

  const showWaitingItem =
    !isResolved && !!onMoveToWaiting && email.status !== "approved_sent" && email.status !== "waiting";
  const showArchiveItem = (!isResolved || email.status === "approved_sent") && !!onArchive;
  const showDeleteItem = !!onDelete;
  const hasOverflow = showWaitingItem || showArchiveItem || showDeleteItem;

  const toggleMessageCollapse = (msgId: string) => {
    setCollapsedMessages((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const renderMessageBody = (msg: any) => {
    const isOutbound = msg.direction === "outbound";
    const displayBody = isOutbound && msg.draft_response ? msg.draft_response : msg.body;

    if (displayBody && displayBody.trim()) {
      return (
        <div
          className="text-sm font-sans email-html-content max-w-none text-foreground"
          dangerouslySetInnerHTML={{ __html: formatEmailBodyAsHtml(stripN8nFooter(displayBody)) }}
        />
      );
    }
    if (msg.html_body) {
      return (
        <iframe
          srcDoc={msg.html_body}
          title="Email content"
          className="w-full bg-white rounded-md border min-h-[200px]"
          sandbox="allow-same-origin"
          style={{ border: "none" }}
          onLoad={(e) => {
            const iframe = e.currentTarget;
            if (iframe.contentDocument?.body) {
              iframe.style.height = iframe.contentDocument.body.scrollHeight + 32 + "px";
            }
          }}
        />
      );
    }
    return <div className="text-sm font-sans text-muted-foreground italic">No content available</div>;
  };

  const renderMessageSection = (msg: any, isLatest: boolean = false) => {
    const isOutbound = msg.direction === "outbound";
    const isCollapsed = collapsedMessages[msg.id];
    const msgAtts = parseAttachments(msg.attachments);
    const headerLabel = isOutbound ? "You replied" : "Email";

    return (
      <div
        key={msg.id}
        className={`rounded-lg overflow-hidden border ${
          isLatest
            ? "bg-blue-50 border-blue-400 border-l-4"
            : isOutbound
              ? "bg-blue-50 border-blue-300 ml-6 border-l-2"
              : "bg-background border-border"
        }`}
      >
        {/* Message Header (Collapsible) */}
        <button
          onClick={() => toggleMessageCollapse(msg.id)}
          className={`w-full px-4 py-3 text-left flex items-center justify-between gap-2 border-b transition-colors ${
            isOutbound ? "hover:bg-blue-100/50" : "hover:bg-muted/30"
          }`}
        >
          <div className="flex-1 min-w-0">
            <p className={`font-medium text-sm ${isOutbound ? "text-blue-900" : "text-foreground"}`}>
              {headerLabel === "You replied" ? "Abu Mathew Abraham" : displaySenderName(msg.from_name, msg.from_email)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isOutbound ? "to " : "from "}
              {msg.from_email}
            </p>
            <p className="text-xs text-muted-foreground">{formatTimeFull(((msg as any).approved_sent_at && msg.direction === "outbound") ? (msg as any).approved_sent_at : ((msg as any).original_sent_at || msg.created_at))}</p>
          </div>
          <div className="flex-shrink-0">{isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</div>
        </button>

        {/* Message Content (Collapsible) */}
        {!isCollapsed && (
          <div className={`px-4 py-3 ${isOutbound ? "bg-blue-50" : "bg-background"}`}>
            {/* Message body */}
            <div className="mb-3">{renderMessageBody(msg)}</div>

            {/* Attachments */}
            {msgAtts.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground font-sans shrink-0">
                  <Paperclip size={11} /> Attachments
                </span>
                {msgAtts.map((att: any, i: number) => {
                  const url = getAttachmentUrl(att);
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-muted/60 hover:bg-muted border text-[11px] font-sans text-foreground max-w-[140px] truncate transition-colors"
                      title={att.name || "Attachment"}
                    >
                      <span className="truncate">{att.name || "Attachment"}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Get latest message and all other messages
  const latestMessage = threadMessages.length > 0 ? threadMessages[threadMessages.length - 1] : null;
  const otherMessages = threadMessages.slice(0, -1);

  return (
    <Sheet open={!!email} onOpenChange={() => onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[55vw] p-0 flex flex-col h-full overflow-hidden">
        {/* SUBJECT TITLE (BIG & BOLD) */}
        <div className="px-5 pt-5 pb-3 border-b shrink-0">
          <h1 className="text-2xl font-serif font-medium text-foreground leading-tight mb-3">{email.subject}</h1>
        </div>

        {/* THREAD CONTEXT */}
        {isMultiMessageThread && (
          <div className="px-5 py-3 border-b bg-muted/30 shrink-0">
            <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Thread context</p>
            <ThreadSummaryCard threadId={email.thread_id} messageCount={threadCount} />
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="px-5 py-3 border-b flex items-center gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
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
            {isResolved && (
              <Badge variant="secondary" className="bg-muted text-muted-foreground text-xs px-3 py-1">
                <CheckCircle size={12} className="mr-1" />
                {email.status === "approved_sent" ? "Sent" : "Resolved"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {hasDraft && (
              <Button
                size="sm"
                variant="default"
                className="rounded-xl gap-1 text-xs h-8"
                onClick={() => {
                  onClose();
                  setTimeout(() => onOpenDraft(email), 150);
                }}
              >
                <FileText size={12} /> View Draft →
              </Button>
            )}
            <Button
              size="sm"
              className="rounded-xl gap-1 text-xs h-8 bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => {
                onClose();
                setTimeout(() => onOpenDraft(email), 150);
              }}
            >
              <Reply size={12} /> Reply
            </Button>
            {hasOverflow && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="rounded-xl text-xs h-8 px-2" aria-label="More actions">
                    <MoreHorizontal size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {showWaitingItem && (
                    <DropdownMenuItem
                      onClick={() => {
                        onMoveToWaiting!(email);
                        onClose();
                      }}
                    >
                      <ArrowRightLeft size={12} className="mr-2" /> Waiting on Them
                    </DropdownMenuItem>
                  )}
                  {showArchiveItem && (
                    <DropdownMenuItem onClick={handleArchive}>
                      <Archive size={12} className="mr-2" /> Archive
                    </DropdownMenuItem>
                  )}
                  {showDeleteItem && (
                    <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                      <Trash2 size={12} className="mr-2" /> Delete
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* ALERT BANNERS & LABELS */}
        <div className="px-5 pt-3 pb-3 border-b shrink-0 space-y-2">
          {isViewingOlderMessage && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-sans"
              style={{ backgroundColor: "#FFF7ED", border: "1px solid #FED7AA" }}
            >
              <span className="flex-1" style={{ color: "#92400E" }}>
                Viewing an older message in this thread
              </span>
              <button
                type="button"
                onClick={() => {
                  const latestId = originalEmailIdRef.current;
                  if (latestId) onNavigateToEmail(latestId);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{ color: "#92400E" }}
              >
                <ArrowLeft size={11} /> Back to latest
              </button>
            </div>
          )}

          {!isViewingOlderMessage && crossThreadBack && crossThreadBack.id !== email.id && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-sans"
              style={{ backgroundColor: "#FFF7ED", border: "1px solid #FED7AA" }}
            >
              <span className="flex-1" style={{ color: "#92400E" }}>
                Viewing related email
              </span>
              <button
                type="button"
                onClick={() => {
                  const backId = crossThreadBack.id;
                  onClearCrossThreadBack?.();
                  onNavigateToEmail(backId);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md whitespace-nowrap"
                style={{ color: "#92400E" }}
                title={crossThreadBack.subject}
              >
                <ArrowLeft size={11} /> Back to{" "}
                {crossThreadBack.subject.length > 40
                  ? crossThreadBack.subject.slice(0, 40) + "…"
                  : crossThreadBack.subject}
              </button>
            </div>
          )}

          {email.status === "resolved" && onUpdateLabel && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-sans text-muted-foreground font-medium">Label:</span>
              {labelOptions.map((opt) => (
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
        </div>

        {/* MAIN CONTENT: LATEST-FIRST LAYOUT */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* FULL THREAD COLLAPSIBLE BOX (collapsed by default) */}
            {isMultiMessageThread && otherMessages.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setFullThreadExpanded(!fullThreadExpanded)}
                  className="w-full px-4 py-3 bg-background hover:bg-muted/30 flex items-center justify-between gap-2 transition-colors border-b"
                >
                  <span className="text-sm font-medium text-foreground">
                    📧 Full Thread ({threadMessages.length} messages)
                  </span>
                  <div className="flex-shrink-0">
                    {fullThreadExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </button>

                {/* FULL THREAD CONTENT (expandable) */}
                {fullThreadExpanded && (
                  <div className="space-y-0">
                    {otherMessages.map((msg) => (
                      <div key={msg.id} className="border-t">
                        {renderMessageSection(msg, false)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* LATEST EMAIL (always visible, prominent) */}
            {latestMessage && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Latest Message</p>
                {renderMessageSection(latestMessage, true)}
              </div>
            )}

            {threadMessages.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No messages in this thread</div>
            )}
          </div>
        </div>

        {/* BOTTOM ACTION BAR: Mark as Quoted */}
        <div className="border-t p-4 flex items-center gap-2 flex-wrap bg-background shrink-0">
          {quotedAt ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-1 text-xs min-h-[36px] bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-900/30 dark:border-teal-700 dark:text-teal-300 cursor-default"
              disabled
            >
              <BookCheck size={12} /> Quoted ✓ {format(new Date(quotedAt), "MMM d")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-xl gap-1 text-xs min-h-[36px]"
              onClick={handleMarkAsQuoted}
              disabled={markingQuoted}
            >
              <BookCheck size={12} /> Mark as Quoted
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
