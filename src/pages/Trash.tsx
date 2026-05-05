import { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Email } from "@/lib/emailData";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Trash2, RotateCcw, Mail } from "lucide-react";
import { toast } from "sonner";
import { displaySenderName, formatTime } from "@/components/inbox/InboxHelpers";

export default function Trash() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const loadTrash = async () => {
    setLoading(true);
    // Auto-purge emails older than 7 days
    await supabase.from("emails").delete()
      .eq("status", "deleted")
      .lt("deleted_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const { data } = await supabase.from("emails")
      .select("*")
      .eq("status", "deleted")
      .order("deleted_at", { ascending: false });
    setEmails((data || []) as unknown as Email[]);
    setLoading(false);
  };

  useEffect(() => { loadTrash(); }, []);

  const handleRestore = async (id: string) => {
    await supabase.from("emails").update({ status: "needs_response", deleted_at: null } as any).eq("id", id);
    setEmails(prev => prev.filter(e => e.id !== id));
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["inbox_counts"] });
    toast.success("Email restored");
  };

  const handlePermanentDelete = async (id: string) => {
    const { error: followUpsError } = await supabase.from("follow_ups").delete().eq("email_id", id);
    if (followUpsError) {
      console.error("follow_ups delete failed:", followUpsError);
      toast.error(followUpsError.message);
      setPermanentDeleteTarget(null);
      return;
    }
    const { error: triageError } = await supabase.from("triage_feedback").delete().eq("email_id", id);
    if (triageError) {
      console.error("triage_feedback delete failed:", triageError);
      toast.error(triageError.message);
      setPermanentDeleteTarget(null);
      return;
    }
    const { error } = await supabase.from("emails").delete().eq("id", id);
    if (error) {
      console.error("Delete failed:", error);
      toast.error(error.message);
      setPermanentDeleteTarget(null);
      return;
    }
    setEmails(prev => prev.filter(e => e.id !== id));
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["inbox_counts"] });
    toast.success("Permanently deleted");
    setPermanentDeleteTarget(null);
  };

  const handleEmptyTrash = async () => {
    if (emails.length === 0) return;
    const ids = emails.map(e => e.id);
    const count = ids.length;

    const { error: followUpsError } = await supabase.from("follow_ups").delete().in("email_id", ids);
    if (followUpsError) {
      console.error("follow_ups bulk delete failed:", followUpsError);
      toast.error(followUpsError.message);
      setEmptyConfirmOpen(false);
      return;
    }
    const { error: triageError } = await supabase.from("triage_feedback").delete().in("email_id", ids);
    if (triageError) {
      console.error("triage_feedback bulk delete failed:", triageError);
      toast.error(triageError.message);
      setEmptyConfirmOpen(false);
      return;
    }
    const { error } = await supabase.from("emails").delete().in("id", ids);
    if (error) {
      console.error("emails bulk delete failed:", error);
      toast.error(error.message);
      setEmptyConfirmOpen(false);
      return;
    }
    setEmails([]);
    queryClient.invalidateQueries({ queryKey: ["emails"] });
    queryClient.invalidateQueries({ queryKey: ["inbox_counts"] });
    toast.success(`Permanently deleted ${count} emails`);
    setEmptyConfirmOpen(false);
  };

  if (loading) return <div className="p-8 text-muted-foreground text-sm">Loading...</div>;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-serif font-normal">Trash</h1>
        {emails.length > 0 && (
          <Button size="sm" variant="destructive" className="rounded-xl text-xs gap-1" onClick={() => setEmptyConfirmOpen(true)}>
            <Trash2 size={12} /> Empty Trash
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground font-sans">Emails in trash are automatically deleted after 7 days.</p>

      {emails.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Mail size={32} className="mx-auto mb-2 opacity-50" />
          <p className="font-sans text-sm">Trash is empty.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {emails.map(email => (
            <div key={email.id} className="floating-card mb-0">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <span className="text-sm font-sans font-medium truncate w-[180px] shrink-0">
                    {displaySenderName(email.from_name, email.from_email)}
                  </span>
                  <span className="text-sm font-sans text-muted-foreground truncate flex-1">
                    {email.subject}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground font-sans whitespace-nowrap shrink-0">{formatTime(email.deleted_at || email.created_at)}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="outline" className="rounded-xl text-[10px] h-7 gap-1" onClick={() => handleRestore(email.id)}>
                    <RotateCcw size={10} /> Restore
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl text-[10px] h-7 gap-1 text-destructive hover:text-destructive" onClick={() => setPermanentDeleteTarget(email.id)}>
                    <Trash2 size={10} /> Delete
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty Trash Confirmation */}
      <AlertDialog open={emptyConfirmOpen} onOpenChange={setEmptyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty trash?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete {emails.length} email(s). Are you sure?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEmptyTrash} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete All</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={!!permanentDeleteTarget} onOpenChange={(open) => !open && setPermanentDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => permanentDeleteTarget && handlePermanentDelete(permanentDeleteTarget)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
