import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Types
export interface Client {
  id: string;
  company: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  form_signed: boolean;
  archived: boolean;
  created_at: string;
}

export interface Order {
  id: string;
  client_id: string;
  item_name: string;
  bottle_type: string | null;
  bottle_size: string | null;
  material: string | null;
  bottle_color: string | null;
  num_colors: number | null;
  print_colors: string | null;
  quantity: number | null;
  packing: string | null;
  pass: number;
  stage: string;
  checklist_new_client_form: boolean;
  checklist_artwork_in: boolean;
  checklist_proof_approved: boolean;
  checklist_purchase_order: boolean;
  checklist_bottles: boolean;
  checklist_art_order_logged: boolean;
  client_po: string | null;
  vendor_po: string | null;
  invoiced: boolean;
  invoice_num: string | null;
  paid: boolean;
  pay_method: string | null;
  pay_date: string | null;
  shipped: boolean;
  ship_date: string | null;
  outgoing_bol: string | null;
  bol_signed: boolean;
  date_entered: string;
  due_date: string | null;
  notes: string | null;
  archived: boolean;
  created_at: string;
  clients?: Client;
}

export interface CatalogItem {
  id: string;
  client_id: string;
  product_name: string;
  size: string | null;
  component: string | null;
  material: string | null;
  container_color: string | null;
  num_colors: number | null;
  print_colors: string | null;
  first_run: string | null;
  last_run: string | null;
  archived: boolean;
  created_at: string;
  clients?: Client;
}

export interface OrderDocument {
  id: string;
  order_id: string;
  file_name: string;
  file_type: string | null;
  file_url: string;
  uploaded_at: string;
}

export interface ArchivedOrder {
  id: string;
  year: string | null;
  month: string | null;
  client_company: string | null;
  description: string | null;
  size: string | null;
  quantity: number | null;
  pass: number | null;
  comments: string | null;
  date_completed: string | null;
  original_order_id: string | null;
}

// Hooks
export function useClients(includeArchived = false) {
  return useQuery({
    queryKey: ["clients", includeArchived],
    queryFn: async () => {
      let query = supabase.from("clients").select("*").order("company");
      if (!includeArchived) query = query.eq("archived", false);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Client[];
    },
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Client;
    },
    enabled: !!id,
  });
}

export function useOrders(includeArchived = false) {
  return useQuery({
    queryKey: ["orders", includeArchived],
    queryFn: async () => {
      let query = supabase.from("orders").select("*, clients(*)").order("created_at", { ascending: false });
      if (!includeArchived) query = query.eq("archived", false);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Order[];
    },
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, clients(*)").eq("id", id).single();
      if (error) throw error;
      return data as unknown as Order;
    },
    enabled: !!id,
  });
}

export function useCatalog(clientId?: string) {
  return useQuery({
    queryKey: ["catalog", clientId],
    queryFn: async () => {
      let query = supabase.from("catalog").select("*, clients(*)").eq("archived", false).order("product_name");
      if (clientId) query = query.eq("client_id", clientId);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as CatalogItem[];
    },
  });
}

export function useOrderDocuments(orderId: string) {
  return useQuery({
    queryKey: ["order_documents", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_documents").select("*").eq("order_id", orderId).order("uploaded_at", { ascending: false });
      if (error) throw error;
      return data as OrderDocument[];
    },
    enabled: !!orderId,
  });
}

export function useArchivedOrders(year?: string) {
  return useQuery({
    queryKey: ["archived_orders", year],
    queryFn: async () => {
      let query = supabase.from("archived_orders").select("*").order("date_completed", { ascending: false });
      if (year) query = query.eq("year", year);
      const { data, error } = await query;
      if (error) throw error;
      return data as ArchivedOrder[];
    },
  });
}

// Mutations
export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: Partial<Client>) => {
      const { data, error } = await supabase.from("clients").insert(client as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase.from("clients").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (clientId: string) => {
      // Delete associated catalog items first
      await supabase.from("catalog").delete().eq("client_id", clientId);
      const { error } = await supabase.from("clients").delete().eq("id", clientId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: Partial<Order>) => {
      const { data, error } = await supabase.from("orders").insert(order as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orders"] }),
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Order> & { id: string }) => {
      const { data, error } = await supabase.from("orders").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", vars.id] });
    },
  });
}

export function useCreateCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: Partial<CatalogItem>) => {
      const { data, error } = await supabase.from("catalog").insert(item as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useUpdateCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CatalogItem> & { id: string }) => {
      const { data, error } = await supabase.from("catalog").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useDeleteCatalogItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("catalog").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog"] }),
  });
}

export function useArchiveOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: Order) => {
      const now = new Date();
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const archived = {
        year: now.getFullYear().toString(),
        month: monthNames[now.getMonth()],
        client_company: order.clients?.company || "",
        description: order.item_name,
        size: order.bottle_size,
        quantity: order.quantity,
        pass: order.pass,
        comments: order.notes,
        date_completed: now.toISOString().split("T")[0],
        original_order_id: order.id,
      };
      const { error: archiveError } = await supabase.from("archived_orders").insert(archived);
      if (archiveError) throw archiveError;
      const { error: updateError } = await supabase.from("orders").update({ archived: true }).eq("id", order.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["archived_orders"] });
    },
  });
}

export function useUploadDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orderId, file, fileType }: { orderId: string; file: File; fileType: string }) => {
      const filePath = `${orderId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("order-documents").upload(filePath, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("order-documents").getPublicUrl(filePath);
      const { error: dbError } = await supabase.from("order_documents").insert({
        order_id: orderId,
        file_name: file.name,
        file_type: fileType,
        file_url: urlData.publicUrl,
      });
      if (dbError) throw dbError;
    },
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["order_documents", vars.orderId] }),
  });
}

export function useRenameDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file_name, orderId }: { id: string; file_name: string; orderId: string }) => {
      const { error } = await supabase.from("order_documents").update({ file_name }).eq("id", id);
      if (error) throw error;
      return orderId;
    },
    onSuccess: (orderId) => qc.invalidateQueries({ queryKey: ["order_documents", orderId] }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, orderId, file_url }: { id: string; orderId: string; file_url: string }) => {
      const urlParts = file_url.split("/order-documents/");
      if (urlParts.length > 1) {
        const storagePath = decodeURIComponent(urlParts[1]);
        await supabase.storage.from("order-documents").remove([storagePath]);
      }
      const { error } = await supabase.from("order_documents").delete().eq("id", id);
      if (error) throw error;
      return orderId;
    },
    onSuccess: (orderId) => qc.invalidateQueries({ queryKey: ["order_documents", orderId] }),
  });
}

export async function getNextBolNumber(): Promise<string> {
  // Use the settings table for atomic BOL numbering
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "next_bol_number")
    .single();

  if (error || !data) {
    // Fallback: scan orders table
    const { data: orders } = await supabase
      .from("orders")
      .select("outgoing_bol")
      .not("outgoing_bol", "is", null)
      .order("outgoing_bol", { ascending: false });
    let maxNum = 1177;
    for (const row of orders || []) {
      const num = parseInt(row.outgoing_bol || "0", 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
    return (maxNum + 1).toString();
  }

  const currentNum = parseInt(data.value, 10);
  // Increment the sequence
  await supabase
    .from("settings")
    .update({ value: (currentNum + 1).toString() })
    .eq("key", "next_bol_number");

  return currentNum.toString();
}

export async function autoCreateCatalogEntry(order: Partial<Order>, clientId: string) {
  const { data: existing } = await supabase
    .from("catalog")
    .select("id")
    .eq("client_id", clientId)
    .eq("product_name", order.item_name || "")
    .limit(1);

  if (existing && existing.length > 0) return;

  const now = new Date();
  const monthYear = `${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`;

  await supabase.from("catalog").insert({
    client_id: clientId,
    product_name: order.item_name || "",
    size: order.bottle_size || null,
    component: order.bottle_type || null,
    material: order.material || null,
    container_color: order.bottle_color || null,
    num_colors: order.num_colors || null,
    print_colors: order.print_colors || null,
    first_run: monthYear,
    last_run: monthYear,
  });
}

export async function updateCatalogLastRun(clientId: string, itemName: string) {
  const now = new Date();
  const monthYear = `${now.toLocaleString("en-US", { month: "long" })} ${now.getFullYear()}`;

  const { data: items } = await supabase
    .from("catalog")
    .select("id")
    .eq("client_id", clientId)
    .eq("product_name", itemName)
    .limit(1);

  if (items && items.length > 0) {
    await supabase.from("catalog").update({ last_run: monthYear }).eq("id", items[0].id);
  }
}
