import React, { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAllEmails, useUpdateEmail, useCreateTriageFeedback, sendEmailViaWebhook, useFollowUps, Email } from "@/lib/emailData";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Send, Mail, Clock, Plus, Paperclip, BookUser, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { ThreadView } from "@/components/inbox/ThreadView";
import { DraftEditor } from "@/components/inbox/DraftEditor";
import {
  CATEGORY_COLORS, STATUS_COLORS, formatTime, formatAge, parseAttachments,
  parseMultiTopicCount, stripN8nFooter, getReplyAllCc, SIGNATURE,
} from "@/components/inbox/InboxHelpers";

type MainTab = "inbox" | "drafts";
type InboxFilter = "all" | "sales" | "support" | "pending" | "resolved";

export default function Inbox() {
  const [mainTab, setMainTab] = useState<MainTab>("inbox");
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [threadEmail, setThreadEmail] = useState<Email | null>(null);
  const [draftEmail, setDraftEmail] = useState<Email | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeEmailRef, setComposeEmailRef] = useState<Email | null>(null);
  const [composeAttachments, setComposeAttachments] = useState<AttachedFile[]>([]);
  const [sending, setSending] = useState<string | null>(null);
  const [feedbackEmailId, setFeedbackEmailId] = useState<string | null>(null);
  const [feedbackType, setFeedbackType] = useState("");
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [confirmSend, setConfirmSend] = useState<{ action: () => Promise<void> } | null>(null);
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [toSuggestions, setToSuggestions] = useState<{email: string; name?: string}[]>([]);
  const [ccSuggestions, setCcSuggestions] = useState<{email: string; name?: string}[]>([]);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [showCcSuggestions, setShowCcSuggestions] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState<{id: string; email: string; name: string | null}[]>([]);
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const composeBodyRef = useRef<HTMLDivElement>(null);

  const { data: allEmails = [], isLoading } = useAllEmails();
  const { data: followUps = [] } = useFollowUps();
  const updateEmail = useUpdateEmail();
  const createFeedback = useCreateTriageFeedback();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Filtered lists
  const inboxEmails = React.useMemo(() => {
    let filtered = allEmails;
    switch (inboxFilter) {
      case "sales": filtered = filtered.filter(e => e.category === "SALES"); break;
      case "support": filtered = filtered.filter(e => e.category === "SUPPORT"); break;
      case "pending": filtered = filtered.filter(e => e.status === "pending" || e.status === "needs_response"); break;
      case "resolved": filtered = filtered.filter(e => e.status === "resolved"); break;
    }
    return filtered;
  }, [allEmails, inboxFilter]);

  const draftEmails = React.useMemo(() =>
    allEmails.filter(e => e.draft_response && (e.status === "needs_response" || e.status === "pending")),
    [allEmails]
  );

  // Contacts
  const loadContacts = useCallback(async () => {
    const { data } = await supabase.from("contacts").select("id, email, name").order("created_at", { ascending: false });
    if (data) setContacts(data as any);
  }, []);
  useEffect(() => { loadContacts(); }, [loadContacts]);

  const addContact = async () => {
    if (!newContactEmail.trim()) return;
    await supabase.from("contacts").insert({ email: newContactEmail.trim(), name: newContactName.trim() || null } as any);
    setNewContactEmail(""); setNewContactName(""); loadContacts(); toast.success("Contact added");
  };
  const deleteContact = async (id: string) => { await supabase.from("contacts").delete().eq("id", id); loadContacts(); toast.success("Contact removed"); };

  // Email + contacts autocomplete
  const searchEmailsAndContacts = useCallback(async (query: string) => {
    if (query.length < 2) return [];
    const [emailRes, contactRes] = await Promise.all([
      supabase.from("emails").select("from_email, from_name").ilike("from_email", `%${query}%`).limit(10),
      supabase.from("contacts").select("email, name").or(`email.ilike.%${query}%,name.ilike.%${query}%`).limit(10),
    ]);
    const seen = new Set<string>(); const results: {email: string; name?: string}[] = [];
    (contactRes.data || []).forEach((c: any) => { if (c.email && !seen.has(c.email.toLowerCase())) { seen.add(c.email.toLowerCase()); results.push({ email: c.email, name: c.name || undefined }); } });
    (emailRes.data || []).forEach((e: any) => { if (e.from_email && !seen.has(e.from_email.toLowerCase())) { seen.add(e.from_email.toLowerCase()); results.push({ email: e.from_email, name: e.from_name || undefined }); } });
    return results.slice(0, 8);
  }, []);

  const handleToChange = async (value: string) => {
    setComposeTo(value);
    if (value.length >= 2) { const s = await searchEmailsAndContacts(value); setToSuggestions(s); setShowToSuggestions(s.length > 0); }
    else setShowToSuggestions(false);
  };
  const handleCcChange = async (value: string) => {
    setComposeCc(value);
    const lastPart = value.split(",").pop()?.trim() || "";
    if (lastPart.length >= 2) { const s = await searchEmailsAndContacts(lastPart); setCcSuggestions(s); setShowCcSuggestions(s.length > 0); }
    else setShowCcSuggestions(false);
  };
  const selectToSuggestion = (email: string) => { setComposeTo(email); setShowToSuggestions(false); };
  const selectCcSuggestion = (email: string) => {
    const parts = composeCc.split(",").map(s => s.trim()).filter(Boolean);
    parts[parts.length - 1] = email;
    setComposeCc(parts.join(", ")); setShowCcSuggestions(false);
  };

  const isSentEmail = (email: Email) => email.status === "approved_sent" || email.status === "auto_sent";

  const openReply = (email: Email, replyAll: boolean) => {
    setComposeOpen(true); setComposeTo(email.from_email || "");
    setComposeCc(replyAll ? getReplyAllCc(email) : "");
    setComposeSubject(`Re: ${email.subject || ""}`);
    if (isSentEmail(email)) {
      const quotedContent = stripN8nFooter(email.draft_response || email.body || "");
      setComposeBody(SIGNATURE + `<br><br><div style="border-left: 3px solid #ccc; padding-left: 12px; margin-top: 10px; color: #555;"><strong>On ${format(new Date(email.created_at || ""), "MMM d, h:mm a")}, you wrote:</strong><br>${quotedContent}</div>`);
    } else {
      setComposeBody(stripN8nFooter(email.draft_response || ""));
    }
    setComposeEmailRef(email);
  };

  const pendingDismissals = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleDismiss = (id: string) => {
    updateEmail.mutate({ id, status: "pending_dismiss" as any });
    const timeoutId = setTimeout(async () => {
      pendingDismissals.current.delete(id);
      try { await updateEmail.mutateAsync({ id, status: "resolved" as any, resolved_at: new Date().toISOString() }); } catch {}
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

  useEffect(() => {
    return () => {
      pendingDismissals.current.forEach(async (tid, id) => {
        clearTimeout(tid);
        try { await updateEmail.mutateAsync({ id, status: "resolved" as any, resolved_at: new Date().toISOString() }); } catch {}
      });
      pendingDismissals.current.clear();
    };
  }, []);

  const handleComposeSend = async () => {
    if (!composeTo.trim() || !composeSubject.trim()) { toast.error("Please fill in To and Subject"); return; }
    setSending("compose");
    try {
      const htmlContent = stripN8nFooter(composeBodyRef.current?.innerHTML || composeBody);
      const isNewEmail = !composeEmailRef?.gmail_id;
      const payload: any = { to_email: composeTo, subject: composeSubject, draft: htmlContent, cc: composeCc || undefined, attachments: composeAttachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })) };
      if (isNewEmail) { payload.action = "send_new"; payload.email_id = composeEmailRef?.id || ""; }
      else { payload.gmail_id = composeEmailRef?.gmail_id; payload.email_id = composeEmailRef?.id; }
      const WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/email-actions";
      const response = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: isNewEmail ? "send_new" : "send_email", ...payload }) });
      if (!response.ok) throw new Error("Failed to send email");
      toast.success("Email sent");
      setComposeOpen(false); setComposeTo(""); setComposeCc(""); setComposeSubject(""); setComposeBody(""); setComposeEmailRef(null); setComposeAttachments([]);
    } catch (err) { console.error("Compose send error:", err); toast.error("Failed to send"); }
    setSending(null);
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackEmailId || !feedbackType) return;
    await createFeedback.mutateAsync({ email_id: feedbackEmailId, feedback_type: feedbackType, notes: feedbackNotes || undefined });
    toast.success("Feedback submitted"); setFeedbackEmailId(null); setFeedbackType(""); setFeedbackNotes("");
  };

  const navigateToEmailById = async (id: string) => {
    setThreadEmail(null); setDraftEmail(null);
    setTimeout(async () => {
      const target = allEmails.find(e => e.id === id);
      if (target) { setThreadEmail(target); return; }
      const { data } = await supabase.from("emails").select("*").eq("id", id).single();
      if (data) setThreadEmail(data as any);
    }, 100);
  };

  const handleSendDraftFromThread = (email: Email) => {
    setConfirmSend({
      action: async () => {
        if (!email.from_email || !email.draft_response) return;
        setSending(email.id);
        try {
          await sendEmailViaWebhook({
            to_email: email.from_email, subject: `Re: ${email.subject || ""}`,
            draft: stripN8nFooter(email.draft_response), gmail_id: email.gmail_id || undefined,
            email_id: email.id, attachments: [], original_draft: email.draft_response || undefined,
          });
          await updateEmail.mutateAsync({ id: email.id, status: "approved_sent" as any });
          toast.success("Email sent"); setThreadEmail(null);
        } catch { toast.error("Failed to send"); }
        setSending(null);
      }
    });
  };

  const handleEditSendFromThread = (email: Email) => {
    setThreadEmail(null);
    setTimeout(() => setDraftEmail(email), 150);
  };

  const displayedEmails = mainTab === "inbox" ? inboxEmails : draftEmails;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1200px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-2xl font-serif font-normal">Email</h1>
        <div className="flex items-center gap-2">
          {showFollowUps ? (
            <Button size="sm" variant="outline" className="rounded-xl text-xs" onClick={() => setShowFollowUps(false)}>← Back</Button>
          ) : (
            <>
              <button onClick={() => setShowFollowUps(true)} className="text-xs text-muted-foreground hover:text-foreground font-sans underline">Follow-ups</button>
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
          {/* Main tabs: INBOX | DRAFTS */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
            <button
              onClick={() => setMainTab("inbox")}
              className={`px-4 py-2 rounded-lg text-sm font-sans font-medium transition-colors min-h-[44px] whitespace-nowrap flex items-center gap-1.5 ${
                mainTab === "inbox" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail size={15} /> Inbox
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{allEmails.length}</span>
            </button>
            <button
              onClick={() => setMainTab("drafts")}
              className={`px-4 py-2 rounded-lg text-sm font-sans font-medium transition-colors min-h-[44px] whitespace-nowrap flex items-center gap-1.5 ${
                mainTab === "drafts" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText size={15} /> Drafts
              {draftEmails.length > 0 && (
                <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{draftEmails.length}</span>
              )}
            </button>
          </div>

          {/* Inbox filters */}
          {mainTab === "inbox" && (
            <div className="flex gap-1 flex-wrap">
              {(["all", "sales", "support", "pending", "resolved"] as InboxFilter[]).map(f => (
                <button key={f} onClick={() => setInboxFilter(f)}
                  className={`px-3 py-2 rounded-lg text-xs font-sans font-medium transition-colors min-h-[44px] capitalize ${
                    inboxFilter === f ? "bg-primary text-primary-foreground" : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  }`}>
                  {f}
                </button>
              ))}
            </div>
          )}

          {/* Email list */}
          {isLoading ? (
            <div className="text-muted-foreground text-sm font-sans py-8 text-center">Loading emails...</div>
          ) : displayedEmails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail size={32} className="mx-auto mb-2 opacity-50" />
              <p className="font-sans text-sm">{mainTab === "inbox" ? "No emails match this filter." : "No drafts waiting for review."}</p>
            </div>
          ) : mainTab === "inbox" ? (
            /* INBOX LIST */
            <div className="space-y-1">
              {displayedEmails.map(email => {
                const atts = parseAttachments(email.attachments);
                const topicCount = parseMultiTopicCount((email as any).multi_topic_alert);
                return (
                  <div key={email.id}
                    className="floating-card mb-0 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setThreadEmail(email)}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-medium text-sm font-sans truncate">{email.from_name || email.from_email}</span>
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
                          {topicCount && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium" style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}>
                              {topicCount} topics
                            </span>
                          )}
                          {atts.length > 0 && (
                            <span className="inline-flex items-center"><Paperclip size={12} className="text-muted-foreground" /></span>
                          )}
                        </div>
                        <div className="text-sm font-sans truncate text-muted-foreground">{email.subject}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs text-muted-foreground font-sans whitespace-nowrap">{formatTime(email.created_at)}</span>
                        {email.draft_response && (
                          <button className="text-[11px] text-primary font-sans font-medium hover:underline whitespace-nowrap"
                            onClick={(ev) => { ev.stopPropagation(); setMainTab("drafts"); setTimeout(() => setDraftEmail(email), 100); }}>
                            View Draft →
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* DRAFTS LIST */
            <div className="space-y-1">
              {displayedEmails.map(email => {
                const age = formatAge(email.created_at);
                return (
                  <div key={email.id}
                    className="floating-card mb-0 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setDraftEmail(email)}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-medium text-sm font-sans truncate">{email.from_name || email.from_email}</span>
                          {email.category && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.UNKNOWN}`}>
                              {email.category}
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-sans truncate text-muted-foreground">{email.subject}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className={`text-xs font-sans font-medium ${age.color}`}>{age.text}</span>
                        <button className="text-[11px] text-primary font-sans font-medium hover:underline whitespace-nowrap"
                          onClick={(ev) => { ev.stopPropagation(); setMainTab("inbox"); setTimeout(() => setThreadEmail(email), 100); }}>
                          View Thread ↗
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Thread View */}
      <ThreadView
        email={threadEmail}
        onClose={() => setThreadEmail(null)}
        onOpenDraft={(e) => { setMainTab("drafts"); setDraftEmail(e); }}
        onReply={openReply}
        onDismiss={handleDismiss}
        onFeedback={(id) => setFeedbackEmailId(id)}
        onNavigateToEmail={navigateToEmailById}
        sending={sending}
        onSendDraft={handleSendDraftFromThread}
        onEditSend={handleEditSendFromThread}
      />

      {/* Draft Editor */}
      <DraftEditor
        email={draftEmail}
        onClose={() => setDraftEmail(null)}
        onOpenThread={(e) => { setMainTab("inbox"); setThreadEmail(e); }}
        onNavigateToEmail={navigateToEmailById}
        onSendSuccess={() => queryClient.invalidateQueries({ queryKey: ["emails"] })}
      />

      {/* Send Confirmation Dialog */}
      <Dialog open={!!confirmSend} onOpenChange={() => setConfirmSend(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Confirm Send</DialogTitle>
            <DialogDescription className="text-sm font-sans">Are you sure you want to send this email?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setConfirmSend(null)}>Cancel</Button>
            <Button className="rounded-xl gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={async () => { if (confirmSend) { await confirmSend.action(); setConfirmSend(null); } }}>
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
                <button onClick={() => setContactsOpen(true)} className="text-[10px] font-sans text-primary hover:underline flex items-center gap-0.5">
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
