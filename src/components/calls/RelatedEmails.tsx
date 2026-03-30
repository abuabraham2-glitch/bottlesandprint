import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mail } from "lucide-react";
import { format } from "date-fns";

interface RelatedEmailsProps {
  email: string | null;
  onNavigateToEmail: (emailId: string) => void;
}

export function RelatedEmails({ email, onNavigateToEmail }: RelatedEmailsProps) {
  const { data: relatedEmails = [] } = useQuery({
    queryKey: ["related-emails-for-call", email],
    queryFn: async () => {
      if (!email) return [];
      const { data, error } = await supabase
        .from("emails")
        .select("id, from_name, from_email, subject, created_at")
        .eq("from_email", email)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    enabled: !!email,
  });

  if (!relatedEmails.length) return null;

  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground mb-2 font-sans">Related Emails</h3>
      <div className="space-y-1.5">
        {relatedEmails.map((e) => (
          <button
            key={e.id}
            onClick={() => onNavigateToEmail(e.id)}
            className="w-full text-left flex items-start gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors group"
          >
            <Mail size={14} className="mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-sans">
                <span className="font-medium truncate">{e.from_name || e.from_email}</span>
                <span className="text-muted-foreground text-xs shrink-0">
                  {e.created_at ? format(new Date(e.created_at), "MMM d") : ""}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate">{e.subject || "(no subject)"}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
