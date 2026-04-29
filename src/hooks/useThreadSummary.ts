import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { stripN8nFooter } from "@/components/inbox/InboxHelpers";
import { format } from "date-fns";

const WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/thread-summary";

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function useThreadSummary(threadId: string | null | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: ["thread-summary", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("from_name, from_email, body, draft_response, created_at, direction")
        .eq("thread_id", threadId as string)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const messages = (data || []).map((row: any) => {
        const isOutbound = row.direction === "outbound";
        const rawBody = (isOutbound && row.draft_response) ? row.draft_response : (row.body || "");
        const cleaned = stripHtml(stripN8nFooter(rawBody));
        return {
          from: row.from_name || row.from_email || "Unknown",
          date: row.created_at ? format(new Date(row.created_at), "MMM d, yyyy") : "",
          body: cleaned,
          direction: (row.direction === "outbound" ? "outbound" : "inbound") as "inbound" | "outbound",
        };
      });

      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      if (!res.ok) throw new Error("Failed to fetch thread summary");
      const json = await res.json();
      return (json?.summary as string) || "";
    },
    enabled: !!threadId && enabled,
    staleTime: Infinity,
    gcTime: 5 * 60 * 1000,
    retry: 1,
  });

  return { data: query.data, isLoading: query.isLoading, isError: query.isError };
}
