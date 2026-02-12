export const STAGES = [
  { key: "preflight", label: "Pre-Flight", description: "Checking off requirements", color: "bg-blue-500" },
  { key: "wip", label: "W.I.P.", description: "Work in progress at vendor", color: "bg-amber-500" },
  { key: "completed", label: "Completed", description: "Done — awaiting invoice", color: "bg-green-500" },
  { key: "to_ship", label: "To Ship", description: "Invoiced — ready to ship", color: "bg-purple-500" },
  { key: "close", label: "Close", description: "Shipped — awaiting payment", color: "bg-stone-500" },
] as const;

export const STAGE_KEYS = STAGES.map(s => s.key);

export const BOTTLE_TYPES = ["Bottle", "Jar", "Packer", "Dropper Bottle", "Tube"];
export const MATERIALS = ["HDPE", "Glass", "PET", "PP"];
export const COLORS = ["White", "Clear", "Amber", "Black"];
export const DOC_TYPES = ["Client PO", "Invoice", "Signed BOL", "Approved Proof", "Incoming BOL", "Other"];

export const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"
];

export function getStageBadgeClass(stage: string) {
  const map: Record<string, string> = {
    preflight: "stage-badge-preflight",
    wip: "stage-badge-wip",
    completed: "stage-badge-completed",
    to_ship: "stage-badge-to_ship",
    close: "stage-badge-close",
  };
  return map[stage] || "";
}

export function getStageLabel(stage: string) {
  return STAGES.find(s => s.key === stage)?.label || stage;
}

export function checklistCount(order: { checklist_new_client_form: boolean; checklist_artwork_in: boolean; checklist_proof_approved: boolean; checklist_purchase_order: boolean; checklist_bottles: boolean; checklist_art_order_logged: boolean }) {
  return [
    order.checklist_new_client_form,
    order.checklist_artwork_in,
    order.checklist_proof_approved,
    order.checklist_purchase_order,
    order.checklist_bottles,
    order.checklist_art_order_logged,
  ].filter(Boolean).length;
}

export function daysUntilDue(dueDate: string | null) {
  if (!dueDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysSinceCreated(dateEntered: string) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const entered = new Date(dateEntered);
  entered.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - entered.getTime()) / (1000 * 60 * 60 * 24));
}

export function generateInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `INV-${y}${m}-${rand}`;
}

export function formatAddress(street?: string | null, city?: string | null, state?: string | null, zip?: string | null) {
  const line1 = street || "";
  const parts = [city, state].filter(Boolean).join(", ");
  const line2 = [parts, zip].filter(Boolean).join(" ");
  if (!line1 && !line2) return null;
  return [line1, line2].filter(Boolean).join("\n");
}

/** Format a date string as M/D/YY (no leading zeros) */
export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + (dateStr.length === 10 ? "T00:00:00" : ""));
  if (isNaN(d.getTime())) return dateStr;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const y = d.getFullYear().toString().slice(-2);
  return `${m}/${day}/${y}`;
}
