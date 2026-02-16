import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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

async function getNextSequenceNumber(counterName: string): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('get_next_sequence_number', { p_counter_name: counterName });
    if (error) {
      console.error("Failed to get sequence number:", error);
      return null;
    }
    return data as number;
  } catch {
    return null;
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
    const docNum = await getNextSequenceNumber('invoice');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const payload: Record<string, any> = {
      action: "create_invoice",
      company: params.company,
      description: params.description,
      quantity: params.quantity,
      client_po: params.client_po,
      unit_price: 0,
      amount: 0,
    };
    if (docNum !== null) payload.doc_number = docNum.toString();
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
    const docNum = await getNextSequenceNumber('vendor_po');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const payload: Record<string, any> = {
      action: "create_vendor_po",
      description: params.description,
      quantity: params.quantity,
      unit_price: 0,
      amount: 0,
      memo: params.memo,
    };
    if (docNum !== null) payload.doc_number = docNum.toString();
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
      docNumber = json?.PurchaseOrder?.DocNumber || json?.DocNumber;
    } catch { /* ignore parse errors */ }
    toast.success("Vendor PO draft created in QuickBooks.");
    return { ok: true, docNumber };
  } catch {
    toast.error("Failed to create Vendor PO in QuickBooks.");
    return { ok: false };
  }
}

export async function checkPaymentStatusInQB(params: {
  invoice_num: string;
}): Promise<{ ok: boolean; balance?: number }> {
  if (!params.invoice_num) {
    toast.error("No invoice number — cannot check payment status.");
    return { ok: false };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "record_payment",
        invoice_num: params.invoice_num,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      toast.error("Failed to check payment status.");
      return { ok: false };
    }
    let balance: number | undefined;
    let totalAmt: number | undefined;
    try {
      const json = await res.json();
      const invoice = json?.QueryResponse?.Invoice?.[0];
      if (invoice) {
        balance = invoice.Balance;
        totalAmt = invoice.TotalAmt;
      } else {
        // Fallback to flat structure
        balance = json?.Balance ?? json?.Invoice?.Balance;
        totalAmt = json?.TotalAmt ?? json?.Invoice?.TotalAmt;
      }
    } catch { /* ignore parse errors */ }
    if (balance !== undefined && balance === 0) {
      toast.success(`Paid in full — $${totalAmt !== undefined ? totalAmt.toFixed(2) : "N/A"}`);
      return { ok: true, balance: 0 };
    } else if (balance !== undefined && balance > 0) {
      toast.error(`Unpaid — balance: $${balance.toFixed(2)} of $${totalAmt !== undefined ? totalAmt.toFixed(2) : "N/A"}`);
      return { ok: true, balance };
    } else {
      toast.error("Could not read payment status from response.");
      return { ok: false };
    }
  } catch {
    toast.error("Failed to check payment status.");
    return { ok: false };
  }
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
