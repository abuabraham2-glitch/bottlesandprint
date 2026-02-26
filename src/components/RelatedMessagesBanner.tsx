import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface RelatedMessage {
  type: "email" | "call";
  id: string;
  from_name?: string;
  caller_name?: string;
  subject?: string;
  summary?: string;
  created_at: string;
  status?: string;
}

const bannerStyle: React.CSSProperties = {
  backgroundColor: "#FFF7ED",
  borderLeft: "3px solid #F97316",
  padding: "12px 16px",
  borderRadius: "6px",
  fontSize: "14px",
  marginBottom: "16px",
  fontFamily: "sans-serif",
};

const rowStyle: React.CSSProperties = {
  padding: "8px 0",
  borderBottom: "1px solid #FED7AA",
  cursor: "pointer",
  transition: "background-color 0.15s",
};

function StatusDot({ status }: { status?: string }) {
  const isResolved = status === "resolved" || status === "approved_sent" || status === "auto_sent" || status === "converted";
  return (
    <span
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        backgroundColor: isResolved ? "#22c55e" : "#eab308",
        marginRight: 6,
        flexShrink: 0,
      }}
    />
  );
}

export function RelatedMessagesBanner({
  relatedMessages,
  onCloseSheet,
}: {
  relatedMessages: RelatedMessage[] | null | undefined;
  onCloseSheet?: () => void;
}) {
  const navigate = useNavigate();

  if (!relatedMessages || !Array.isArray(relatedMessages) || relatedMessages.length === 0) return null;

  const pendingCount = relatedMessages.filter(
    m => m.status && !["resolved", "approved_sent", "auto_sent", "converted"].includes(m.status)
  ).length;

  const handleClick = (msg: RelatedMessage) => {
    if (onCloseSheet) onCloseSheet();
    if (msg.type === "email") {
      navigate("/inbox", { state: { openEmailId: msg.id } });
    } else {
      navigate("/calls", { state: { openCallId: msg.id } });
    }
  };

  return (
    <div style={bannerStyle}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        ⚠️ {relatedMessages.length} related message{relatedMessages.length !== 1 ? "s" : ""} in the last 14 days:
      </div>
      {relatedMessages.map((msg, i) => {
        const dateStr = msg.created_at ? format(new Date(msg.created_at), "MMM d") : "";
        const isLast = i === relatedMessages.length - 1;
        const label =
          msg.type === "email"
            ? `📧 ${dateStr} — ${msg.from_name || "Unknown"}: ${msg.subject || "(no subject)"}`
            : `📞 ${dateStr} — ${msg.caller_name || "Unknown"}: ${msg.summary || "(no summary)"}`;

        return (
          <div
            key={msg.id}
            style={{ ...rowStyle, borderBottom: isLast ? "none" : rowStyle.borderBottom }}
            onClick={() => handleClick(msg)}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#FFF1E0")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            <StatusDot status={msg.status} />
            <span>{label}</span>
          </div>
        );
      })}
      {pendingCount >= 2 && (
        <div style={{ marginTop: 8, fontSize: 13, color: "#92400e" }}>
          💡 Respond to the most recent message only
        </div>
      )}
    </div>
  );
}
