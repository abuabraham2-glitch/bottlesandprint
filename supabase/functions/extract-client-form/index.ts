import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { base64Data, mediaType } = await req.json();

    if (!base64Data || !mediaType) {
      return new Response(JSON.stringify({ error: "Missing base64Data or mediaType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    const systemPrompt = `You are a data extraction assistant. The user will provide a client intake or new client form. Extract the following fields using the label names listed. Return ONLY a valid JSON object with these exact keys — use an empty string for any field not found.

IMPORTANT RULES:
- The first or only contact person found on the form should ALWAYS go into orders_contact_name, orders_email, orders_phone (Primary Contact). Never leave Primary Contact blank if any contact name is found on the document.
- Only put someone in ap_contact_name, ap_email, ap_phone if they are explicitly labeled as AP, Accounts Payable, or Billing Contact AND are a different person from the Primary Contact.

Fields to extract:

- company: look for 'Company Name', 'Company', 'Business Name', or 'DBA'

- street_address: first line of Mailing Address

- city: city from Mailing Address

- state: state from Mailing Address

- zip: zip code from Mailing Address

- billing_street: first line of Billing Address

- billing_city: city from Billing Address

- billing_state: state from Billing Address

- billing_zip: zip from Billing Address

- orders_contact_name: The first or primary contact name found. Look for 'Contact Name', 'Name', 'Primary Contact', 'Name of Primary Contact for Orders', 'Order Contact Name'. If only one contact is listed, use it here.

- orders_phone: The phone for the primary contact

- orders_email: The email for the primary contact

- ap_contact_name: ONLY if a separate person is explicitly labeled as 'AP Contact', 'Accounts Payable Contact', 'Billing Contact', or 'Name of Primary Contact for Accounts Payable'

- ap_phone: Phone for the AP contact (only if different person)

- ap_email: Email for the AP contact (only if different person)

Return ONLY the JSON object. No explanation, no markdown, no extra text.`;

    // Determine content type for the AI message
    const isImage = mediaType.startsWith("image/");
    const contentParts: any[] = [
      {
        type: isImage ? "image_url" : "image_url",
        image_url: {
          url: `data:${mediaType};base64,${base64Data}`,
        },
      },
      {
        type: "text",
        text: "Extract the client information from this document and return ONLY valid JSON.",
      },
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: contentParts },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Gateway error:", errText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";

    // Extract JSON from the response (may be wrapped in markdown code blocks)
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }

    const extracted = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
