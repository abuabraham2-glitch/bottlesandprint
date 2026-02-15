import { toast } from "sonner";

const WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/b6dc8d57-3e50-4b28-bb6f-0fe08bbf1dc4";

async function postToWebhook(payload: Record<string, any>): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncClientToQB(client: {
  company: string;
  email?: string | null;
  phone?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  const ok = await postToWebhook({
    action: "create_customer",
    company: client.company,
    email: client.email || "",
    phone: client.phone || "",
    street: client.street_address || "",
    city: client.city || "",
    state: client.state || "",
    zip: client.zip || "",
  });
  if (ok) toast.success("Client synced to QuickBooks.");
  else toast.error("Failed to sync client. Please try again.");
  return ok;
}

export async function pushInvoiceToQB(params: {
  company: string;
  description: string;
  quantity: number;
  client_po: string;
}): Promise<{ ok: boolean; docNumber?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_invoice",
        company: params.company,
        description: params.description,
        quantity: params.quantity,
        client_po: params.client_po,
        unit_price: 0,
        amount: 0,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      toast.error("Failed to push invoice to QuickBooks.");
      return { ok: false };
    }
    let docNumber: string | undefined;
    try {
      const json = await res.json();
      docNumber = json?.DocNumber || json?.Invoice?.DocNumber;
    } catch { /* ignore parse errors */ }
    toast.success("Invoice draft created in QuickBooks.");
    return { ok: true, docNumber };
  } catch {
    toast.error("Failed to push invoice to QuickBooks.");
    return { ok: false };
  }
}

export async function pushVendorPoToQB(params: {
  description: string;
  quantity: number;
  memo: string;
}): Promise<{ ok: boolean; docNumber?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_vendor_po",
        description: params.description,
        quantity: params.quantity,
        unit_price: 0,
        amount: 0,
        memo: params.memo,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      toast.error("Failed to create Vendor PO in QuickBooks.");
      return { ok: false };
    }
    let docNumber: string | undefined;
    try {
      const json = await res.json();
      docNumber = json?.PurchaseOrder?.DocNumber;
    } catch { /* ignore parse errors */ }
    toast.success("Vendor PO draft created in QuickBooks.");
    return { ok: true, docNumber };
  } catch {
    toast.error("Failed to create Vendor PO in QuickBooks.");
    return { ok: false };
  }
}

export async function recordPaymentInQB(params: {
  invoice_num: string;
  company: string;
}) {
  const ok = await postToWebhook({
    action: "record_payment",
    invoice_num: params.invoice_num,
    company: params.company,
  });
  if (ok) toast.success("Payment recorded — check QuickBooks to confirm.");
  else toast.error("Failed to record payment.");
  return ok;
}

export function buildOrderDescription(order: {
  item_name: string;
  bottle_size?: string | null;
  material?: string | null;
  bottle_type?: string | null;
  num_colors?: number | null;
}) {
  const line1 = order.item_name;
  const detailParts = [order.bottle_size, order.material, order.bottle_type].filter(Boolean).join(" ");
  const colorPart = order.num_colors ? `${order.num_colors} color` : null;
  const line2Parts = [detailParts || null, colorPart].filter(Boolean).join(" - ");
  return line2Parts ? `${line1} ${line2Parts}` : line1;
}
