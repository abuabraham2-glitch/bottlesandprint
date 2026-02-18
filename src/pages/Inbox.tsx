import React, { useState, useRef, useCallback } from "react";
import { useActionNeededEmails, useAutoHandledEmails, useAllEmails, useUpdateEmail, useCreateTriageFeedback, sendEmailViaWebhook, useFollowUps, Email } from "@/lib/emailData";
import { useClients } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Edit, MessageSquare, X, ThumbsDown, Check, ChevronDown, ChevronUp, Mail, Clock, Plus, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const CATEGORY_COLORS: Record<string, string> = {
  SALES: "bg-emerald-100 text-emerald-700",
  SUPPORT: "bg-blue-100 text-blue-700",
  SPAM: "bg-red-100 text-red-700",
  ORDER_UPDATE: "bg-purple-100 text-purple-700",
  UNKNOWN: "bg-muted text-muted-foreground",
};

const EMAIL_TEMPLATES: Record<string, string> = {
  Quote: "Thank you for your inquiry. Here is the quote for your order:\n\n",
  "Need Info": "Thank you for reaching out. We need a bit more information to proceed:\n\n",
  "Proof Ready": "Your proof is ready for review. Please take a look and let us know if any changes are needed.\n\n",
  "Order Complete": "Just wanted to let you know that your order is complete.\n\n",
  "Payment Received": "We've received your payment — thank you!\n\n",
  "Follow-up": "Just following up on our previous conversation. Please let us know if you have any questions.\n\n",
  "ACH Info": "Here are our ACH details:\n\nBank: Thread Bank\nAccount Name: Container and Deco Solutions\nAccount #: 200000014846\nRouting #: 064209588\n\n",
  Custom: "",
};

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
  const [composeTemplate, setComposeTemplate] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [detailEmail, setDetailEmail] = useState<Email | null>(null);
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [confirmSend, setConfirmSend] = useState<{ action: () => Promise<void> } | null>(null);
  const editRef = useRef<HTMLDivElement>(null);

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

  const doSendDraft = async (email: Email) => {
    if (!email.from_email || !email.draft_response) return;
    setSending(email.id);
    try {
      await sendEmailViaWebhook({
        to_email: email.from_email,
        subject: `Re: ${email.subject || ""}`,
        body_html: email.draft_response,
      });
      await updateEmail.mutateAsync({ id: email.id, status: "approved_sent" as any });
      toast.success("Email sent");
    } catch {
      toast.error("Failed to send");
    }
    setSending(null);
  };

  const handleSendDraft = (email: Email) => {
    setConfirmSend({ action: () => doSendDraft(email) });
  };

  const doSendEdited = async (emailId: string, toEmail: string, subject: string) => {
    const html = editRef.current?.innerHTML || editDraftText;
    setSending(emailId);
    try {
      await sendEmailViaWebhook({
        to_email: toEmail,
        subject: `Re: ${subject || ""}`,
        body_html: html,
      });
      await updateEmail.mutateAsync({ id: emailId, status: "approved_sent" as any, draft_response: html });
      toast.success("Email sent");
      setEditDraftId(null);
    } catch {
      toast.error("Failed to send");
    }
    setSending(null);
  };

  const handleSendEdited = (emailId: string, toEmail: string, subject: string) => {
    setConfirmSend({ action: () => doSendEdited(emailId, toEmail, subject) });
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
          if (tid) {
            clearTimeout(tid);
            pendingDismissals.current.delete(id);
          }
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
        try {
          await updateEmail.mutateAsync({ id, status: "resolved" as any, resolved_at: new Date().toISOString() });
        } catch {}
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

  const handleComposeSend = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) {
      toast.error("Please fill in To and Subject");
      return;
    }
    setSending("compose");
    try {
      await sendEmailViaWebhook({
        to_email: composeTo,
        subject: composeSubject,
        body_html: composeBody,
        cc: composeCc || undefined,
      });
      toast.success("Email sent");
      setComposeOpen(false);
      setComposeTo("");
      setComposeCc("");
      setComposeSubject("");
      setComposeBody("");
    } catch {
      toast.error("Failed to send");
    }
    setSending(null);
  };

  const clientSuggestions = (query: string) => {
    if (!query) return [];
    const q = query.toLowerCase();
    return clients.filter(c =>
      c.company.toLowerCase().includes(q) ||
      c.contact_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    ).slice(0, 5);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    return format(new Date(dateStr), "MMM d, h:mm a");
  };

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
              {email.status === "auto_sent" && (
                <Check size={14} className="text-success shrink-0" />
              )}
              {email.status === "approved_sent" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-sans font-medium">
                  Sent
                </span>
              )}
            </div>
            <div className="text-sm font-sans truncate">{email.subject}</div>
            <div className="text-xs text-muted-foreground font-sans mt-0.5 flex items-center gap-1.5">
              <span>{formatTime(email.created_at)}</span>
              {Array.isArray(email.attachments) && (email.attachments as any[]).length > 0 && (
                <span className="inline-flex items-center gap-0.5">📎 {(email.attachments as any[]).length}</span>
              )}
            </div>
          </div>
        </div>

        {showActions && email.draft_response && (
          <div
            className="mt-2 text-xs font-sans line-clamp-2 bg-muted/30 rounded-lg p-2 email-html-content max-w-none"
            dangerouslySetInnerHTML={{ __html: email.draft_response }}
          />
        )}

        {showActions && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button size="sm" className="rounded-xl gap-1 text-xs" onClick={() => handleSendDraft(email)} disabled={sending === email.id || !email.draft_response}>
              <Send size={12} /> Send
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { setEditDraftId(email.id); setEditDraftText(email.draft_response || ""); }}>
              <Edit size={12} /> Edit & Send
            </Button>
            <Button size="sm" variant="outline" className="rounded-xl gap-1 text-xs" onClick={() => { setComposeOpen(true); setComposeTo(email.from_email || ""); setComposeSubject(`Re: ${email.subject || ""}`); }}>
              <MessageSquare size={12} /> Reply Custom
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs text-muted-foreground" onClick={() => handleDismiss(email.id)}>
              <X size={12} /> Dismiss
            </Button>
            <Button size="sm" variant="ghost" className="rounded-xl gap-1 text-xs text-muted-foreground" onClick={() => { setFeedbackEmailId(email.id); }}>
              <ThumbsDown size={12} />
            </Button>
          </div>
        )}

        {/* Rich text edit inline */}
        {editDraftId === email.id && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <div
              ref={editRef}
              contentEditable
              suppressContentEditableWarning
              className="text-sm font-sans rounded-xl border bg-background p-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring email-html-content max-w-none"
              dangerouslySetInnerHTML={{ __html: editDraftText }}
            />
            <div className="flex gap-2">
              <Button size="sm" className="rounded-xl text-xs" onClick={() => handleSendEdited(email.id, email.from_email || "", email.subject || "")} disabled={sending === email.id}>
                <Send size={12} /> Send Edited
              </Button>
              <Button size="sm" variant="ghost" className="rounded-xl text-xs" onClick={() => setEditDraftId(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Apply category filter for action tab
  let emails = tab === "action" ? actionEmails : tab === "auto" ? autoEmails : allEmails;
  if (tab === "action" && actionCategoryFilter && actionCategoryFilter !== "all") {
    emails = emails.filter(e => e.category === actionCategoryFilter.toUpperCase());
  }
  // Apply "Sent" status filter in All tab
  if (tab === "all" && categoryFilter === "SENT") {
    emails = emails.filter(e => e.status === "approved_sent");
  }

  const loading = loadingAction;

  return (
    <div className="p-6 space-y-5 max-w-[1200px]">
      <div className="flex items-center justify-between">
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
              <Button size="sm" className="rounded-xl gap-1" onClick={() => setComposeOpen(true)}>
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
            <div className="overflow-hidden rounded-xl">
              <table className="w-full text-sm font-sans">
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
          {/* Sub-tabs */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
            {[
              { key: "action" as Tab, label: "Action Needed", count: actionEmails.length },
              { key: "auto" as Tab, label: "Auto-Handled", count: todayAutoCount },
              { key: "all" as Tab, label: "All" },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-sans font-medium transition-colors ${
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

          {/* Category filter for Action Needed tab */}
          {tab === "action" && (
            <div className="flex gap-1">
              {["all", "sales", "support"].map(cat => (
                <button
                  key={cat}
                  onClick={() => setActionCategoryFilter(cat)}
                  className={`px-3 py-1 rounded-lg text-xs font-sans font-medium transition-colors ${
                    actionCategoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {cat === "all" ? "All" : cat === "sales" ? "Sales" : "Support"}
                </button>
              ))}
            </div>
          )}

          {/* Category filter for All tab */}
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

          {/* Auto-handled badge */}
          {tab === "auto" && todayAutoCount > 0 && (
            <div className="text-xs font-sans text-muted-foreground">
              <span className="bg-success/10 text-success px-2 py-1 rounded-full font-medium">{todayAutoCount} auto-handled today</span>
            </div>
          )}

          {/* Email list */}
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

                {/* Attachments */}
                {Array.isArray(detailEmail.attachments) && detailEmail.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {detailEmail.attachments.map((att: any, i: number) => {
                      const sizeStr = att.size ? (att.size < 1024 ? `${att.size} B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(0)} KB` : `${(att.size / 1048576).toFixed(1)} MB`) : "";
                      const url = `https://bottlesandprint.app.n8n.cloud/webhook/download-attachment?messageId=${encodeURIComponent(detailEmail.gmail_id || "")}&filename=${encodeURIComponent(att.name || "")}`;
                      return (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 hover:bg-muted text-xs font-sans font-medium text-foreground transition-colors border"
                        >
                          <Paperclip size={12} className="text-muted-foreground" />
                          <span className="truncate max-w-[160px]">{att.name}</span>
                          {sizeStr && <span className="text-muted-foreground">({sizeStr})</span>}
                        </a>
                      );
                    })}
                  </div>
                )}

                {/* Draft response first */}
                {detailEmail.draft_response && (() => {
                  const { draftPart, quotedPart } = splitDraftAtHr(detailEmail.draft_response);

                  return (
                    <div>
                      <span className="text-xs font-medium text-muted-foreground font-sans block mb-1">Draft Response</span>
                      {editDraftId === detailEmail.id ? (
                        <div
                          ref={editRef}
                          contentEditable
                          suppressContentEditableWarning
                          className="text-sm font-sans rounded-xl border bg-background p-3 min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring email-html-content max-w-none"
                          dangerouslySetInnerHTML={{ __html: editDraftText }}
                        />
                      ) : (
                        <div
                          className="bg-muted/30 rounded-xl p-4 text-sm font-sans email-html-content max-w-none"
                          dangerouslySetInnerHTML={{ __html: draftPart }}
                        />
                      )}

                      {/* Quoted/original content from draft_response after <hr> — only ONE accordion */}
                      {quotedPart && (
                        <Accordion type="single" collapsible className="w-full mt-3">
                          <AccordionItem value="quoted-email" className="border rounded-xl">
                            <AccordionTrigger className="px-4 py-3 text-xs font-medium text-muted-foreground font-sans hover:no-underline">
                              Original Email
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div
                                className="text-sm font-sans email-html-content max-w-none"
                                style={{ color: '#000000' }}
                                dangerouslySetInnerHTML={{ __html: quotedPart }}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </div>
                  );
                })()}

                {/* Original email body — only show if there's NO quoted content from draft_response */}
                {detailEmail.body && (() => {
                  const hasQuotedInDraft = detailEmail.draft_response ? splitDraftAtHr(detailEmail.draft_response).quotedPart !== null : false;
                  if (hasQuotedInDraft) return null;
                  return (
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value="original-email" className="border rounded-xl">
                        <AccordionTrigger className="px-4 py-3 text-xs font-medium text-muted-foreground font-sans hover:no-underline">
                          Original Email
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div
                            className="text-sm font-sans email-html-content max-w-none"
                            dangerouslySetInnerHTML={{ __html: detailEmail.body }}
                          />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                })()}
              </div>

              {/* Sticky action buttons */}
              <div className="border-t p-4 flex items-center gap-2 flex-wrap bg-background shrink-0">
                {detailEmail.status === "needs_response" || detailEmail.status === "pending" ? (
                  <>
                    <Button
                      size="sm"
                      className="rounded-xl gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                      onClick={() => handleSendDraft(detailEmail)}
                      disabled={sending === detailEmail.id || !detailEmail.draft_response}
                    >
                      <Send size={12} /> Send
                    </Button>
                    {editDraftId === detailEmail.id ? (
                      <>
                        <Button size="sm" className="rounded-xl gap-1 text-xs" onClick={() => handleSendEdited(detailEmail.id, detailEmail.from_email || "", detailEmail.subject || "")} disabled={sending === detailEmail.id}>
                          <Send size={12} /> Send Edited
                        </Button>
                        <Button size="sm" variant="ghost" className="rounded-xl text-xs" onClick={() => setEditDraftId(null)}>Cancel</Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl gap-1 text-xs"
                        onClick={() => { setEditDraftId(detailEmail.id); setEditDraftText(detailEmail.draft_response || ""); }}
                      >
                        <Edit size={12} /> Edit & Send
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl gap-1 text-xs"
                      onClick={() => {
                        setComposeOpen(true);
                        setComposeTo(detailEmail.from_email || "");
                        setComposeSubject(`Re: ${detailEmail.subject || ""}`);
                        setDetailEmail(null);
                      }}
                    >
                      <MessageSquare size={12} /> Reply Custom
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl gap-1 text-xs text-muted-foreground"
                      onClick={() => { handleDismiss(detailEmail.id); setDetailEmail(null); }}
                    >
                      <X size={12} /> Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-xl gap-1 text-xs text-muted-foreground"
                      onClick={() => { setFeedbackEmailId(detailEmail.id); setDetailEmail(null); }}
                    >
                      <ThumbsDown size={12} />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl gap-1 text-xs"
                    onClick={() => setDetailEmail(null)}
                  >
                    Close
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
            <DialogDescription className="text-sm font-sans">
              Are you sure you want to send this email?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setConfirmSend(null)}>Cancel</Button>
            <Button className="rounded-xl gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={async () => {
              if (confirmSend) {
                await confirmSend.action();
                setConfirmSend(null);
              }
            }}>
              <Send size={14} /> Yes, Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
      <Dialog open={!!feedbackEmailId} onOpenChange={() => setFeedbackEmailId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Triage Feedback</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={feedbackType} onValueChange={setFeedbackType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="What went wrong?" />
              </SelectTrigger>
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
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-serif">Compose Email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-sans text-muted-foreground">To</label>
              <Input value={composeTo} onChange={e => setComposeTo(e.target.value)} placeholder="email@example.com" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-sans text-muted-foreground">CC</label>
              <Input value={composeCc} onChange={e => setComposeCc(e.target.value)} placeholder="cc@example.com" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-sans text-muted-foreground">Subject</label>
              <Input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs font-sans text-muted-foreground">Template</label>
              <Select value={composeTemplate} onValueChange={(val) => {
                setComposeTemplate(val);
                if (EMAIL_TEMPLATES[val] !== undefined) {
                  setComposeBody(EMAIL_TEMPLATES[val]);
                }
              }}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choose template..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.keys(EMAIL_TEMPLATES).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-sans text-muted-foreground">Body</label>
              <Textarea value={composeBody} onChange={e => setComposeBody(e.target.value)} rows={8} className="rounded-xl font-sans text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setComposeOpen(false)} className="rounded-xl">Cancel</Button>
            <Button className="rounded-xl gap-1" onClick={handleComposeSend} disabled={sending === "compose"}>
              <Send size={14} /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
