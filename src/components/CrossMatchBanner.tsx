import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const SALES_CALL_CATEGORIES = ["SALES_NEW", "SALES_FOLLOWUP", "CALLBACK_REQUEST"];

const bannerStyle: React.CSSProperties = {
  backgroundColor: "#EFF6FF",
  borderLeft: "3px solid #3B82F6",
  padding: "12px 16px",
  borderRadius: "6px",
  fontSize: "14px",
  marginBottom: "16px",
  cursor: "pointer",
  fontFamily: "sans-serif",
  transition: "background-color 0.15s",
};

const bannerHoverBg = "#DBEAFE";

/**
 * Banner shown in Call detail when matching emails exist within 7 days.
 */
export function CallCrossMatchBanner({
  call,
  onNavigateToEmail,
}: {
  call: { id: string; email?: string | null; cross_match_note?: string | null; created_at?: string | null; category?: string | null };
  onNavigateToEmail?: (emailId: string) => void;
}) {
  const [matchingEmails, setMatchingEmails] = useState<{ id: string; created_at: string; subject: string | null }[]>([]);
  const [hover, setHover] = useState(false);
  const navigate = useNavigate();

  const isSalesCall = call.category && SALES_CALL_CATEGORIES.includes(call.category);

  useEffect(() => {
    if (!call.email || !call.created_at || !isSalesCall) return;
    const callDate = new Date(call.created_at);
    const from = new Date(callDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(callDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    supabase
      .from("emails")
      .select("id, created_at, subject, category")
      .eq("from_email", call.email)
      .gte("created_at", from)
      .lte("created_at", to)
      .eq("category", "SALES")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMatchingEmails(data as any);
      });
  }, [call.id, call.email, call.created_at, isSalesCall]);

  if (!isSalesCall) return null;

  const hasCrossNote = call.cross_match_note && call.cross_match_note.trim() !== "";
  const hasLiveMatches = matchingEmails.length > 0;

  if (!hasCrossNote && !hasLiveMatches) return null;

  const handleClick = () => {
    if (hasLiveMatches) {
      const mostRecent = matchingEmails[0];
      if (onNavigateToEmail) {
        onNavigateToEmail(mostRecent.id);
      }
    }
  };

  const liveText = hasLiveMatches
    ? (() => {
        const most = matchingEmails[0];
        const dateStr = most.created_at ? format(new Date(most.created_at), "MMM d, yyyy") : "";
        const extra = matchingEmails.length > 1 ? ` (+${matchingEmails.length - 1} more)` : "";
        return `📧 Also emailed on ${dateStr} — Subject: ${most.subject || "(no subject)"}${extra}`;
      })()
    : null;

  return (
    <div
      style={{ ...bannerStyle, backgroundColor: hover ? bannerHoverBg : "#EFF6FF" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleClick}
    >
      {hasCrossNote && <div>{call.cross_match_note}</div>}
      {hasLiveMatches && !hasCrossNote && <div>{liveText}</div>}
      {hasLiveMatches && hasCrossNote && liveText !== call.cross_match_note && (
        <div style={{ marginTop: 4 }}>{liveText}</div>
      )}
    </div>
  );
}

/**
 * Banner shown in Email detail when matching calls exist within 7 days.
 */
export function EmailCrossMatchBanner({
  email,
  onClose,
}: {
  email: { id: string; from_email?: string | null; created_at?: string | null; category?: string | null };
  onClose?: () => void;
}) {
  const [matchingCalls, setMatchingCalls] = useState<{ id: string; created_at: string; caller_name: string | null }[]>([]);
  const [hover, setHover] = useState(false);
  const navigate = useNavigate();

  const isSalesEmail = email.category === "SALES";

  useEffect(() => {
    if (!email.from_email || !email.created_at || !isSalesEmail) return;
    const emailDate = new Date(email.created_at);
    const from = new Date(emailDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date(emailDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    supabase
      .from("calls")
      .select("id, created_at, caller_name, category")
      .eq("email", email.from_email)
      .gte("created_at", from)
      .lte("created_at", to)
      .in("category", SALES_CALL_CATEGORIES)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setMatchingCalls(data as any);
      });
  }, [email.id, email.from_email, email.created_at, isSalesEmail]);

  if (!isSalesEmail || matchingCalls.length === 0) return null;

  const mostRecent = matchingCalls[0];
  const dateStr = mostRecent.created_at ? format(new Date(mostRecent.created_at), "MMM d, yyyy") : "";

  const text =
    matchingCalls.length === 1
      ? `📞 This person also called on ${dateStr}`
      : `📞 This person also called ${matchingCalls.length} times in the last 7 days, most recently on ${dateStr}`;

  const handleClick = () => {
    if (onClose) onClose();
    navigate("/calls", { state: { openCallId: mostRecent.id } });
  };

  return (
    <div
      style={{ ...bannerStyle, backgroundColor: hover ? bannerHoverBg : "#EFF6FF" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={handleClick}
    >
      {text}
    </div>
  );
}
