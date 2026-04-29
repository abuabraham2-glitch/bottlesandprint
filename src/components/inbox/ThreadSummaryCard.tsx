import { Loader2 } from "lucide-react";
import { useThreadSummary } from "@/hooks/useThreadSummary";

interface ThreadSummaryCardProps {
  threadId: string | null | undefined;
  messageCount: number;
}

export function ThreadSummaryCard({ threadId, messageCount }: ThreadSummaryCardProps) {
  const enabled = messageCount >= 2 && !!threadId;
  const { data, isLoading, isError } = useThreadSummary(threadId, enabled);

  if (!enabled) return null;
  if (isError) return null;

  return (
    <div className="rounded-xl border border-muted bg-muted/30 p-4">
      <div className="text-[10px] font-sans font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
        Thread summary
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm font-sans italic text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          <span>Catching up on this thread…</span>
        </div>
      ) : (
        <div className="text-sm font-sans text-foreground leading-relaxed">{data}</div>
      )}
    </div>
  );
}
