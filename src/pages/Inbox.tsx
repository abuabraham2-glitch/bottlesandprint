import React, { useState, useRef, useCallback, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAllEmails, useUpdateEmail, useCreateTriageFeedback, sendEmailViaWebhook, useFollowUps, Email } from "@/lib/emailData";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Send, Mail, Plus, Paperclip, BookUser, Trash2, FileText, Archive, Inbox as InboxIcon, CheckSquare, Search, Flame, RefreshCw } from "lucide-react";
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

type MainTab = "inbox" | "drafts" | "sent" | "archive";
type CategoryFilter = "ALL" | "SALES" | "SUPPORT" | "OTHER" | "SPAM" | "URGENT";
type ArchiveCategoryFilter = "ALL" | "SALES" | "SUPPORT" | "SPAM" | "SENT";

export default function Inbox() {
  const [mainTab, setMainTab] = useState<MainTab>("inbox");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveCategoryFilter, setArchiveCategoryFilter] = useState<ArchiveCategoryFilter>("ALL");
  const [archiveHasAttachments, setArchiveHasAttachments] = useState(false);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState("");
  const [threadEmail, setThreadEmail] = useState<Email | null>(null);
  const [draftEmail, setDraftEmail] = useState<Email | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [showCcField, setShowCcField] = useState(false);
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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const composeBodyRef = useRef<HTMLDivElement>(null);

  const { data: allEmails = [], isLoading } = useAllEmails();
  const { data: followUps = [] } = useFollowUps();
  const queryClient = useQueryClient();

  // Derived lists
  const activeEmails = React.useMemo(() =>
    allEmails.filter(e => e.status === "pending" || e.status === "needs_response" || e.status === "approved_sent"),
    [allEmails]
  );

  const draftEmails = React.useMemo(() =>
    allEmails.filter(e => e.draft_response && (e.status === "pending" || e.status === "needs_response")),
    [allEmails]
  );

  const sentEmails = React.useMemo(() =>
    allEmails.filter(e => e.status === "approved_sent")
      .sort((a, b) => new Date(b.resolved_at || b.created_at || 0).getTime() - new Date(a.resolved_at || a.created_at || 0).getTime()),
    [allEmails]
  );

  const allArchivedEmails = React.useMemo(() =>
    allEmails.filter(e => e.status === "resolved" || e.status === "approved_sent"),
    [allEmails]
  );

  const archivedEmails = React.useMemo(() => {
    let list = allArchivedEmails;

    // Category filter
    switch (archiveCategoryFilter) {
      case "SALES": list = list.filter(e => e.category === "SALES"); break;
      case "SUPPORT": list = list.filter(e => e.category === "SUPPORT"); break;
      case "SPAM": list = list.filter(e => e.category === "SPAM"); break;
      case "SENT": list = list.filter(e => e.status === "approved_sent"); break;
    }

    // Has attachments filter
    if (archiveHasAttachments) {
      list = list.filter(e => {
        const atts = parseAttachments(e.attachments);
        return atts.length > 0;
      });
    }

    // Search
    if (archiveSearchQuery.trim()) {
      const q = archiveSearchQuery.toLowerCase();
      list = list.filter(e =>
        (e.subject?.toLowerCase().includes(q)) ||
        (e.from_name?.toLowerCase().includes(q)) ||
        (e.from_email?.toLowerCase().includes(q)) ||
        (e.body?.toLowerCase().includes(q))
      );
    }

    return list;
  }, [allArchivedEmails, archiveCategoryFilter, archiveHasAttachments, archiveSearchQuery]);

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
  const selectToSuggestion = (email: string) => { setComposeTo(email); setShowToSuggestions(false); setShowCcSuggestions(false); };
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
      setComposeOpen(false); setComposeTo(""); setComposeCc(""); setShowCcField(false); setComposeSubject(""); setComposeBody(""); setComposeEmailRef(null); setComposeAttachments([]);
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
    if (category === "SPAM") {
      updates.status = "resolved";
      updates.resolved_at = now;
      updates.draft_response = null;
    } else {
      // Re-activate email: set to needs_response and clear resolved state
      updates.status = "needs_response";
      updates.resolved_at = null;
    }
    for (const id of selectedIds) {
      await supabase.from("emails").update(updates).eq("id", id);
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`${selectedIds.size} → ${category}`);
    setSelectedIds(new Set());
  };

  const bulkDelete = async () => {
    const now = new Date().toISOString();
    for (const id of selectedIds) {
      await supabase.from("emails").update({ status: "deleted", resolved_at: now } as any).eq("id", id);
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`Deleted ${selectedIds.size} emails`);
    setSelectedIds(new Set());
    setDeleteConfirmOpen(false);
  };

  const bulkToggleUrgent = async () => {
    for (const id of selectedIds) {
      const email = allEmails.find(e => e.id === id);
      const newVal = !(email?.is_urgent);
      await supabase.from("emails").update({ is_urgent: newVal } as any).eq("id", id);
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`Toggled 🔥 on ${selectedIds.size} emails`);
    setSelectedIds(new Set());
  };

  const markAsRead = async (emailId: string) => {
    await supabase.from("emails").update({ is_read: true } as any).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
  };

  const handleOpenEmail = (email: Email) => {
    if (!email.is_read) markAsRead(email.id);
    if (mainTab === "drafts") setDraftEmail(email);
    else setThreadEmail(email);
  };

  const unreadCount = React.useMemo(() =>
    activeEmails.filter(e => !e.is_read).length,
    [activeEmails]
  );

  // Apply category filter + search
  const baseEmails = mainTab === "inbox" ? activeEmails : mainTab === "drafts" ? draftEmails : mainTab === "sent" ? sentEmails : archivedEmails;

  const filteredEmails = React.useMemo(() => {
    let list = baseEmails;

    // Category filter (only in inbox tab)
    if (mainTab === "inbox") {
      switch (categoryFilter) {
        case "SALES": list = list.filter(e => e.category === "SALES"); break;
        case "SUPPORT": list = list.filter(e => e.category === "SUPPORT"); break;
        case "OTHER": list = list.filter(e => e.category === "OTHER"); break;
        case "SPAM": list = allEmails.filter(e => e.category === "SPAM"); break;
        case "URGENT": list = list.filter(e => e.is_urgent); break;
      }
    }

    // Search across all fields
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      // When searching, search across ALL emails (not just filtered by tab/category)
      const searchPool = categoryFilter === "ALL" && mainTab === "inbox"
        ? allEmails
        : list;
      list = searchPool.filter(e =>
        (e.subject?.toLowerCase().includes(q)) ||
        (e.from_name?.toLowerCase().includes(q)) ||
        (e.from_email?.toLowerCase().includes(q)) ||
        (e.body?.toLowerCase().includes(q)) ||
        (e.to_recipients?.toLowerCase().includes(q)) ||
        (e.draft_response?.replace(/<[^>]*>/g, "").toLowerCase().includes(q))
      );
    }

    return list;
  }, [baseEmails, allEmails, mainTab, categoryFilter, searchQuery]);

  const displayedEmails = filteredEmails;

  const CATEGORY_TABS: { key: CategoryFilter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "SALES", label: "Sales" },
    { key: "SUPPORT", label: "Support" },
    { key: "OTHER", label: "Other" },
    { key: "SPAM", label: "Spam" },
    { key: "URGENT", label: "🔥 Urgent" },
  ];

  // Select All logic
  const allVisibleSelected = displayedEmails.length > 0 && displayedEmails.every(e => selectedIds.has(e.id));
  const someVisibleSelected = displayedEmails.some(e => selectedIds.has(e.id));
  const handleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      setSelectedIds(new Set(displayedEmails.map(e => e.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("https://bottlesandprint.app.n8n.cloud/webhook/manual-refresh");
      toast("Checking for new emails…", { duration: 3000 });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["all-emails"] }), 3000);
    } catch {
      toast.error("Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

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
              <Button size="icon" variant="outline" className="md:hidden rounded-xl min-h-[44px] min-w-[44px]" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              </Button>
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
              { key: "inbox" as MainTab, label: "Inbox", icon: InboxIcon, count: activeEmails.length, countClass: "bg-primary/10 text-primary", extra: unreadCount > 0 ? ` · ${unreadCount} unread` : "" },
              { key: "drafts" as MainTab, label: "Drafts", icon: FileText, count: draftEmails.length, countClass: "bg-orange-100 text-orange-700", extra: "" },
              { key: "sent" as MainTab, label: "Sent", icon: Send, count: sentEmails.length, countClass: "bg-green-100 text-green-700", extra: "" },
              { key: "archive" as MainTab, label: "Archive", icon: Archive, count: allArchivedEmails.length, countClass: "bg-muted text-muted-foreground", extra: "" },
            ].map(tab => (
              <button key={tab.key}
                onClick={() => setMainTab(tab.key)}
                className={`px-4 py-2 rounded-lg text-sm font-sans font-medium transition-colors min-h-[44px] whitespace-nowrap flex items-center gap-1.5 ${
                  mainTab === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                <tab.icon size={15} />
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab.countClass}`}>{tab.count}{tab.extra}</span>
              </button>
            ))}
          </div>

          {/* Category filter tabs (inbox only) + search (inbox & sent) */}
          {(mainTab === "inbox" || mainTab === "sent") && (
            <div className="flex items-center gap-3 flex-wrap">
              {mainTab === "inbox" && (
                <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                  {CATEGORY_TABS.map(ct => (
                    <button
                      key={ct.key}
                      onClick={() => setCategoryFilter(ct.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-sans font-medium transition-colors whitespace-nowrap ${
                        categoryFilter === ct.key
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {ct.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="relative flex-1 min-w-[180px] max-w-[320px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={mainTab === "sent" ? "Search sent emails..." : "Search emails..."}
                  className="rounded-xl pl-9 h-9 text-sm"
                />
              </div>
            </div>
          )}

          {/* Archive filter bar */}
          {mainTab === "archive" && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
                {([
                  { key: "ALL" as ArchiveCategoryFilter, label: "All", count: allArchivedEmails.length },
                  { key: "SALES" as ArchiveCategoryFilter, label: "Sales", count: allArchivedEmails.filter(e => e.category === "SALES").length },
                  { key: "SUPPORT" as ArchiveCategoryFilter, label: "Support", count: allArchivedEmails.filter(e => e.category === "SUPPORT").length },
                  { key: "SPAM" as ArchiveCategoryFilter, label: "Spam", count: allArchivedEmails.filter(e => e.category === "SPAM").length },
                  { key: "SENT" as ArchiveCategoryFilter, label: "Sent", count: allArchivedEmails.filter(e => e.status === "approved_sent").length },
                ]).map(ct => (
                  <button
                    key={ct.key}
                    onClick={() => setArchiveCategoryFilter(ct.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-sans font-medium transition-colors whitespace-nowrap ${
                      archiveCategoryFilter === ct.key
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {ct.label} {ct.count}
                  </button>
                ))}
                <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-sans font-medium cursor-pointer transition-colors bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted">
                  <Checkbox
                    checked={archiveHasAttachments}
                    onCheckedChange={(v) => setArchiveHasAttachments(v === true)}
                    className="h-3.5 w-3.5"
                  />
                  <Paperclip size={12} />
                  Attachments
                </label>
              </div>
              <div className="relative flex-1 min-w-[180px] max-w-[320px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={archiveSearchQuery}
                  onChange={e => setArchiveSearchQuery(e.target.value)}
                  placeholder="Search archived emails..."
                  className="rounded-xl pl-9 h-9 text-sm"
                />
              </div>
            </div>
          )}

          {/* Email list */}
          {isLoading ? (
            <div className="text-muted-foreground text-sm font-sans py-8 text-center">Loading emails...</div>
          ) : displayedEmails.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail size={32} className="mx-auto mb-2 opacity-50" />
              <p className="font-sans text-sm">
                {searchQuery ? "No emails match your search." : mainTab === "inbox" ? "No active emails." : mainTab === "drafts" ? "No drafts waiting for review." : mainTab === "sent" ? "No sent emails." : "No archived emails."}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Select All header row */}
              <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/20 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <div className="w-2 flex-shrink-0" />
                  <Checkbox
                    checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                    onCheckedChange={handleSelectAll}
                    className="h-4 w-4"
                  />
                </div>
                <span className="text-xs font-sans text-muted-foreground font-medium flex-1">
                  {someVisibleSelected ? `${selectedIds.size} selected` : "Select all"}
                </span>
                <Button size="sm" variant="outline" className="hidden md:inline-flex rounded-xl gap-1.5 text-xs h-8" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
                  Refresh
                </Button>
              </div>
              {displayedEmails.map(email => {
                const atts = parseAttachments(email.attachments);
                const age = formatAge(email.created_at);
                const isSelected = selectedIds.has(email.id);

                return (
                  <div key={email.id}
                    className={`floating-card mb-0 cursor-pointer hover:bg-muted/30 transition-colors ${isSelected ? "ring-2 ring-primary/50" : ""}`}
                    onClick={() => handleOpenEmail(email)}>
                    <div className="flex items-start gap-3">
                      {/* Unread dot */}
                      <div className="flex items-center gap-2 pt-1">
                        <div className="w-2 flex-shrink-0">
                          {!email.is_read && mainTab === "inbox" && (
                            <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />
                          )}
                        </div>
                        <div onClick={(e) => { e.stopPropagation(); toggleSelected(email.id); }}>
                          <Checkbox checked={isSelected} className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          {email.is_urgent && <span className="text-sm">🔥</span>}
                          {mainTab === "sent" ? (
                            <span className="text-sm font-sans font-medium truncate">To: {email.to_recipients || email.from_email || "Unknown"}</span>
                          ) : (
                            <span className={`text-sm font-sans truncate ${!email.is_read && mainTab === "inbox" ? "font-bold" : "font-medium"}`}>{displaySenderName(email.from_name, email.from_email)}</span>
                          )}
                          {email.category && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-sans font-medium ${CATEGORY_COLORS[email.category] || CATEGORY_COLORS.UNKNOWN}`}>
                              {email.category}
                            </span>
                          )}
                          {atts.length > 0 && <Paperclip size={12} className="text-muted-foreground" />}
                          {email.draft_response && mainTab === "inbox" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-sans font-medium">✏️ Draft</span>
                          )}
                          {email.status === "approved_sent" && mainTab !== "sent" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-sans font-medium">✅ Replied</span>
                          )}
                        </div>
                        <div className={`text-sm font-sans truncate ${!email.is_read && mainTab === "inbox" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{email.subject}</div>
                        {mainTab === "sent" && email.draft_response && (
                          <div className="text-xs font-sans text-muted-foreground truncate mt-0.5">
                            {email.draft_response.replace(/<[^>]*>/g, "").substring(0, 100)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {mainTab === "drafts" ? (
                          <span className={`text-xs font-sans font-medium ${age.color}`}>{age.text}</span>
                        ) : mainTab === "sent" ? (
                          <span className="text-xs text-muted-foreground font-sans whitespace-nowrap">{formatTime(email.resolved_at)}</span>
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
              <Button size="sm" variant="outline" className="rounded-xl text-xs gap-1" onClick={bulkToggleUrgent}>
                <Flame size={12} /> 🔥 Flag
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
              <Button size="sm" variant="destructive" className="rounded-xl text-xs gap-1" onClick={() => setDeleteConfirmOpen(true)}>
                <Trash2 size={12} /> Delete
              </Button>
              <button className="text-xs text-muted-foreground hover:text-foreground font-sans underline" onClick={() => setSelectedIds(new Set())}>
                Clear
              </button>
            </div>
          )}

          {/* Delete Confirmation */}
          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete selected email(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete the selected email(s)? This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
           <div className="space-y-3 overflow-y-auto flex-1 min-h-0" {...{ autoComplete: "off" } as any}>
            <div className="relative">
              <div className="flex items-center justify-between">
                <label className="text-xs font-sans text-muted-foreground">To</label>
                <button onClick={() => setContactsOpen(true)} className="text-[10px] font-sans text-primary hover:underline flex items-center gap-0.5">
                  <BookUser size={10} /> Manage Contacts
                </button>
              </div>
              <Input name="compose-to-field" autoComplete="off" value={composeTo} onChange={e => handleToChange(e.target.value)} onBlur={() => setTimeout(() => setShowToSuggestions(false), 200)} placeholder="email@example.com" className="rounded-xl" />
              {showToSuggestions && toSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-card border rounded-xl shadow-lg max-h-40 overflow-y-auto">
                  {toSuggestions.map((s, i) => (
                    <button key={i} className="w-full text-left px-3 py-2 text-sm font-sans hover:bg-muted/50 transition-colors" onMouseDown={e => { e.preventDefault(); selectToSuggestion(s.email); }}>
                      {s.name ? <><span className="font-medium">{s.name}</span> <span className="text-muted-foreground">&lt;{s.email}&gt;</span></> : s.email}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <label className="text-xs font-sans text-muted-foreground">CC</label>
              <Input name="compose-cc-field" autoComplete="off" value={composeCc} onChange={e => handleCcChange(e.target.value)} onBlur={() => setTimeout(() => setShowCcSuggestions(false), 200)} placeholder="cc@example.com" className="rounded-xl" />
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
