import { format, formatDistanceToNow, isToday } from "date-fns";
import { Email } from "@/lib/emailData";

export const CATEGORY_COLORS: Record<string, string> = {
  SALES: "bg-blue-100 text-blue-700",
  SUPPORT: "bg-green-100 text-green-700",
  SPAM: "bg-gray-100 text-gray-500",
  ORDER_UPDATE: "bg-purple-100 text-purple-700",
  UNKNOWN: "bg-muted text-muted-foreground",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  needs_response: "bg-orange-100 text-orange-700",
  approved_sent: "bg-green-100 text-green-700",
  auto_sent: "bg-green-100 text-green-700",
  resolved: "bg-gray-100 text-gray-500",
  converted: "bg-emerald-100 text-emerald-700",
};

export const SIGNATURE = `<br><br><span style="font-family: Georgia, serif; font-size: 14pt; color: #263652;">Thanks,<br><br><b>Abu Mathew Abraham</b><br><b>BOTTLES &amp; PRINT</b><br>Tel: (951) 725-1786<br><br><a href="https://www.bottlesandprint.com" style="color: #0563C1;">www.bottlesandprint.com</a></span>`;

export function splitDraftAtHr(html: string): { draftPart: string; quotedPart: string | null } {
  const hrIndex = html.search(/<hr[\s/>]/i);
  if (hrIndex === -1) return { draftPart: html, quotedPart: null };
  return { draftPart: html.substring(0, hrIndex), quotedPart: html.substring(hrIndex) };
}

export function stripN8nFooter(html: string): string {
  return html.replace(/This email was sent automatically with n8n\.?/gi, "").replace(/<p>\s*<\/p>/g, "");
}

export function getReplyAllCc(email: Email): string {
  const exclude = new Set(["abu@bottlesandprint.com"]);
  if (email.from_email) exclude.add(email.from_email.toLowerCase());
  const recipients: string[] = [];
  [email.to_recipients, email.cc_recipients, email.to_email_all, email.cc_emails].forEach(field => {
    if (!field) return;
    field.split(",").map(e => e.trim()).filter(Boolean).forEach(addr => {
      if (!exclude.has(addr.toLowerCase()) && !recipients.includes(addr.toLowerCase())) {
        recipients.push(addr);
      }
    });
  });
  return recipients.join(", ");
}

export function formatEmailBodyAsHtml(body: string): string {
  if (/<(?:div|p|br|span|table|a|b|i|strong|em|ul|ol|li|h[1-6]|img|blockquote)\b/i.test(body)) return body;
  const lines = body.split(/\r?\n/).map(line => line.replace(/^(?:>\s*)+/g, "").trimEnd()).filter(line => line !== ">" && line !== "> ");
  return `<div style="font-family: Tahoma, sans-serif; font-size: 12pt; line-height: 1.6;">${lines.join("<br>")}</div>`;
}

export function formatTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  return format(d, "MMM d");
}

export function formatTimeFull(dateStr: string | null): string {
  if (!dateStr) return "";
  return format(new Date(dateStr), "MMM d, h:mm a");
}

export function formatAge(dateStr: string | null): { text: string; color: string } {
  if (!dateStr) return { text: "", color: "" };
  const d = new Date(dateStr);
  const hoursAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60);
  const text = formatDistanceToNow(d, { addSuffix: true });
  if (hoursAgo < 24) return { text, color: "text-muted-foreground" };
  if (hoursAgo < 72) return { text, color: "text-yellow-600" };
  return { text, color: "text-red-600" };
}

export function parseAttachments(att: any): any[] {
  if (!att) return [];
  if (Array.isArray(att)) return att;
  if (typeof att === "string") {
    try { const parsed = JSON.parse(att); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}

export function parseMultiTopicCount(mta: string | null | undefined): number | null {
  if (!mta) return null;
  try {
    const parsed = JSON.parse(mta);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.length + 1;
  } catch {}
  return null;
}
