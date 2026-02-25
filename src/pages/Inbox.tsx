import React, { useState, useRef, useCallback, useEffect } from "react";
import { useActionNeededEmails, useAutoHandledEmails, useAllEmails, useUpdateEmail, useCreateTriageFeedback, sendEmailViaWebhook, useFollowUps, Email } from "@/lib/emailData";
import { useClients } from "@/lib/data";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, Edit, MessageSquare, X, ThumbsDown, Check, ChevronDown, ChevronUp, Mail, Clock, Plus, Paperclip, Users, BookUser, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { FormattingToolbar } from "@/components/FormattingToolbar";

const CATEGORY_COLORS: Record<string, string> = {
  SALES: "bg-emerald-100 text-emerald-700",
  SUPPORT: "bg-blue-100 text-blue-700",
  SPAM: "bg-red-100 text-red-700",
  ORDER_UPDATE: "bg-purple-100 text-purple-700",
  UNKNOWN: "bg-muted text-muted-foreground",
};

const SIGNATURE = `<br><br><span style="font-family: Georgia, serif; font-size: 14pt; color: #263652;">Thanks,<br><br><b>Abu Mathew Abraham</b><br><b>BOTTLES &amp; PRINT</b><br>Tel: (951) 725-1786<br><br><a href="https://www.bottlesandprint.com" style="color: #0563C1;">www.bottlesandprint.com</a></span>`;

type Tab = "action" | "auto" | "all";

/** Split draft_response at the FIRST <hr> only */
function splitDraftAtHr(html: string): { draftPart: string; quotedPart: string | null } {
  const hrIndex = html.search(/<hr[\s/>]/i);
  if (hrIndex === -1) return { draftPart: html, quotedPart: null };
  return {
    draftPart: html.substring(0, hrIndex),
    quotedPart: html.substring(hrIndex),
  };
}

/** Strip "This email was sent automatically with n8n" from HTML content */
function stripN8nFooter(html: string): string {
  return html.replace(/This email was sent automatically with n8n\.?/gi, "").replace(/<p>\s*<\/p>/g, "");
}

/** Get CC recipients for Reply All (excludes abu@bottlesandprint.com and the from_email) */
function getReplyAllCc(email: Email): string {
  const exclude = new Set(["abu@bottlesandprint.com"]);
  if (email.from_email) exclude.add(email.from_email.toLowerCase());
  const recipients: string[] = [];
  [email.to_recipients, email.cc_recipients, email.to_email_all, email.cc_emails].forEach(field => {
    if (!field) return;
    field.split(",").map(e => e.trim()).filter(Boolean).forEach(addr => {
      if (!exclude.has(addr.toLowerCase()) && !recipients.includes(addr.toLowerCase())) {
        recipients.push(addr);
      }
    });
  });
  return recipients.join(", ");
}

/** No longer needed — summaries come from email.incoming_summary DB field */

/** Convert plain text email body to HTML, handling > quoted lines and newlines */
function formatEmailBodyAsHtml(body: string): string {
  // If body contains real HTML tags (not just text with >), return as-is
  if (/<(?:div|p|br|span|table|a|b|i|strong|em|ul|ol|li|h[1-6]|img|blockquote)\b/i.test(body)) {
    return body;
  }
  // Plain text: split by actual newline chars, strip leading > chars, filter empty > lines, join with <br>
  const lines = body.split(/\r?\n/).map(line => {
    // Remove leading > characters (quoted text markers)
    return line.replace(/^(?:>\s*)+/g, "").trimEnd();
  }).filter(line => line !== ">" && line !== "> ");
  return `<div style="font-family: Tahoma, sans-serif; font-size: 12pt; line-height: 1.6;">${lines.join("<br>")}</div>`;
}

export default function Inbox() {
  const [tab, setTab] = useState<Tab>("action");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [actionCategoryFilter, setActionCategoryFilter] = useState<string>("all");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editDraftId, setEditDraftId] = useState<string | null>(null);
  const [editDraftText, setEditDraftText] = useState("");
  const [feedbackEmailId, setFeedbackEmailId] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeEmailRef, setComposeEmailRef] = useState<Email | null>(null);
  const [composeAttachments, setComposeAttachments] = useState<AttachedFile[]>([]);
  const [editAttachments, setEditAttachments] = useState<AttachedFile[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [detailEmail, setDetailEmail] = useState<Email | null>(null);
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [confirmSend, setConfirmSend] = useState<{ action: () => Promise<void> } | null>(null);
  const [toSuggestions, setToSuggestions] = useState<{email: string; name?: string}[]>([]);
  const [ccSuggestions, setCcSuggestions] = useState<{email: string; name?: string}[]>([]);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [showCcSuggestions, setShowCcSuggestions] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState<{id: string; email: string; name: string | null}[]>([]);
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const editRef = useRef<HTMLDivElement>(null);
  const composeBodyRef = useRef<HTMLDivElement>(null);

  const { data: actionEmails = [], isLoading: loadingAction } = useActionNeededEmails();
  const { data: autoEmails = [] } = useAutoHandledEmails();
  const { data: allEmails = [] } = useAllEmails(categoryFilter && categoryFilter !== "all" && categoryFilter !== "SENT" ? categoryFilter : undefined);
  const { data: clients = [] } = useClients();
  const { data: followUps = [] } = useFollowUps();
  const updateEmail = useUpdateEmail();
  const createFeedback = useCreateTriageFeedback();
  const navigate = useNavigate();

  const todayAutoCount = autoEmails.filter(e => {
    if (!e.auto_sent_at) return false;
    const d = new Date(e.auto_sent_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Load contacts
  const loadContacts = useCallback(async () => {
    const { data } = await supabase.from("contacts").select("id, email, name").order("created_at", { ascending: false });
    if (data) setContacts(data as any);
  }, []);

  useEffect(() => { loadContacts(); }, [loadContacts]);

  const addContact = async () => {
    if (!newContactEmail.trim()) return;
    await supabase.from("contacts").insert({ email: newContactEmail.trim(), name: newContactName.trim() || null } as any);
    setNewContactEmail("");
    setNewContactName("");
    loadContacts();
    toast.success("Contact added");
  };

  const deleteContact = async (id: string) => {
    await supabase.from("contacts").delete().eq("id", id);
    loadContacts();
    toast.success("Contact removed");
  };

  // Email + contacts autocomplete search
  const searchEmailsAndContacts = useCallback(async (query: string): Promise<{email: string; name?: string}[]> => {
    if (query.length < 2) return [];
    const [emailRes, contactRes] = await Promise.all([
      supabase.from("emails").select("from_email, from_name").ilike("from_email", `%${query}%`).limit(10),
      supabase.from("contacts").select("email, name").or(`email.ilike.%${query}%,name.ilike.%${query}%`).limit(10),
    ]);
    const seen = new Set<string>();
    const results: {email: string; name?: string}[] = [];
    (contactRes.data || []).forEach((c: any) => {
      if (c.email && !seen.has(c.email.toLowerCase())) {
        seen.add(c.email.toLowerCase());
        results.push({ email: c.email, name: c.name || undefined });
      }
    });
    (emailRes.data || []).forEach((e: any) => {
      if (e.from_email && !seen.has(e.from_email.toLowerCase())) {
        seen.add(e.from_email.toLowerCase());
        results.push({ email: e.from_email, name: e.from_name || undefined });
      }
    });
    return results.slice(0, 8);
  }, []);

  const handleToChange = async (value: string) => {
    setComposeTo(value);
    if (value.length >= 2) {
      const suggestions = await searchEmailsAndContacts(value);
      setToSuggestions(suggestions);
      setShowToSuggestions(suggestions.length > 0);
    } else {
      setShowToSuggestions(false);
    }
  };

  const handleCcChange = async (value: string) => {
    setComposeCc(value);
    const parts = value.split(",");
    const lastPart = parts[parts.length - 1].trim();
    if (lastPart.length >= 2) {
      const suggestions = await searchEmailsAndContacts(lastPart);
      setCcSuggestions(suggestions);
      setShowCcSuggestions(suggestions.length > 0);
    } else {
      setShowCcSuggestions(false);
    }
  };

  const selectToSuggestion = (email: string) => {
    setComposeTo(email);
    setShowToSuggestions(false);
  };

  const selectCcSuggestion = (email: string) => {
    const parts = composeCc.split(",").map(s => s.trim()).filter(Boolean);
    parts[parts.length - 1] = email;
    setComposeCc(parts.join(", "));
    setShowCcSuggestions(false);
  };

  const scheduleFollowUps = async (email: Email) => {
    if (email.category !== "SALES") return;
    // Check if follow-ups already exist for this email
    const { data: existing } = await supabase
      .from("follow_ups")
      .select("id")
      .eq("email_id", email.id)
      .limit(1);
    if (existing && existing.length > 0) return;

    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDays = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    await supabase.from("follow_ups").insert([
      {
        email_id: email.id,
        client_email: email.from_email,
        client_name: email.from_name,
        subject: email.subject,
        follow_up_number: 1,
        scheduled_for: sevenDays,
        sent: false,
        cancelled: false,
      },
      {
        email_id: email.id,
        client_email: email.from_email,
        client_name: email.from_name,
        subject: email.subject,
        follow_up_number: 2,
        scheduled_for: fourteenDays,
        sent: false,
        cancelled: false,
      },
    ] as any);
  };

  const doSendDraft = async (email: Email) => {
    if (!email.from_email || !email.draft_response) return;
    setSending(email.id);
    try {
      // Use editor content if editing this email, otherwise fall back to DB value
      const draftContent = (editDraftId === email.id && editRef.current)
        ? editRef.current.innerHTML
        : email.draft_response;
      await sendEmailViaWebhook({
        to_email: email.from_email,
        subject: `Re: ${email.subject || ""}`,
        draft: stripN8nFooter(draftContent),
        gmail_id: email.gmail_id || undefined,
        email_id: email.id,
        attachments: [],
        original_draft: email.draft_response || undefined,
      });
      await updateEmail.mutateAsync({ id: email.id, status: "approved_sent" as any });
      await scheduleFollowUps(email);
      toast.success("Email sent");
    } catch {
      toast.error("Failed to send");
    }
    setSending(null);
  };

  const handleSendDraft = (email: Email) => {
    setConfirmSend({ action: () => doSendDraft(email) });
  };

  const doSendEdited = async (email: Email, toEmail: string, subject: string, gmailId?: string) => {
    const html = stripN8nFooter(editRef.current?.innerHTML || editDraftText);
    setSending(email.id);
    try {
      await sendEmailViaWebhook({
        to_email: toEmail,
        subject: `Re: ${subject || ""}`,
        draft: html,
        gmail_id: gmailId || undefined,
        email_id: email.id,
        attachments: editAttachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })),
        original_draft: email.draft_response || undefined,
      });
      await updateEmail.mutateAsync({ id: email.id, status: "approved_sent" as any, draft_response: html });
      await scheduleFollowUps(email);
      toast.success("Email sent");
      setEditDraftId(null);
      setEditAttachments([]);
    } catch {
      toast.error("Failed to send");
    }
    setSending(null);
  };

  const handleSendEdited = (email: Email, toEmail: string, subject: string, gmailId?: string) => {
    setConfirmSend({ action: () => doSendEdited(email, toEmail, subject, gmailId) });
  };

  const pendingDismissals = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleDismiss = (id: string) => {
    updateEmail.mutate({ id, status: "pending_dismiss" as any });
    const timeoutId = setTimeout(async () => {
      pendingDismissals.current.delete(id);
      try {
        await updateEmail.mutateAsync({ id, status: "resolved" as any, resolved_at: new Date().toISOString() });
      } catch {}
    }, 8000);
    pendingDismissals.current.set(id, timeoutId);
    toast("Email dismissed", {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => {
          const tid = pendingDismissals.current.get(id);
          if (tid) { clearTimeout(tid); pendingDismissals.current.delete(id); }
          updateEmail.mutate({ id, status: "needs_response" as any });
          toast.success("Email restored");
        },
      },
    });
  };

  React.useEffect(() => {
    return () => {
      pendingDismissals.current.forEach(async (tid, id) => {
        clearTimeout(tid);
        try { await updateEmail.mutateAsync({ id, status: "resolved" as any, resolved_at: new Date().toISOString() }); } catch {}
      });
      pendingDismissals.current.clear();
    };
  }, []);

  const handleFeedbackSubmit = async () => {
    if (!feedbackEmailId || !feedbackType) return;
    await createFeedback.mutateAsync({ email_id: feedbackEmailId, feedback_type: feedbackType, notes: feedbackNotes || undefined });
    toast.success("Feedback submitted");
    setFeedbackEmailId(null);
    setFeedbackType("");
    setFeedbackNotes("");
  };

  const isSentEmail = (email: Email) => {
    return email.status === "approved_sent" || email.status === "auto_sent";
  };

  const openReply = (email: Email, replyAll: boolean) => {
    setComposeOpen(true);
    setComposeTo(email.from_email || "");
    setComposeCc(replyAll ? getReplyAllCc(email) : "");
    setComposeSubject(`Re: ${email.subject || ""}`);

    if (isSentEmail(email)) {
      const quotedContent = stripN8nFooter(email.draft_response || email.body || "");
      const quotedBlock = `<br><br><div style="border-left: 3px solid #ccc; padding-left: 12px; margin-top: 10px; color: #555;"><strong>On ${formatTime(email.created_at)}, you wrote:</strong><br>${quotedContent}</div>`;
      setComposeBody(SIGNATURE + quotedBlock);
    } else {
      setComposeBody(stripN8nFooter(email.draft_response || ""));
    }
    setComposeEmailRef(email);
  };

  const handleComposeSend = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      toast.error("Please fill in To and Subject");
      return;
    }
    setSending("compose");
    try {
      const htmlContent = stripN8nFooter(composeBodyRef.current?.innerHTML || composeBody);
      const isNewEmail = !composeEmailRef?.gmail_id;

      const payload: any = {
        to_email: composeTo,
        subject: composeSubject,
        draft: htmlContent,
        cc: composeCc || undefined,
        attachments: composeAttachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })),
      };

      if (isNewEmail) {
        payload.action = "send_new";
        if (composeEmailRef?.id) payload.email_id = composeEmailRef.id;
      } else {
        payload.gmail_id = composeEmailRef?.gmail_id;
        payload.email_id = composeEmailRef?.id;
      }

      const WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/email-actions";
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isNewEmail ? "send_new" : "send_email",
          ...payload,
        }),
      });
      if (!response.ok) throw new Error("Failed to send email");

      toast.success("Email sent");
      setComposeOpen(false);
      setComposeTo("");
      setComposeCc("");
      setComposeSubject("");
      setComposeBody("");
      setComposeEmailRef(null);
      setComposeAttachments([]);
    } catch (err) {
      console.error("Compose send error:", err);
      toast.error("Failed to send");
    }
    setSending(null);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "MMM d, h:mm a");
  };

  const parseAttachments = (att: any): any[] => {
    if (!att) return [];
    if (Array.isArray(att)) return att;
    if (typeof att === "string") {
      try { const parsed = JSON.parse(att); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [];
  };

  const renderReplyButtons = (email: Email) => (
    <>
      <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { openReply(email, false); setDetailEmail(null); }}>
        <Mail size={12} /> Reply
      </Button>
      <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { openReply(email, true); setDetailEmail(null); }}>
        <Users size={12} /> Reply All
      </Button>
      <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs text-muted-foreground" onClick={() => { handleDismiss(email.id); setDetailEmail(null); }}>
        <X size={12} /> Dismiss
      </Button>
    </>
  );

  const renderEmailCard = (email: Email, showActions: boolean) => {
    return (
      <div key={email.id} className="floating-card mb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailEmail(email)}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm font-sans truncate">{email.from_name || email.from_email}</span>
              {email.category && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.UNKNOWN}`}>
                  {email.category}
                </span>
              )}
              {email.tier === "TIER_3" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-sans font-medium">
                  Holding Sent
                </span>
              )}
              {email.status === "auto_sent" && <Check size={14} className="text-success shrink-0" />}
              {email.status === "approved_sent" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-sans font-medium">Sent</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-sans truncate flex-1">{email.subject}</span>
              {email.incoming_summary && (
                <span className="shrink-0 text-[12px] font-sans font-medium rounded-full px-2.5 py-0.5 max-w-[50%]" style={{ backgroundColor: '#DBEAFE', color: '#1E40AF', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden', whiteSpace: 'normal' }}>
                  {email.incoming_summary}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-sans mt-0.5 flex items-center gap-1.5">
              <span>{formatTime(email.created_at)}</span>
              {(() => { const atts = parseAttachments(email.attachments); return atts.length > 0 ? (
                <span className="inline-flex items-center gap-0.5 bg-destructive text-destructive-foreground text-[11px] font-bold rounded-full px-1.5 py-0.5 leading-none"><Paperclip size={10} className="text-destructive-foreground" /> {atts.length}</span>
              ) : null; })()}
            </div>
          </div>
        </div>

        {showActions && email.draft_response && (
          <div
            className="mt-2 text-xs font-sans line-clamp-2 bg-muted/30 rounded-lg p-2 email-html-content max-w-none"
            dangerouslySetInnerHTML={{ __html: stripN8nFooter(email.draft_response) }}
          />
        )}


        {showActions && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button size="sm" className="rounded-xl gap-1 text-xs" onClick={() => handleSendDraft(email)} disabled={sending === email.id || !email.draft_response}>
              <Send size={12} /> Send
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { setEditDraftId(email.id); setEditDraftText(stripN8nFooter(email.draft_response || "")); }}>
              <Edit size={12} /> Edit & Send
            </Button>
            {renderReplyButtons(email)}
            <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs text-muted-foreground" onClick={() => { setFeedbackEmailId(email.id); }}>
              <ThumbsDown size={12} />
            </Button>
          </div>
        )}

        {!showActions && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {renderReplyButtons(email)}
          </div>
        )}

        {editDraftId === email.id && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <FormattingToolbar />
            <div
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              className="text-sm font-sans rounded-xl border bg-background p-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring email-html-content max-w-none"
              dangerouslySetInnerHTML={{ __html: editDraftText }}
            />
            <AttachmentPicker files={editAttachments} onChange={setEditAttachments} />
            <div className="flex gap-2">
              <Button size="sm" className="rounded-xl text-xs" onClick={() => handleSendEdited(email, email.from_email || "", email.subject || "", email.gmail_id || undefined)} disabled={sending === email.id}>
                <Send size={12} /> Send Edited
              </Button>
              <Button size="sm" variant="ghost" className="rounded-xl text-xs" onClick={() => { setEditDraftId(null); setEditAttachments([]); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  let emails = tab === "action" ? actionEmails : tab === "auto" ? autoEmails : allEmails;
  if (tab === "action" && actionCategoryFilter && actionCategoryFilter !== "all") {
    emails = emails.filter(e => e.category === actionCategoryFilter.toUpperCase());
  }
  if (tab === "all" && categoryFilter === "SENT") {
    emails = emails.filter(e => e.status === "approved_sent");
  }

  const loading = loadingAction;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[1200px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-2xl font-serif font-normal">Inbox</h1>
        <div className="flex items-center gap-2">
          {showFollowUps ? (
            <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setShowFollowUps(false)}>
              ← Back to Inbox
            </Button>
          ) : (
            <>
              <button onClick={() => setShowFollowUps(true)} className="text-xs text-muted-foreground hover:text-foreground font-sans underline">
                View scheduled follow-ups
              </button>
              <Button size="sm" className="rounded-xl gap-1 min-h-[44px]" onClick={() => { setComposeOpen(true); setComposeEmailRef(null); setComposeBody(SIGNATURE); }}>
                <Plus size={14} /> Compose
              </Button>
            </>
          )}
        </div>
      </div>

      {showFollowUps ? (
        <div className="floating-card">
          <h2 className="text-lg font-serif mb-4">Scheduled Follow-ups</h2>
          {followUps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No follow-ups scheduled.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl">
              <table className="w-full text-sm font-sans min-w-[500px]">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left p-3 font-medium text-muted-foreground">Client</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Subject</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Scheduled</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {followUps.map(fu => (
                    <tr key={fu.id} className="border-b last:border-b-0">
                      <td className="p-3">{fu.client_name || fu.client_email}</td>
                      <td className="p-3">{fu.subject}</td>
                      <td className="p-3">{fu.scheduled_for ? format(new Date(fu.scheduled_for), "MMM d, yyyy") : "—"}</td>
                      <td className="p-3">{fu.follow_up_number}</td>
                      <td className="p-3">
                        <Badge variant="secondary" className={`text-xs ${fu.cancelled ? "bg-red-100 text-red-700" : fu.sent ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          {fu.cancelled ? "Cancelled" : fu.sent ? "Sent" : "Pending"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit overflow-x-auto">
            {[
              { key: "action" as Tab, label: "Action Needed", count: actionEmails.length },
              { key: "auto" as Tab, label: "Auto-Handled", count: todayAutoCount },
              { key: "all" as Tab, label: "All" },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 rounded-lg text-sm font-sans font-medium transition-colors min-h-[44px] whitespace-nowrap ${
                  tab === t.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className="ml-1.5 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {tab === "action" && (
            <div className="flex gap-1">
              {["all", "sales", "support"].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActionCategoryFilter(cat)}
                  className={`px-3 py-2 rounded-lg text-xs font-sans font-medium transition-colors min-h-[44px] ${
                    actionCategoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat === "all" ? "All" : cat === "sales" ? "Sales" : "Support"}
                </button>
              ))}
            </div>
          )}

          {tab === "all" && (
            <div className="flex gap-2">
              <Select value={categoryFilter || "all"} onValueChange={(v) => setCategoryFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="w-40 rounded-xl h-8 text-xs">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="SALES">Sales</SelectItem>
                  <SelectItem value="SUPPORT">Support</SelectItem>
                  <SelectItem value="SENT">Sent</SelectItem>
                  <SelectItem value="SPAM">Spam</SelectItem>
                  <SelectItem value="ORDER_UPDATE">Order Update</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {tab === "auto" && todayAutoCount > 0 && (
            <div className="text-xs font-sans text-muted-foreground">
              <span className="bg-success/10 text-success px-2 py-1 rounded-full font-medium">{todayAutoCount} auto-handled today</span>
            </div>
          )}

          {loading ? (
            <div className="text-muted-foreground text-sm">Loading...</div>
          ) : emails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail size={32} className="mx-auto mb-2 opacity-50" />
              <p className="font-sans text-sm">{tab === "action" ? "All caught up! No emails need attention." : "No emails found."}</p>
            </div>
          ) : (
            emails.map(e => renderEmailCard(e, tab === "action"))
          )}
        </>
      )}

      {/* Email Detail Sheet */}
      <Sheet open={!!detailEmail} onOpenChange={() => setDetailEmail(null)}>
        <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0 flex flex-col h-full">
          {detailEmail && (
            <>
              <SheetHeader className="p-6 pb-4 border-b shrink-0">
                <SheetTitle className="font-serif text-lg">{detailEmail.subject}</SheetTitle>
                <div className="flex items-center gap-2 text-sm text-muted-foreground font-sans">
                  <span>{detailEmail.from_name}</span>
                  <span>&lt;{detailEmail.from_email}&gt;</span>
                  <span>•</span>
                  <span>{formatTime(detailEmail.created_at)}</span>
                </div>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Client info */}
                {(() => {
                  const client = clients.find(c => c.email === detailEmail.from_email);
                  if (!client) return null;
                  return (
                    <div className="bg-muted/30 rounded-xl p-3 text-sm font-sans">
                      <span className="font-medium">{client.company}</span>
                      {client.phone && <span className="ml-3 text-muted-foreground">{client.phone}</span>}
                      <button onClick={() => { setDetailEmail(null); navigate(`/clients/${client.id}`); }} className="ml-3 text-primary text-xs underline">View Client</button>
                    </div>
                  );
                })()}

                {/* Summary of incoming email */}
                {detailEmail.incoming_summary && (
                  <div className="text-sm font-sans font-medium rounded-lg px-3 py-2" style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}>
                    💬 {detailEmail.incoming_summary}
                  </div>
                )}

                {/* Attachments */}
                {(() => {
                  const atts = parseAttachments(detailEmail.attachments);
                  if (atts.length === 0) return null;
                  return (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">Attachments</span>
                      <div className="flex flex-wrap gap-2">
                        {atts.map((att: any, i: number) => {
                          const url = `https://bottlesandprint.app.n8n.cloud/webhook/download-attachment?messageId=${encodeURIComponent(detailEmail.gmail_id || "")}&filename=${encodeURIComponent(att.name || "")}`;
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
                  );
                })()}

                {/* Draft response */}
                {detailEmail.draft_response && (() => {
                  const cleaned = stripN8nFooter(detailEmail.draft_response);
                  const { draftPart, quotedPart } = splitDraftAtHr(cleaned);
                  return (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">Draft Response</span>
                      {editDraftId === detailEmail.id ? (
                        <>
                          <FormattingToolbar />
                          <div ref={editRef} contentEditable suppressContentEditableWarning
                            className="text-sm font-sans rounded-xl border bg-background p-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring email-html-content max-w-none"
                            dangerouslySetInnerHTML={{ __html: editDraftText }} />
                        </>
                      ) : (
                        <div className="bg-muted/30 rounded-xl p-4 text-sm font-sans email-html-content max-w-none" dangerouslySetInnerHTML={{ __html: draftPart }} />
                      )}
                      {quotedPart && (
                        <Accordion type="single" collapsible className="w-full mt-3">
                          <AccordionItem value="quoted-email" className="border rounded-xl">
                            <AccordionTrigger className="px-4 py-3 text-xs font-medium text-muted-foreground font-sans hover:no-underline">Original Email</AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="text-sm font-sans email-html-content max-w-none"
                                style={{ borderLeft: '3px solid #ccc', paddingLeft: '12px', marginTop: '10px', color: '#555' }}
                                dangerouslySetInnerHTML={{ __html: quotedPart }} />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </div>
                  );
                })()}

                {/* Original email body — render as HTML */}
                {detailEmail.body && (() => {
                  const cleaned = stripN8nFooter(detailEmail.draft_response || "");
                  const hasQuotedInDraft = cleaned ? splitDraftAtHr(cleaned).quotedPart !== null : false;
                  if (hasQuotedInDraft) return null;
                  return (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="original-email" className="border rounded-xl">
                        <AccordionTrigger className="px-4 py-3 text-xs font-medium text-muted-foreground font-sans hover:no-underline">Original Email</AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="text-sm font-sans email-html-content max-w-none"
                            style={{ borderLeft: '3px solid #ccc', paddingLeft: '12px', marginTop: '10px', color: '#555' }}
                            dangerouslySetInnerHTML={{ __html: formatEmailBodyAsHtml(stripN8nFooter(detailEmail.body)) }} />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                })()}
              </div>

              {/* Sticky action buttons */}
              <div className="border-t p-4 flex items-center gap-2 flex-wrap bg-background shrink-0">
                {(detailEmail.status === "needs_response" || detailEmail.status === "pending") && (
                  <>
                    <Button size="sm" className="rounded-xl gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleSendDraft(detailEmail)} disabled={sending === detailEmail.id || !detailEmail.draft_response}>
                      <Send size={12} /> Send
                    </Button>
                    {editDraftId === detailEmail.id ? (
                      <>
                        <Button size="sm" className="rounded-xl gap-1 text-xs" onClick={() => handleSendEdited(detailEmail, detailEmail.from_email || "", detailEmail.subject || "", detailEmail.gmail_id || undefined)} disabled={sending === detailEmail.id}>
                          <Send size={12} /> Send Edited
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-xl text-xs" onClick={() => { setEditDraftId(null); setEditAttachments([]); }}>Cancel</Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs"
                        onClick={() => { setEditDraftId(detailEmail.id); setEditDraftText(stripN8nFooter(detailEmail.draft_response || "")); }}>
                        <Edit size={12} /> Edit & Send
                      </Button>
                    )}
                  </>
                )}
                {renderReplyButtons(detailEmail)}
                {(detailEmail.status === "needs_response" || detailEmail.status === "pending") && (
                  <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs text-muted-foreground"
                    onClick={() => { setFeedbackEmailId(detailEmail.id); setDetailEmail(null); }}>
                    <ThumbsDown size={12} />
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Send Confirmation Dialog */}
      <Dialog open={!!confirmSend} onOpenChange={() => setConfirmSend(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Confirm Send</DialogTitle>
            <DialogDescription className="text-sm font-sans">Are you sure you want to send this email?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setConfirmSend(null)}>Cancel</Button>
            <Button className="rounded-xl gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={async () => {
              if (confirmSend) { await confirmSend.action(); setConfirmSend(null); }
            }}>
              <Send size={14} /> Yes, Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
      <Dialog open={!!feedbackEmailId} onOpenChange={() => setFeedbackEmailId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-serif">Triage Feedback</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={feedbackType} onValueChange={setFeedbackType}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="What went wrong?" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="wrong_category">Wrong category</SelectItem>
                <SelectItem value="wrong_template">Wrong template</SelectItem>
                <SelectItem value="should_not_reply">Should not have replied</SelectItem>
                <SelectItem value="should_ask_me">Should have asked me</SelectItem>
                <SelectItem value="wrong_tone">Wrong tone</SelectItem>
              </SelectContent>
            </Select>
            <Textarea placeholder="Additional notes..." value={feedbackNotes} onChange={e => setFeedbackNotes(e.target.value)} className="rounded-xl" />
          </div>
          <DialogFooter>
            <Button size="sm" className="rounded-xl" onClick={handleFeedbackSubmit}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-xl" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-serif">Compose Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
            <div className="relative">
              <div className="flex items-center justify-between">
                <label className="text-xs font-sans text-muted-foreground">To</label>
                <button onClick={() => { setContactsOpen(true); }} className="text-[10px] font-sans text-primary hover:underline flex items-center gap-0.5">
                  <BookUser size={10} /> Manage Contacts
                </button>
              </div>
              <Input value={composeTo} onChange={e => handleToChange(e.target.value)} onBlur={() => setTimeout(() => setShowToSuggestions(false), 200)} placeholder="email@example.com" className="rounded-xl" />
              {showToSuggestions && toSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {toSuggestions.map((s, i) => (
                    <button key={i} className="w-full text-left px-3 py-2 text-sm font-sans hover:bg-muted/50 transition-colors" onMouseDown={() => selectToSuggestion(s.email)}>
                      {s.name ? <><span className="font-medium">{s.name}</span> <span className="text-muted-foreground">&lt;{s.email}&gt;</span></> : s.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <label className="text-xs font-sans text-muted-foreground">CC</label>
              <Input value={composeCc} onChange={e => handleCcChange(e.target.value)} onBlur={() => setTimeout(() => setShowCcSuggestions(false), 200)} placeholder="cc@example.com" className="rounded-xl" />
              {showCcSuggestions && ccSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {ccSuggestions.map((s, i) => (
                    <button key={i} className="w-full text-left px-3 py-2 text-sm font-sans hover:bg-muted/50 transition-colors" onMouseDown={() => selectCcSuggestion(s.email)}>
                      {s.name ? <><span className="font-medium">{s.name}</span> <span className="text-muted-foreground">&lt;{s.email}&gt;</span></> : s.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-sans text-muted-foreground">Subject</label>
              <Input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-sans text-muted-foreground">Body</label>
              <FormattingToolbar />
              <div ref={composeBodyRef} contentEditable suppressContentEditableWarning
                className="text-sm font-sans rounded-xl border bg-background p-3 min-h-[200px] max-h-[40vh] overflow-y-auto focus:outline-none focus:ring-2 focus:ring-ring email-html-content max-w-none"
                dangerouslySetInnerHTML={{ __html: composeBody }} />
            </div>
            <AttachmentPicker files={composeAttachments} onChange={setComposeAttachments} />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="ghost" onClick={() => { setComposeOpen(false); setComposeAttachments([]); }} className="rounded-xl">Cancel</Button>
            <Button className="rounded-xl gap-1" onClick={handleComposeSend} disabled={sending === "compose"}>
              <Send size={14} /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manage Contacts Dialog */}
      <Dialog open={contactsOpen} onOpenChange={setContactsOpen}>
        <DialogContent className="max-w-md" style={{ maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-serif">Manage Contacts</DialogTitle>
            <DialogDescription className="text-sm font-sans">Add or remove email contacts for autocomplete.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="flex gap-2">
              <Input placeholder="Name" value={newContactName} onChange={e => setNewContactName(e.target.value)} className="rounded-xl flex-1" />
              <Input placeholder="Email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} className="rounded-xl flex-1" />
              <Button size="sm" className="rounded-xl shrink-0" onClick={addContact} disabled={!newContactEmail.trim()}>
                <Plus size={14} />
              </Button>
            </div>
            <div className="space-y-1">
              {contacts.length === 0 && <p className="text-sm text-muted-foreground font-sans">No contacts yet.</p>}
              {contacts.map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/30 text-sm font-sans">
                  <div>
                    {c.name && <span className="font-medium mr-2">{c.name}</span>}
                    <span className="text-muted-foreground">{c.email}</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteContact(c.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
