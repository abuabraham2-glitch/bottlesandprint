// Helpers for multi-party thread visibility.
//
// "Abu" is treated as a single identity across his three known addresses,
// case-insensitive, and is always excluded from contributor counts/snippets.

export const ABU_EMAILS: Set<string> = new Set([
  "abu@bottlesandprint.com",
  "info@bottlesandprint.com",
  "abuabraham2@gmail.com",
]);

export function isAbuEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ABU_EMAILS.has(email.trim().toLowerCase());
}

export function isInboundMessage(email: {
  direction?: string | null;
  from_email?: string | null;
}): boolean {
  const dir = email.direction?.toLowerCase();
  if (dir === "inbound") return true;
  if (dir == null) return !isAbuEmail(email.from_email);
  return false;
}

type ThreadEmail = {
  id?: string;
  from_email?: string | null;
  from_name?: string | null;
  body?: string | null;
  is_read?: boolean | null;
  original_sent_at?: string | null;
  created_at?: string | null;
};

export function getContributorCount(threadEmails: ThreadEmail[]): number {
  const set = new Set<string>();
  for (const e of threadEmails || []) {
    const fe = e.from_email;
    if (!fe) continue;
    if (isAbuEmail(fe)) continue;
    set.add(fe.trim().toLowerCase());
  }
  return set.size;
}

export function extractFirstName(
  from_name: string | null | undefined,
  from_email: string | null | undefined,
): string {
  if (from_name && !from_name.includes("@")) {
    const tokens = from_name.trim().split(/[\s,]+/).filter(Boolean);
    if (tokens.length > 0) return tokens[0];
  }
  if (from_email && from_email.length > 0) {
    const at = from_email.indexOf("@");
    return at > 0 ? from_email.slice(0, at) : from_email;
  }
  return "Unknown";
}

export function extractSnippet(body: string | null | undefined, maxLength = 65): string {
  if (!body) return "";
  let t = body;
  // strip style/script blocks
  t = t.replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ");
  // strip remaining tags
  t = t.replace(/<[^>]+>/g, " ");
  // decode entities
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // strip quoted-reply blocks
  t = t.replace(/On .+ wrote:[\s\S]*$/, "");
  t = t.replace(/^From:[\s\S]*$/m, "");
  t = t.replace(/-----Original Message-----[\s\S]*$/i, "");
  t = t.replace(/_{5,}[\s\S]*$/, "");
  // strip signatures
  t = t.replace(/\n-{2,}[\s\S]*$/, "");
  t = t.replace(/\n(Thanks|Best|Regards|Sincerely|Cheers|Thank you|Thx)[\s\S]*$/i, "");
  // collapse whitespace
  t = t.replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxLength) return t;
  let cut = t.slice(0, maxLength);
  const sixtyPct = Math.floor(maxLength * 0.6);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > sixtyPct) cut = cut.slice(0, lastSpace);
  return cut + "…";
}

function getMsgTime(e: ThreadEmail): number {
  return new Date(e.original_sent_at || e.created_at || 0).getTime();
}

export function getShownContributorMessages<T extends ThreadEmail>(
  threadEmails: T[],
  cap = 3,
): T[] {
  const nonAbu = (threadEmails || []).filter((e) => !isAbuEmail(e.from_email));
  // Group by lowercased email, keep latest
  const latestByEmail = new Map<string, T>();
  for (const e of nonAbu) {
    const key = (e.from_email || "").trim().toLowerCase();
    if (!key) continue;
    const cur = latestByEmail.get(key);
    if (!cur || getMsgTime(e) > getMsgTime(cur)) latestByEmail.set(key, e);
  }
  // Sort DESC by time, take top cap, reverse to chronological
  const arr = Array.from(latestByEmail.values()).sort((a, b) => getMsgTime(b) - getMsgTime(a));
  return arr.slice(0, cap).reverse();
}

export function getOverflowContributorFirstNames<T extends ThreadEmail>(
  threadEmails: T[],
  shownMessages: T[],
): string[] {
  const shownEmails = new Set(
    shownMessages.map((m) => (m.from_email || "").trim().toLowerCase()).filter(Boolean),
  );
  const latestByEmail = new Map<string, T>();
  for (const e of threadEmails || []) {
    if (isAbuEmail(e.from_email)) continue;
    const key = (e.from_email || "").trim().toLowerCase();
    if (!key || shownEmails.has(key)) continue;
    const cur = latestByEmail.get(key);
    if (!cur || getMsgTime(e) > getMsgTime(cur)) latestByEmail.set(key, e);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of latestByEmail.values()) {
    const name = extractFirstName(e.from_name, e.from_email);
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
