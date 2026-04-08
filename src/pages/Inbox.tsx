import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAllEmails, useUpdateEmail, useCreateTriageFeedback, sendEmailViaWebhook, Email } from "@/lib/emailData";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Send, Mail, Plus, Paperclip, BookUser, Trash2, FileText, Archive, Inbox as InboxIcon, Search, Flame, RefreshCw, ShieldOff, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { AttachmentPicker, AttachedFile } from "@/components/AttachmentPicker";
import { FormattingToolbar } from "@/components/FormattingToolbar";
import { ThreadView } from "@/components/inbox/ThreadView";
import { DraftEditor } from "@/components/inbox/DraftEditor";
import {
  displaySenderName, formatTime, formatAge, parseAttachments,
  stripN8nFooter, SIGNATURE,
} from "@/components/inbox/InboxHelpers";

type MainTab = "needs_reply" | "waiting" | "spam" | "archive";

export default function Inbox() {
  const [mainTab, setMainTab] = useState<MainTab>("needs_reply");
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveFilterQuoted, setArchiveFilterQuoted] = useState(false);
  const [archiveFilterAttachments, setArchiveFilterAttachments] = useState(false);
  const [archiveFilterReceipt, setArchiveFilterReceipt] = useState(false);
  const [archiveFilterOther, setArchiveFilterOther] = useState(false);
  const [archiveSearchQuery, setArchiveSearchQuery] = useState("");
  const [archiveSearchDebounced, setArchiveSearchDebounced] = useState("");
  const [threadEmail, setThreadEmail] = useState<Email | null>(null);
  const [draftEmail, setDraftEmail] = useState<Email | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeCc, setComposeCc] = useState("");
  const [composeBcc, setComposeBcc] = useState("");
  const [showCcField, setShowCcField] = useState(false);
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeEmailRef, setComposeEmailRef] = useState<Email | null>(null);
  const [composeAttachments, setComposeAttachments] = useState<AttachedFile[]>([]);
  const [sending, setSending] = useState<string | null>(null);
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
  const [spamDeleteAllOpen, setSpamDeleteAllOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Archive label prompt state
  const [archiveLabelOpen, setArchiveLabelOpen] = useState(false);
  const [archiveLabelTargetIds, setArchiveLabelTargetIds] = useState<string[]>([]);
  const composeBodyRef = useRef<HTMLDivElement>(null);
  const composeCcRef = useRef<HTMLInputElement>(null);
  const composeBccRef = useRef<HTMLInputElement>(null);

  const { data: allEmails = [], isLoading } = useAllEmails();
  const queryClient = useQueryClient();

  // Debounce archive search
  useEffect(() => {
    const timer = setTimeout(() => setArchiveSearchDebounced(archiveSearchQuery), 300);
    return () => clearTimeout(timer);
  }, [archiveSearchQuery]);

  // Derived lists for each tab
  // Threads with any email in 'waiting' status
  const waitingThreadIds = useMemo(() => new Set(
    allEmails
      .filter(e => e.status === "waiting" && e.thread_id)
      .map(e => e.thread_id!)
  ), [allEmails]);

  const needsReplyEmails = useMemo(() => {
    return allEmails
      .filter(e =>
        (e.status === "pending" || e.status === "needs_response") &&
        ((e as any).direction === "inbound" || !(e as any).direction) &&
        (!e.thread_id || !waitingThreadIds.has(e.thread_id))
      )
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [allEmails, waitingThreadIds]);

  const waitingEmails = useMemo(() => {
    const getTime = (e: Email) => new Date(e.created_at || 0).getTime();
    const excludeStatuses = new Set(["deleted", "archived", "spam", "resolved"]);

    // For each thread, find the most recent non-excluded email
    const latestByThread = new Map<string, Email>();
    allEmails
      .filter(e => e.thread_id && !excludeStatuses.has(e.status || ""))
      .sort((a, b) => getTime(b) - getTime(a))
      .forEach(e => {
        if (!latestByThread.has(e.thread_id!)) latestByThread.set(e.thread_id!, e);
      });

    // A thread qualifies if its latest email is outbound OR has status='waiting'
    const result: Email[] = [];
    latestByThread.forEach((latest) => {
      if ((latest as any).direction === "outbound" || latest.status === "waiting") {
        result.push(latest);
      }
    });

    // Also include non-threaded emails with status='waiting'
    allEmails
      .filter(e => !e.thread_id && e.status === "waiting")
      .forEach(e => result.push(e));

    return result.sort((a, b) => getTime(b) - getTime(a));
  }, [allEmails]);

  const spamEmails = useMemo(() =>
    allEmails.filter(e => (e.status === "spam" || e.category === "SPAM" || (e as any).tier === "SPAM") && e.status !== "deleted")
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
    [allEmails]
  );

  const archivedEmails = useMemo(() => {
    let list = allEmails.filter(e => e.status === "archived" || e.status === "resolved");

    if (archiveFilterQuoted) list = list.filter(e => e.quoted_at != null);
    if (archiveFilterAttachments) {
      list = list.filter(e => {
        const atts = parseAttachments(e.attachments);
        return atts.length > 0;
      });
    }
    if (archiveFilterReceipt) list = list.filter(e => e.label === "receipt");
    if (archiveFilterOther) list = list.filter(e => e.label === "other");

    if (archiveSearchDebounced.trim()) {
      const q = archiveSearchDebounced.toLowerCase();
      list = list.filter(e =>
        (e.subject?.toLowerCase().includes(q)) ||
        (e.from_name?.toLowerCase().includes(q)) ||
        (e.from_email?.toLowerCase().includes(q)) ||
        (e.body?.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  }, [allEmails, archiveFilterQuoted, archiveFilterAttachments, archiveFilterReceipt, archiveFilterOther, archiveSearchDebounced]);

  // Clear selection when switching tabs
  useEffect(() => { setSelectedIds(new Set()); }, [mainTab]);

  // Keep threadEmail in sync
  useEffect(() => {
    if (threadEmail) {
      const updated = allEmails.find(e => e.id === threadEmail.id);
      if (updated && updated.status !== threadEmail.status) {
        setThreadEmail(updated);
      }
    }
  }, [allEmails, threadEmail]);

  // Keep draftEmail in sync
  useEffect(() => {
    if (draftEmail) {
      const updated = allEmails.find(e => e.id === draftEmail.id);
      if (updated && updated.status !== draftEmail.status) {
        if (updated.status === "resolved" || updated.status === "approved_sent") {
          setDraftEmail(null);
        } else {
          setDraftEmail(updated);
        }
      }
    }
  }, [allEmails, draftEmail]);

  useLayoutEffect(() => {
    if (!showCcField) return;

    if (composeCcRef.current && composeCcRef.current.value !== composeCc) {
      composeCcRef.current.value = composeCc;
    }

    if (composeBccRef.current && composeBccRef.current.value !== composeBcc) {
      composeBccRef.current.value = composeBcc;
    }
  }, [composeCc, composeBcc, showCcField]);

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
      const payload: any = { to_email: composeTo, subject: composeSubject, draft: htmlContent, cc: composeCc || undefined, bcc: composeBcc || undefined, attachments: composeAttachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, data: a.data })) };
      if (isNewEmail) { payload.action = "send_new"; payload.email_id = composeEmailRef?.id || ""; }
      else { payload.gmail_id = composeEmailRef?.gmail_id; payload.email_id = composeEmailRef?.id; }
      const WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/email-actions";
      const response = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: isNewEmail ? "send_new" : "send_email", ...payload }) });
      if (!response.ok) throw new Error("Failed to send email");
      toast.success("Email sent");
      setComposeOpen(false); setComposeTo(""); setComposeCc(""); setComposeBcc(""); setShowCcField(false); setComposeSubject(""); setComposeBody(""); setComposeEmailRef(null); setComposeAttachments([]);
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

  // Archive with label prompt
  const archiveWithLabel = async (ids: string[], label: string | null) => {
    const now = new Date().toISOString();
    const updates: any = { status: "resolved", draft_response: null, resolved_at: now };
    if (label) updates.label = label;
    for (const id of ids) {
      await supabase.from("emails").update(updates).eq("id", id);
      const email = allEmails.find(e => e.id === id);
      if (email?.thread_id) {
        await supabase.from("emails")
          .update({ status: "resolved", draft_response: null, resolved_at: now } as any)
          .eq("thread_id", email.thread_id)
          .in("status", ["pending", "needs_response"])
          .neq("id", id);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`Archived ${ids.length} email(s)`);
    setArchiveLabelOpen(false);
    setArchiveLabelTargetIds([]);
    setSelectedIds(new Set());
  };

  const initiateArchive = (ids: string[]) => {
    const needsLabel = ids.some(id => {
      const email = allEmails.find(e => e.id === id);
      return !email?.label;
    });
    if (needsLabel) {
      setArchiveLabelTargetIds(ids);
      setArchiveLabelOpen(true);
    } else {
      archiveWithLabel(ids, null);
    }
  };

  const bulkArchive = () => initiateArchive(Array.from(selectedIds));

  // Delete: set status=deleted, deleted_at=now, keep in DB for trash
  const deleteEmails = async (ids: Set<string> | string[]) => {
    const idArray = Array.from(ids);
    if (idArray.length === 0) return;
    const WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/email-actions";
    const now = new Date().toISOString();
    const results = await Promise.allSettled(
      idArray.map(async (id) => {
        const email = allEmails.find((row) => row.id === id);
        const payload = { action: "delete", gmail_id: email?.gmail_id || "", email_id: id };
        console.log("[Delete] Request:", { url: WEBHOOK_URL, method: "POST", payload });
        const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const responseBody = await res.text();
        console.log("[Delete] Response:", { status: res.status, body: responseBody, emailId: id });
        if (!res.ok) throw new Error(`Delete webhook failed for ${id} (${res.status})`);
        return id;
      }),
    );
    const successfulIds = results.flatMap((r) => r.status === "fulfilled" ? [r.value] : []);
    if (successfulIds.length > 0) {
      await supabase.from("emails").update({ status: "deleted", deleted_at: now } as any).in("id", successfulIds);
      queryClient.invalidateQueries({ queryKey: ["emails"] });
    }
    if (successfulIds.length > 0) toast.success(`Deleted ${successfulIds.length} email(s)`);
    else toast.error("Failed to delete email(s)");
    setSelectedIds(new Set());
    setDeleteConfirmOpen(false);
  };

  // Delete from detail view
  const handleDeleteFromDetail = async (email: Email) => {
    setThreadEmail(null);
    await deleteEmails([email.id]);
  };

  const bulkDelete = () => deleteEmails(selectedIds);

  const bulkToggleUrgent = async () => {
    for (const id of selectedIds) {
      const email = allEmails.find(e => e.id === id);
      await supabase.from("emails").update({ is_urgent: !(email?.is_urgent) } as any).eq("id", id);
    }
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`Toggled 🔥 on ${selectedIds.size} emails`);
    setSelectedIds(new Set());
  };

  const markAsRead = async (emailId: string) => {
    await supabase.from("emails").update({ is_read: true } as any).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
  };

  const toggleUrgent = async (e: React.MouseEvent, emailId: string) => {
    e.stopPropagation();
    const email = allEmails.find(em => em.id === emailId);
    await supabase.from("emails").update({ is_urgent: !(email?.is_urgent) } as any).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
  };

  const handleOpenEmail = (email: Email) => {
    if (!email.is_read) markAsRead(email.id);
    setThreadEmail(email);
  };

  const handleNotSpam = async (e: React.MouseEvent, emailId: string) => {
    e.stopPropagation();
    await supabase.from("emails").update({ category: "SALES", status: "needs_response", resolved_at: null } as any).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success("Moved to Needs My Reply");
  };

  const handleDeleteAllSpam = async () => {
    const now = new Date().toISOString();
    const spamIds = spamEmails.map(e => e.id);
    if (spamIds.length === 0) return;
    await supabase.from("emails").update({ status: "deleted", deleted_at: now } as any).in("id", spamIds);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(`Deleted ${spamIds.length} spam emails`);
    setSpamDeleteAllOpen(false);
  };

  // Update label on archived email
  const handleUpdateLabel = async (emailId: string, label: string | null) => {
    await supabase.from("emails").update({ label } as any).eq("id", emailId);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    toast.success(label ? `Labeled as ${label}` : "Label removed");
  };

  // Get displayed emails for current tab
  const displayedEmails = useMemo(() => {
    let list: Email[] = [];
    switch (mainTab) {
      case "needs_reply": list = needsReplyEmails; break;
      case "waiting": list = waitingEmails; break;
      case "spam": list = spamEmails; break;
      case "archive": list = archivedEmails; break;
    }
    if (mainTab !== "archive" && searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e =>
        (e.subject?.toLowerCase().includes(q)) ||
        (e.from_name?.toLowerCase().includes(q)) ||
        (e.from_email?.toLowerCase().includes(q)) ||
        (e.body?.toLowerCase().includes(q))
      );
    }
    return list;
  }, [mainTab, needsReplyEmails, waitingEmails, spamEmails, archivedEmails, searchQuery]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    needs_reply: needsReplyEmails.length,
    waiting: waitingEmails.length,
    spam: spamEmails.length,
    archive: archivedEmails.length,
  }), [needsReplyEmails, waitingEmails, spamEmails, archivedEmails]);

  // Select All logic
  const allVisibleSelected = displayedEmails.length > 0 && displayedEmails.every(e => selectedIds.has(e.id));
  const someVisibleSelected = displayedEmails.some(e => selectedIds.has(e.id));
  const handleSelectAll = (checked: boolean | "indeterminate") => {
    if (checked === true) setSelectedIds(new Set(displayedEmails.map(e => e.id)));
    else setSelectedIds(new Set());
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("https://bottlesandprint.app.n8n.cloud/webhook/manual-refresh");
      toast("Checking for new emails…", { duration: 3000 });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["all-emails"] }), 3000);
    } catch { toast.error("Refresh failed"); }
    finally { setRefreshing(false); }
  };

  const TABS: { key: MainTab; label: string }[] = [
    { key: "needs_reply", label: "NEEDS MY REPLY" },
    { key: "waiting", label: "WAITING ON THEM" },
    { key: "spam", label: "SPAM" },
    { key: "archive", label: "ARCHIVE" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1200px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h1 className="text-2xl font-serif font-normal">Email</h1>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="md:hidden rounded-xl min-h-[44px] min-w-[44px]" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          </Button>
          <Button size="sm" className="rounded-xl gap-1 min-h-[44px]" onClick={() => { setComposeOpen(true); setComposeEmailRef(null); setComposeBody(SIGNATURE); }}>
            <Plus size={14} /> Compose
          </Button>
        </div>
      </div>

      {/* 4 TABS */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1 max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] scrollbar-none">
        {TABS.map(tab => (
          <button key={tab.key}
            onClick={() => setMainTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs font-sans font-semibold tracking-wide transition-colors min-h-[40px] whitespace-nowrap flex items-center gap-1.5 ${
              mainTab === tab.key ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}>
            {tab.label}
            {tab.key !== "archive" && tabCounts[tab.key] > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{tabCounts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search bar (non-archive tabs) */}
      {mainTab !== "archive" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-[320px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search emails..." className="rounded-xl pl-9 h-9 text-sm" />
          </div>
          {mainTab === "spam" && spamEmails.length > 0 && (
            <Button size="sm" variant="destructive" className="rounded-xl text-xs gap-1" onClick={() => setSpamDeleteAllOpen(true)}>
              <Trash2 size={12} /> Delete All Spam
            </Button>
          )}
        </div>
      )}

      {/* Archive filter bar */}
      {mainTab === "archive" && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {[
              { label: "Quoted", active: archiveFilterQuoted, toggle: () => setArchiveFilterQuoted(v => !v) },
              { label: "Has Attachments", active: archiveFilterAttachments, toggle: () => setArchiveFilterAttachments(v => !v) },
              { label: "Receipt", active: archiveFilterReceipt, toggle: () => setArchiveFilterReceipt(v => !v) },
              { label: "Other", active: archiveFilterOther, toggle: () => setArchiveFilterOther(v => !v) },
            ].map(pill => (
              <button key={pill.label} onClick={pill.toggle}
                className={`px-3 py-1.5 rounded-full text-xs font-sans font-medium transition-colors whitespace-nowrap ${
                  pill.active ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}>
                {pill.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 min-w-[180px] max-w-[320px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={archiveSearchQuery} onChange={e => setArchiveSearchQuery(e.target.value)} placeholder="Search archived emails..." className="rounded-xl pl-9 h-9 text-sm" />
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
            {mainTab === "needs_reply" ? "No emails need your reply." : mainTab === "waiting" ? "No emails waiting on them." : mainTab === "spam" ? "No spam emails." : "No archived emails."}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {/* Select All header */}
          <div className="flex items-center gap-3 px-4 py-2 border-b bg-muted/20 rounded-t-xl">
            <div className="flex items-center gap-2">
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
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Refresh
            </Button>
          </div>
          {displayedEmails.map(email => (
            <div key={email.id}
              className={`floating-card mb-0 cursor-pointer hover:bg-muted/30 transition-colors ${selectedIds.has(email.id) ? "ring-2 ring-primary/50" : ""}`}
              onClick={() => handleOpenEmail(email)}>
              <div className="flex items-center gap-3">
                {/* Unread dot + checkbox */}
                <div className="flex items-center gap-2">
                  <div className="w-2 flex-shrink-0">
                    {!email.is_read && mainTab === "needs_reply" && (
                      <div className="w-2 h-2 rounded-full bg-[hsl(var(--primary))]" />
                    )}
                  </div>
                  <div onClick={(e) => { e.stopPropagation(); toggleSelected(email.id); }}>
                    <Checkbox checked={selectedIds.has(email.id)} className="h-4 w-4" />
                  </div>
                </div>
                {/* Flame */}
                <div className="w-5 flex-shrink-0 flex items-center justify-center">
                  {email.is_urgent ? (
                    <button onClick={(e) => toggleUrgent(e, email.id)} className="hover:scale-110 transition-transform" title="Remove flag">🔥</button>
                  ) : (
                    <button onClick={(e) => toggleUrgent(e, email.id)} className="opacity-0 hover:opacity-50 transition-opacity text-muted-foreground" title="Flag as urgent">
                      <Flame size={14} />
                    </button>
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className={`text-sm font-sans truncate w-[180px] shrink-0 ${!email.is_read && mainTab === "needs_reply" ? "font-bold" : "font-medium"}`}>
                    {displaySenderName(email.from_name, email.from_email)}
                  </span>
                  <span className={`text-sm font-sans truncate flex-1 ${!email.is_read && mainTab === "needs_reply" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                    {email.subject}
                  </span>
                  {/* Archive tab: label pill */}
                  {mainTab === "archive" && email.label && (
                    <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground capitalize shrink-0">
                      {email.label}
                    </span>
                  )}
                </div>
                {/* Auto-ack pill (needs_reply tab only) */}
                {mainTab === "needs_reply" && email.holding_sent_at && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-sans font-medium px-2 py-0.5 rounded-full shrink-0 auto-ack-pill">
                    <CheckCircle size={10} />
                    Auto-ack sent
                  </span>
                )}
                {/* Not Spam button (spam tab only) */}
                {mainTab === "spam" && (
                  <Button size="sm" variant="outline" className="rounded-xl text-[10px] h-7 gap-1 shrink-0" onClick={(e) => handleNotSpam(e, email.id)}>
                    <ShieldOff size={10} /> Not Spam
                  </Button>
                )}
                {/* Timestamp */}
                <span className="text-xs text-muted-foreground font-sans whitespace-nowrap shrink-0">{formatTime(email.created_at)}</span>
              </div>
            </div>
          ))}
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
          <Button size="sm" variant="destructive" className="rounded-xl text-xs gap-1" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 size={12} /> Delete
          </Button>
          <button className="text-xs text-muted-foreground hover:text-foreground font-sans underline" onClick={() => setSelectedIds(new Set())}>Clear</button>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected email(s)?</AlertDialogTitle>
            <AlertDialogDescription>Emails will be moved to Trash.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Spam Delete All Confirmation */}
      <AlertDialog open={spamDeleteAllOpen} onOpenChange={setSpamDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all spam emails?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. All {spamEmails.length} spam emails will be deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAllSpam} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Label Prompt */}
      <Dialog open={archiveLabelOpen} onOpenChange={(open) => { if (!open) { setArchiveLabelOpen(false); setArchiveLabelTargetIds([]); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif">Label before archiving?</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 justify-center py-4">
            <Button variant="outline" className="rounded-xl" onClick={() => archiveWithLabel(archiveLabelTargetIds, "receipt")}>Receipt</Button>
            <Button variant="outline" className="rounded-xl" onClick={() => archiveWithLabel(archiveLabelTargetIds, "other")}>Other</Button>
            <Button variant="ghost" className="rounded-xl" onClick={() => archiveWithLabel(archiveLabelTargetIds, null)}>Skip</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Thread View */}
      <ThreadView
        email={threadEmail}
        onClose={() => setThreadEmail(null)}
        onOpenDraft={(e) => { setThreadEmail(null); setTimeout(() => setDraftEmail(e), 150); }}
        onNavigateToEmail={navigateToEmailById}
        onArchive={(email) => initiateArchive([email.id])}
        onDelete={handleDeleteFromDetail}
        onUpdateLabel={handleUpdateLabel}
        onMoveToWaiting={async (email) => {
          // Archive older same-thread emails that are also in Waiting
          if (email.thread_id) {
            await supabase.from("emails")
              .update({ status: "resolved" } as any)
              .eq("thread_id", email.thread_id)
              .eq("status", "waiting")
              .neq("id", email.id);
          }
          await supabase.from("emails").update({ status: "waiting", direction: "outbound" } as any).eq("id", email.id);
          queryClient.invalidateQueries({ queryKey: ["emails"] });
          queryClient.invalidateQueries({ queryKey: ["all-emails"] });
          setThreadEmail(null);
          toast.success("Moved to Waiting on Them");
        }}
      />

      {/* Draft Editor */}
      <DraftEditor
        email={draftEmail}
        onClose={() => setDraftEmail(null)}
        onNavigateToEmail={navigateToEmailById}
      />

      {/* Compose Dialog */}
      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent
          className="w-full max-w-none"
          style={{ width: 600, minWidth: 400, minHeight: 400, height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', resize: 'both', overflow: 'hidden' }}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-serif">Compose Email</DialogTitle>
          </DialogHeader>
          <div className="flex flex-1 min-h-0 flex-col overflow-hidden" {...{ autoComplete: "off" } as any}>
            <div className="space-y-3 shrink-0">
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-sans text-muted-foreground">To</label>
                    {!showCcField && (
                      <button onClick={() => setShowCcField(true)} className="text-[10px] font-sans text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded border border-dashed border-muted-foreground/30 hover:border-muted-foreground/60">CC</button>
                    )}
                  </div>
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
              {showCcField && (
                <>
                  <div className="relative">
                    <label className="text-xs font-sans text-muted-foreground">CC</label>
                    <Input ref={composeCcRef} name="compose-cc-recipient-copy" autoComplete="new-password" data-lpignore="true" data-1p-ignore value={composeCc} onChange={e => { e.stopPropagation(); handleCcChange(e.target.value); }} onBlur={() => setTimeout(() => setShowCcSuggestions(false), 200)} placeholder="cc@example.com" className="rounded-xl" />
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
                    <label className="text-xs font-sans text-muted-foreground">BCC</label>
                    <Input ref={composeBccRef} name="compose-bcc-recipient-hidden" autoComplete="new-password" data-lpignore="true" data-1p-ignore value={composeBcc} onChange={e => { e.stopPropagation(); setComposeBcc(e.target.value); }} placeholder="bcc@example.com" className="rounded-xl" />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-sans text-muted-foreground">Subject</label>
                <Input value={composeSubject} onChange={e => setComposeSubject(e.target.value)} className="rounded-xl" />
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden py-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-sans text-muted-foreground">Templates:</span>
                <button
                  type="button"
                  className="px-2.5 py-1 text-[11px] font-sans font-medium rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors border border-blue-200"
                  onClick={() => {
                    const proofText = `See attached proof. Let me know if approved for film. Remember to print it out as "actual size" and not "to scale" or "fit to page". After putting it up against the bottle/jar, please make sure to check all the text, spacing, and colors to make sure everything is correct. Once proof is approved and film is made, it cannot be altered.`;
                    if (composeBodyRef.current) composeBodyRef.current.innerHTML = proofText;
                    else setComposeBody(proofText);
                    if (!composeSubject.trim()) setComposeSubject("Artwork Proof");
                  }}
                >Proof Approval</button>
                <button
                  type="button"
                  className="px-2.5 py-1 text-[11px] font-sans font-medium rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors border border-emerald-200"
                  onClick={() => {
                    const orderText = `I just sent the invoice over via QuickBooks. Please see ACH information below.\n\nACH Information:\nThread Bank\nContainer and Deco Solutions\nAccount# 200000014846\nRouting# 064209588\n\nPlease let us know when you initiate the ACH transfer so we can keep an eye out for it.`;
                    const htmlText = orderText.replace(/\n/g, "<br>");
                    if (composeBodyRef.current) composeBodyRef.current.innerHTML = htmlText;
                    else setComposeBody(htmlText);
                    if (!composeSubject.trim()) setComposeSubject("Order Complete");
                  }}
                >Order Complete</button>
              </div>
              <label className="text-xs font-sans text-muted-foreground">Body</label>
              <FormattingToolbar />
              <div ref={composeBodyRef} contentEditable suppressContentEditableWarning
                className="text-sm font-sans rounded-xl border bg-background p-3 min-h-[260px] flex-1 overflow-y-auto focus:outline-none focus:ring-2 focus:ring-ring email-html-content max-w-none"
                dangerouslySetInnerHTML={{ __html: composeBody }} />
            </div>
            <div className="shrink-0 border-t bg-background pt-3">
              <AttachmentPicker files={composeAttachments} onChange={setComposeAttachments} />
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background pt-3">
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
