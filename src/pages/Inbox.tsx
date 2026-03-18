import React, { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAllEmails, useUpdateEmail, useCreateTriageFeedback, sendEmailViaWebhook, useFollowUps, Email } from "@/lib/emailData";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Send, Mail, Plus, Paperclip, BookUser, Trash2, FileText, Archive, Inbox as InboxIcon, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { ThreadView } from "@/components/inbox/ThreadView";
import { DraftEditor } from "@/components/inbox/DraftEditor";
import {
  CATEGORY_COLORS, displaySenderName, formatTime, formatAge, parseAttachments,
  parseMultiTopicCount, stripN8nFooter, getReplyAllCc, SIGNATURE,
} from "@/components/inbox/InboxHelpers";

type MainTab = "inbox" | "drafts" | "archive";

export default function Inbox() {
  const [mainTab, setMainTab] = useState<MainTab>("inbox");
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
  const [showFollowUps, setShowFollowUps] = useState(false);
  const [toSuggestions, setToSuggestions] = useState<{email: string; name?: string}[]>([]);
  const [ccSuggestions, setCcSuggestions] = useState<{email: string; name?: string}[]>([]);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [showCcSuggestions, setShowCcSuggestions] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState<{id: string; email: string; name: string | null}[]>([]);
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const composeBodyRef = useRef<HTMLDivElement>(null);

  const { data: allEmails = [], isLoading } = useAllEmails();
  const { data: followUps = [] } = useFollowUps();
  const queryClient = useQueryClient();

  // Derived lists
  const activeEmails = React.useMemo(() =>
    allEmails.filter(e => e.status === "pending" || e.status === "needs_response"),
    [allEmails]
  );

  const draftEmails = React.useMemo(() =>
    allEmails.filter(e => e.draft_response && (e.status === "pending" || e.status === "needs_response")),
    [allEmails]
  );

  const archivedEmails = React.useMemo(() =>
    allEmails.filter(e => e.status === "resolved" || e.status === "approved_sent").slice(0, 50),
    [allEmails]
  );

  // Clear selection when switching tabs
  useEffect(() => { setSelectedIds(new Set()); }, [mainTab]);

  // Keep threadEmail in sync with latest data from allEmails
  useEffect(() => {
    if (threadEmail) {
      const updated = allEmails.find(e => e.id === threadEmail.id);
      if (updated && updated.status !== threadEmail.status) {
        console.log("[Inbox] threadEmail status synced:", threadEmail.id, threadEmail.status, "→", updated.status);
        setThreadEmail(updated);
      }
    }
  }, [allEmails, threadEmail]);

  // Keep draftEmail in sync with latest data from allEmails
  useEffect(() => {
    if (draftEmail) {
      const updated = allEmails.find(e => e.id === draftEmail.id);
      if (updated && updated.status !== draftEmail.status) {
        console.log("[Inbox] draftEmail status synced:", draftEmail.id, draftEmail.status, "→", updated.status);
        // If email was resolved/sent, close the draft editor
        if (updated.status === "resolved" || updated.status === "approved_sent") {
          console.log("[Inbox] Draft email resolved/sent, closing editor");
          setDraftEmail(null);
        } else {
          setDraftEmail(updated);
        }
      }
    }
  }, [allEmails, draftEmail]);

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

  // Autocomplete
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

  const navigateToEmailById = async (id: string) => {
    setThreadEmail(null); setDraftEmail(null);
    setTimeout(async () => {
      const target = allEmails.find(e => e.id === id);
      if (target) { setThreadEmail(target); return; }
      const { data } = await supabase.from("emails").select("*").eq("id", id).single();
      if (data) setThreadEmail(data as any);
    }, 100);
  };

  // Bulk actions
  const toggleSelected = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const bulkArchive = async () => {
    const now = new Date().toISOString();
    for (const id of selectedIds) {
      await supabase.from("emails").update({ status: "resolved", draft_response: null, resolved_at: now } as any).eq("id", id);
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`Archived ${selectedIds.size} emails`);
    setSelectedIds(new Set());
  };

  const bulkSetCategory = async (category: string) => {
    const now = new Date().toISOString();
    const updates: any = { category };
    if (category === "SPAM") { updates.status = "resolved"; updates.resolved_at = now; updates.draft_response = null; }
    for (const id of selectedIds) {
      await supabase.from("emails").update(updates).eq("id", id);
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`${selectedIds.size} → ${category}`);
    setSelectedIds(new Set());
  };

  const displayedEmails = mainTab === "inbox" ? activeEmails : mainTab === "drafts" ? draftEmails : archivedEmails;

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
          {/* THREE TABS: INBOX | DRAFTS | ARCHIVE */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 w-fit">
            {[
              { key: "inbox" as MainTab, label: "Inbox", icon: InboxIcon, count: activeEmails.length, countClass: "bg-primary/10 text-primary" },
              { key: "drafts" as MainTab, label: "Drafts", icon: FileText, count: draftEmails.length, countClass: "bg-orange-100 text-orange-700" },
              { key: "archive" as MainTab, label: "Archive", icon: Archive, count: archivedEmails.length, countClass: "bg-muted text-muted-foreground" },
            ].map(tab => (
              <button key={tab.key}
                onClick={() => setMainTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-sans font-medium transition-colors min-h-[44px] whitespace-nowrap flex items-center gap-1.5 ${
                  mainTab === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                <tab.icon size={15} />
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab.countClass}`}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* Email list */}
          {isLoading ? (
            <div className="text-muted-foreground text-sm font-sans py-8 text-center">Loading emails...</div>
          ) : displayedEmails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail size={32} className="mx-auto mb-2 opacity-50" />
              <p className="font-sans text-sm">
                {mainTab === "inbox" ? "No active emails." : mainTab === "drafts" ? "No drafts waiting for review." : "No archived emails."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {displayedEmails.map(email => {
                const atts = parseAttachments(email.attachments);
                const age = formatAge(email.created_at);
                const isSelected = selectedIds.has(email.id);

                return (
                  <div key={email.id}
                    className={`floating-card mb-0 cursor-pointer hover:bg-muted/30 transition-colors ${isSelected ? "ring-2 ring-primary/50" : ""}`}
                    onClick={() => mainTab === "drafts" ? setDraftEmail(email) : setThreadEmail(email)}>
                    <div className="flex items-start gap-3">
                      <div className="pt-0.5" onClick={(e) => { e.stopPropagation(); toggleSelected(email.id); }}>
                        <Checkbox checked={isSelected} className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-medium text-sm font-sans truncate">{displaySenderName(email.from_name, email.from_email)}</span>
                          {email.category && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.UNKNOWN}`}>
                              {email.category}
                            </span>
                          )}
                          {atts.length > 0 && <Paperclip size={12} className="text-muted-foreground" />}
                          {email.draft_response && mainTab === "inbox" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-sans font-medium">✏️ Draft</span>
                          )}
                        </div>
                        <div className="text-sm font-sans truncate text-muted-foreground">{email.subject}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {mainTab === "drafts" ? (
                          <span className={`text-xs font-sans font-medium ${age.color}`}>{age.text}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground font-sans whitespace-nowrap">{formatTime(email.created_at)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-card border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-sans font-medium">✓ {selectedIds.size} selected</span>
              <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1" onClick={bulkArchive}>
                <Archive size={12} /> Archive
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1" onClick={() => bulkSetCategory("SALES")}>
                Mark Sales
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1" onClick={() => bulkSetCategory("SUPPORT")}>
                Mark Support
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1" onClick={() => bulkSetCategory("SPAM")}>
                Mark Spam
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1" onClick={() => bulkSetCategory("OTHER")}>
                Mark Other
              </Button>
              <button className="text-xs text-muted-foreground hover:text-foreground font-sans underline" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          )}
        </>
      )}

      {/* Thread View */}
      <ThreadView
        email={threadEmail}
        onClose={() => setThreadEmail(null)}
        onOpenDraft={(e) => { setThreadEmail(null); setTimeout(() => setDraftEmail(e), 150); }}
        onNavigateToEmail={navigateToEmailById}
      />

      {/* Draft Editor */}
      <DraftEditor
        email={draftEmail}
        onClose={() => setDraftEmail(null)}
        onNavigateToEmail={navigateToEmailById}
      />

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
