import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const WEBHOOK_URL = "https://bottlesandprint.app.n8n.cloud/webhook/email-actions";

export interface Email {
  id: string;
  gmail_id: string | null;
  thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body: string | null;
  category: string | null;
  tier: string | null;
  status: string | null;
  draft_response: string | null;
  quote_data: any;
  client_id: string | null;
  acknowledged: boolean | null;
  created_at: string | null;
  resolved_at: string | null;
  auto_sent_at: string | null;
  holding_sent_at: string | null;
  attachments: any[] | null;
  to_email_all: string | null;
  cc_emails: string | null;
  to_recipients: string | null;
  cc_recipients: string | null;
  incoming_summary: string | null;
  is_read: boolean | null;
  is_urgent: boolean | null;
  label: string | null;
  quoted_at: string | null;
  deleted_at: string | null;
}
export interface Call {
  id: string;
  caller_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  email: string | null;
  call_reason: string | null;
  category: string | null;
  quote_details: any;
  summary: string | null;
  status: string | null;
  is_urgent: boolean | null;
  is_existing_client: boolean | null;
  draft_response: string | null;
  transcript: string | null;
  created_at: string | null;
  resolved_at: string | null;
}

export interface FollowUp {
  id: string;
  email_id: string | null;
  client_email: string | null;
  client_name: string | null;
  subject: string | null;
  follow_up_number: number | null;
  scheduled_for: string | null;
  sent: boolean | null;
  cancelled: boolean | null;
  created_at: string | null;
  sent_at: string | null;
}

// Email hooks
export function useEmails(filter?: { status?: string; category?: string }) {
  return useQuery({
    queryKey: ["emails", filter],
    queryFn: async () => {
      let query = supabase.from("emails").select("*").order("created_at", { ascending: false });
      if (filter?.status) query = query.eq("status", filter.status);
      if (filter?.category) query = query.eq("category", filter.category);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Email[];
    },
  });
}

export function useActionNeededEmails() {
  return useQuery({
    queryKey: ["emails", "action_needed"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .or("status.eq.needs_response,and(status.eq.pending,tier.eq.TIER_2)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Email[];
    },
  });
}

export function useAutoHandledEmails() {
  return useQuery({
    queryKey: ["emails", "auto_handled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("*")
        .eq("status", "auto_sent")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Email[];
    },
  });
}

export function useAllEmails(category?: string) {
  return useQuery({
    queryKey: ["emails", "all", category],
    queryFn: async () => {
      let query = supabase.from("emails").select("*").order("created_at", { ascending: false });
      if (category) query = query.eq("category", category);
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Email[];
    },
  });
}

export function useUpdateEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Email> & { id: string }) => {
      const { data, error } = await supabase.from("emails").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emails"] }),
  });
}

export function useCreateEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: Partial<Email>) => {
      const { data, error } = await supabase.from("emails").insert(email as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emails"] }),
  });
}

// Calls hooks
export function useCalls(filter?: { eq?: string; neq?: string }) {
  return useQuery({
    queryKey: ["calls", filter],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let query = supabase.from("calls").select("*").neq("status", "archived").order("created_at", { ascending: false });
      if (filter?.eq) {
        query = query.eq("status", filter.eq);
        // For resolved tab, hide calls resolved more than 30 days ago
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("resolved_at", thirtyDaysAgo);
      }
      if (filter?.neq) {
        query = query.neq("status", filter.neq).gte("created_at", sevenDaysAgo);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Call[];
    },
  });
}

export function useUpdateCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Call> & { id: string }) => {
      const { data, error } = await supabase.from("calls").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["calls"] }),
  });
}

// Follow-ups hooks
export function useFollowUps() {
  return useQuery({
    queryKey: ["follow_ups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("follow_ups").select("*").order("scheduled_for", { ascending: true });
      if (error) throw error;
      return data as unknown as FollowUp[];
    },
  });
}

export function useCreateFollowUps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (followUps: Partial<FollowUp>[]) => {
      const { data, error } = await supabase.from("follow_ups").insert(followUps as any).select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["follow_ups"] }),
  });
}

// Triage feedback
export function useCreateTriageFeedback() {
  return useMutation({
    mutationFn: async (fb: { email_id: string; feedback_type: string; notes?: string }) => {
      const { data, error } = await supabase.from("triage_feedback").insert(fb as any).select().single();
      if (error) throw error;
      return data;
    },
  });
}

// Webhook helpers
export async function sendEmailViaWebhook(params: {
  to_email: string;
  subject: string;
  draft: string;
  gmail_id?: string;
  email_id?: string;
  order_id?: string;
  cc?: string;
  attachments?: { filename: string; mimeType: string; data: string }[];
  original_draft?: string;
}) {
  const { original_draft, ...rest } = params;
  const action = params.gmail_id ? "send_email" : "send_new";
  const body: any = { action, ...rest, attachments: params.attachments ?? [] };
  // Only include original_draft for send_email actions (not send_new)
  if (original_draft) body.original_draft = original_draft;
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("Failed to send email");
  return response.json();
}

export async function sendStageEmail(params: {
  to_email: string;
  to_name: string;
  subject: string;
  body_html: string;
  order_id: string;
  category: string;
}) {
  // Send via webhook
  await sendEmailViaWebhook({
    to_email: params.to_email,
    subject: params.subject,
    draft: params.body_html,
    order_id: params.order_id,
  });

  // Log in emails table
  await supabase.from("emails").insert({
    from_email: "abu@bottlesandprint.com",
    from_name: "Abu",
    subject: params.subject,
    body: params.body_html,
    category: params.category,
    status: "auto_sent",
    auto_sent_at: new Date().toISOString(),
  } as any);
}

// Dashboard counts
export function useInboxCounts() {
  return useQuery({
    queryKey: ["inbox_counts"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { count: actionNeeded } = await supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .or("status.eq.needs_response,and(status.eq.pending,tier.eq.TIER_2)");

      const { count: activeInbox } = await supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "needs_response"]);

      const { count: draftsToReview } = await supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "needs_response"])
        .not("draft_response", "is", null);

      const { count: autoHandledToday } = await supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .eq("status", "auto_sent")
        .gte("auto_sent_at", today.toISOString());

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: newCalls } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .neq("status", "resolved")
        .gte("created_at", sevenDaysAgo);

      const { count: trashCount } = await supabase
        .from("emails")
        .select("*", { count: "exact", head: true })
        .eq("status", "deleted");

      return {
        actionNeeded: actionNeeded || 0,
        activeInbox: activeInbox || 0,
        draftsToReview: draftsToReview || 0,
        autoHandledToday: autoHandledToday || 0,
        newCalls: newCalls || 0,
        trashCount: trashCount || 0,
      };
    },
  });
}

// Stage email templates
export function getCompletedStageEmail(clientName: string) {
  return {
    subject: "Your Order is Complete – Invoice & ACH Details",
    body: `Hi ${clientName},<br><br>Just wanted to let you know that your order is complete. I sent the invoice over. We kindly request that you submit payment via ACH. Here are our ACH details:<br><br><strong>Bank:</strong> Thread Bank<br><strong>Account Name:</strong> Container and Deco Solutions<br><strong>Account #:</strong> 200000014846<br><strong>Routing #:</strong> 064209588<br><br>Please let us know when you initiate the ACH transfer so we can keep an eye out for it.<br><br>Best regards,<br>Abu<br>Bottles & Print`,
  };
}

export function getShipStageEmail(clientName: string) {
  return {
    subject: "Payment Received – Arrange Pickup/Shipping",
    body: `Hi ${clientName},<br><br>Payment has been received — thank you. Please go ahead and arrange for pickup/shipping. Please send over any BOLs that we may need for the driver.<br><br>Best regards,<br>Abu<br>Bottles & Print`,
  };
}
