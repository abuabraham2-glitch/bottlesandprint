import { useState } from "react";
import { Call, useUpdateCall } from "@/lib/emailData";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Loader2, Plus, X, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface OutboundCallDrawerProps {
  call: Call | null;
  open: boolean;
  onClose: () => void;
}

export function OutboundCallDrawer({ call, open, onClose }: OutboundCallDrawerProps) {
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [dismissingIdx, setDismissingIdx] = useState<number | null>(null);
  const [addingIdx, setAddingIdx] = useState<number | null>(null);
  const queryClient = useQueryClient();

  if (!call) return null;

  const actionItems: string[] = Array.isArray(call.action_items)
    ? (call.action_items as string[])
    : [];

  const handleAddTodo = async (item: string, idx: number) => {
    setAddingIdx(idx);
    try {
      const { error } = await supabase.from("dashboard_todos").insert({ text: item } as any);
      if (error) throw error;
      toast.success("Added to to-do list");
      queryClient.invalidateQueries({ queryKey: ["dashboard_todos"] });
    } catch {
      toast.error("Failed to add to-do");
    } finally {
      setAddingIdx(null);
    }
  };

  const handleDismissItem = async (idx: number) => {
    setDismissingIdx(idx);
    try {
      const updated = actionItems.filter((_, i) => i !== idx);
      const { error } = await supabase
        .from("calls")
        .update({ action_items: updated } as any)
        .eq("id", call.id);
      if (error) throw error;
      // Update local state via refetch
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      toast.success("Action item dismissed");
    } catch {
      toast.error("Failed to dismiss item");
    } finally {
      setDismissingIdx(null);
    }
  };

  const handleCreateDraft = async () => {
    setCreatingDraft(true);
    try {
      const res = await fetch("https://bottlesandprint.app.n8n.cloud/webhook/generate-call-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caller_name: call.caller_name,
          company_name: call.company_name,
          email: call.email,
          call_reason: call.summary,
          quote_details: call.quote_details,
          summary: call.summary,
          call_id: call.id,
        }),
      });
      if (!res.ok) throw new Error("Webhook failed");
      toast.success("Draft created — check your inbox.");
      queryClient.invalidateQueries({ queryKey: ["calls"] });
      onClose();
    } catch {
      toast.error("Failed to create draft");
    } finally {
      setCreatingDraft(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={o => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[50vw] p-0 flex flex-col h-full">
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b shrink-0">
          <SheetTitle className="font-serif text-lg">
            {call.caller_name || "Unknown Caller"}
          </SheetTitle>
          {call.company_name && (
            <p className="text-sm text-muted-foreground font-sans">{call.company_name}</p>
          )}
          <div className="flex items-center gap-4 mt-1">
            {call.phone_number && (
              <span className="flex items-center gap-1 text-xs text-primary font-sans">
                <Phone size={12} /> {call.phone_number}
              </span>
            )}
            {call.email && (
              <span className="flex items-center gap-1 text-xs text-primary font-sans">
                <Mail size={12} /> {call.email}
              </span>
            )}
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary */}
          {call.summary && (
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 font-sans">Summary</h3>
              <p className="text-sm text-foreground/90 font-sans whitespace-pre-wrap">{call.summary}</p>
            </div>
          )}

          {/* Action Items */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 font-sans flex items-center gap-1.5">
              <ListChecks size={14} /> Action Items
            </h3>
            {actionItems.length === 0 ? (
              <p className="text-sm text-muted-foreground font-sans italic">No action items.</p>
            ) : (
              <div className="space-y-2">
                {actionItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 bg-muted/40 rounded-lg p-3"
                  >
                    <p className="flex-1 text-sm font-sans">{item}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-7 px-2 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                      disabled={addingIdx === idx}
                      onClick={() => handleAddTodo(item, idx)}
                    >
                      {addingIdx === idx ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Add
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      disabled={dismissingIdx === idx}
                      onClick={() => handleDismissItem(idx)}
                    >
                      {dismissingIdx === idx ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-4 border-t shrink-0">
          <Button
            className="w-full rounded-xl gap-2"
            disabled={creatingDraft}
            onClick={handleCreateDraft}
          >
            {creatingDraft ? <Loader2 size={16} className="animate-spin" /> : null}
            Create Draft
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}