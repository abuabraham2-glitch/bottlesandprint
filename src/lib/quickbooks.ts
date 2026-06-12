import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/b6dc8d57-3e50-4b28-bb6f-0fe08bbf1dc4";
const MONEYSLATE_URL = "https://moneyslate.lovable.app/api/command-center";
const MONEYSLATE_API_KEY = "5ebd79350fd9eba9706751108ab83aec15d1b8d1c9690ba3";

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
    if (!res.ok) {
      const errorText = await res.text().catch(() => "");
      console.error("QB webhook error:", {
        status: res.status,
        statusText: res.statusText,
        body: errorText,
        payload: { ...payload, action: payload.action },
      });
    }
    return res.ok;
  } catch (err) {
    console.error("QB webhook network error:", err, { action: payload.action });
    return false;
  }
}

async function addQbTodo(text: string) {
  try {
    await supabase.from("dashboard_todos").insert({ text: `QB: ${text}` } as any);
  } catch (err) {
    console.error("Failed to add QB todo:", err);
  }
}

async function getNextSequenceNumber(counterName: string): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc("get_next_sequence_number", { p_counter_name: counterName });
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
  orders_email?: string | null;
  orders_phone?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}) {
  try {
    const ok = await postToWebhook({
      action: "create_customer",
      company: client.company,
      email: client.orders_email || "",
      phone: client.orders_phone || "",
      street: client.street_address || "",
      city: client.city || "",
      state: client.state || "",
      zip: client.zip || "",
    });
    if (ok) {
      toast.success("Client synced to QuickBooks.");
      await addQbTodo(`Sync new customer — ${client.company}`);
    } else {
      console.error("QB syncClient failed: webhook returned non-ok response", { company: client.company });
      toast.error("Failed to sync client. Please try again.");
    }
    return ok;
  } catch (err) {
    console.error("QB syncClient error:", err, { company: client.company });
    toast.error("Failed to sync client. Please try again.");
    return false;
  }
}

export async function pushInvoiceToQB(params: {
  company: string;
  client_po: string;
  items: { description: string; quantity: number }[];
}): Promise<{ ok: boolean; docNumber?: string; generatedNumber?: string }> {
  try {
    const docNum = await getNextSequenceNumber("invoice");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const payload: Record<string, any> = {
      action: "create_invoice",
      company: params.company,
      client_po: params.client_po,
      items: params.items,
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
    } catch {
      /* ignore parse errors */
    }
    toast.success("Invoice draft created in QuickBooks.");
    await addQbTodo(`Invoice created — ${params.company}`);
    return { ok: true, docNumber, generatedNumber: docNum !== null ? docNum.toString() : undefined };
  } catch {
    toast.error("Failed to push invoice to QuickBooks.");
    return { ok: false };
  }
}

export async function pushVendorPoToQB(params: {
  items: { description: string; quantity: number; memo: string }[];
}): Promise<{ ok: boolean; docNumber?: string; generatedNumber?: string }> {
  try {
    const docNum = await getNextSequenceNumber("vendor_po");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const combinedMemo = params.items.map((i) => i.memo).join(" | ");
    const payload: Record<string, any> = {
      action: "create_vendor_po",
      items: params.items,
      memo: combinedMemo,
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
    } catch {
      /* ignore parse errors */
    }
    toast.success("Vendor PO draft created in QuickBooks.");
    await addQbTodo(`Vendor PO created`);
    return { ok: true, docNumber, generatedNumber: docNum !== null ? docNum.toString() : undefined };
  } catch {
    toast.error("Failed to create Vendor PO in QuickBooks.");
    return { ok: false };
  }
}

export async function pushToMoneySlate(payload: Record<string, any>, opts?: { quiet?: boolean }): Promise<boolean> {
  const quiet = opts?.quiet === true;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(MONEYSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": MONEYSLATE_API_KEY },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    let json: any = null;
    try {
      json = await res.json();
    } catch {}
    if (res.ok && json && json.success) {
      if (!quiet) toast.success(`Also created in Money Slate (${json.invoice_number || json.po_number || "ok"})`);
      return true;
    }
    if (!quiet) toast.error(`Money Slate push failed: ${(json && json.error) || res.status}`);
    console.error("Money Slate push failed:", { status: res.status, body: json });
    return false;
  } catch (err) {
    if (!quiet) toast.error("Money Slate push failed (network).");
    console.error("Money Slate network error:", err);
    return false;
  }
}

export async function pushClientToMoneySlate(client: {
  id: string;
  company: string;
  orders_contact_name?: string | null;
  orders_email?: string | null;
  orders_phone?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  billing_street?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  ap_contact_name?: string | null;
  ap_email?: string | null;
  ap_phone?: string | null;
  archived?: boolean | null;
}) {
  return pushToMoneySlate(
    {
      action: "create_customer",
      external_id: client.id,
      company_name: client.company,
      contact_name: client.orders_contact_name || null,
      contact_email: client.orders_email || null,
      contact_phone: client.orders_phone || null,
      billing_address: {
        street: client.billing_street || null,
        city: client.billing_city || null,
        state: client.billing_state || null,
        zip: client.billing_zip || null,
      },
      shipping_address: {
        street: client.street_address || null,
        city: client.city || null,
        state: client.state || null,
        zip: client.zip || null,
      },
      ap_contact: {
        name: client.ap_contact_name || null,
        email: client.ap_email || null,
        phone: client.ap_phone || null,
      },
      archived: client.archived === true,
    },
    { quiet: true },
  );
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
