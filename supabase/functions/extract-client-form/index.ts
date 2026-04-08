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

    const systemPrompt = `You are a data extraction assistant. The user will provide a client intake or new client form. Extract the following fields if present: company name, contact name, email address, phone number, mailing street address, mailing city, mailing state, mailing zip, billing street address, billing city, billing state, billing zip. Return ONLY a valid JSON object with these exact keys: company, contact_name, email, phone, street_address, city, state, zip, billing_street, billing_city, billing_state, billing_zip. If a field is not found, return an empty string for that key.`;

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
