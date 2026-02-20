// Supabase Edge Function: generate-proof
// Deploy this at: supabase/functions/generate-proof/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      artworkBase64,   // base64 string of the client's PDF file (raw file bytes)
      cropRegion,      // { x, y, width, height } as 0-1 percentages. null = no crop
      width,           // artwork width in inches (string or number)
      height,          // artwork height in inches
      colors,          // color string e.g. "Black & PMS 9186"
      numFilms,        // number of films (integer)
    } = await req.json();

    // Decode the artwork PDF
    const artworkBytes = Uint8Array.from(atob(artworkBase64), c => c.charCodeAt(0));

    // Load the client artwork PDF — throwOnInvalidObject:false tolerates minor PDF quirks
    const clientPdfDoc = await PDFDocument.load(artworkBytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
    });
    const clientPage = clientPdfDoc.getPages()[0];
    const clientW = clientPage.getWidth();
    const clientH = clientPage.getHeight();

    // Ensure the page has a Contents stream — pdf-lib refuses to embed pages without one
    // deno-lint-ignore no-explicit-any
    if (!(clientPage.node as any).Contents()) {
      const emptyStream = clientPdfDoc.context.stream(new Uint8Array(0));
      const emptyRef = clientPdfDoc.context.register(emptyStream);
      // deno-lint-ignore no-explicit-any
      (clientPage.node as any).set(clientPdfDoc.context.obj("Contents"), emptyRef);
    }

    // Apply crop by setting MediaBox and CropBox on the source page
    const crop = cropRegion || { x: 0, y: 0, width: 1, height: 1 };
    const cropX = crop.x * clientW;
    const cropY = (1 - crop.y - crop.height) * clientH;
    const cropW = crop.width * clientW;
    const cropH = crop.height * clientH;
    clientPage.setMediaBox(cropX, cropY, cropW, cropH);
    clientPage.setCropBox(cropX, cropY, cropW, cropH);

    // Build the proof document
    const proofDoc = await PDFDocument.create();
    const page = proofDoc.addPage([792, 612]); // landscape letter in points
    const pageW = 792;
    const pageH = 612;
    const margin = 20;

    // Embed the (cropped) client artwork page
    const [embeddedArt] = await proofDoc.embedPages([clientPage]);
    const artW = embeddedArt.width;
    const artH = embeddedArt.height;

    // Artwork box
    const boxX = margin;
    const boxH = Math.floor(pageH * 0.65);
    const boxY = pageH - margin - boxH;
    const boxW = pageW - margin * 2;

    // Scale artwork to fit box maintaining aspect ratio
    const artAspect = artW / artH;
    const boxAspect = boxW / boxH;
    let drawW, drawH;
    if (artAspect > boxAspect) {
      drawW = boxW - 16;
      drawH = drawW / artAspect;
    } else {
      drawH = boxH - 16;
      drawW = drawH * artAspect;
    }
    const artX = boxX + (boxW - drawW) / 2;
    const artY = boxY + (boxH - drawH) / 2;

    // Draw the vector artwork
    page.drawPage(embeddedArt, { x: artX, y: artY, width: drawW, height: drawH });

    // Box border
    const black = rgb(0, 0, 0);
    const red = rgb(0.86, 0.15, 0.15);

    page.drawRectangle({
      x: boxX, y: boxY, width: boxW, height: boxH,
      borderColor: black, borderWidth: 0.75,
      color: undefined,
    });

    // Crop marks
    const mk = 10; const gp = 5;
    const ln = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: black });
    ln(boxX-gp-mk, boxY+boxH, boxX-gp, boxY+boxH);
    ln(boxX, boxY+boxH+gp, boxX, boxY+boxH+gp+mk);
    ln(boxX+boxW+gp, boxY+boxH, boxX+boxW+gp+mk, boxY+boxH);
    ln(boxX+boxW, boxY+boxH+gp, boxX+boxW, boxY+boxH+gp+mk);
    ln(boxX-gp-mk, boxY, boxX-gp, boxY);
    ln(boxX, boxY-gp-mk, boxX, boxY-gp);
    ln(boxX+boxW+gp, boxY, boxX+boxW+gp+mk, boxY);
    ln(boxX+boxW, boxY-gp-mk, boxX+boxW, boxY-gp);

    // Fonts
    const helvetica = await proofDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await proofDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaBoldOblique = await proofDoc.embedFont(StandardFonts.HelveticaBoldOblique);
    const timesItalic = await proofDoc.embedFont(StandardFonts.TimesRomanItalic);

    // Bottom section starts just below artwork box
    const btY = boxY - 16;
    const leftW = pageW * 0.57;
    const rightX = margin + leftW + 10;
    const rightCX = rightX + (pageW - margin - rightX) / 2;

    const wrap = (text: string, maxW: number, font: typeof helvetica, size: number): string[] => {
      const words = text.split(" ");
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? cur + " " + w : w;
        if (font.widthOfTextAtSize(test, size) > maxW) {
          if (cur) lines.push(cur);
          cur = w;
        } else cur = test;
      }
      if (cur) lines.push(cur);
      return lines;
    };

    const txt = (text: string, x: number, y: number, font: typeof helvetica, size: number, color: ReturnType<typeof rgb>) =>
      page.drawText(text, { x, y, font, size, color });

    const ctr = (text: string, cx: number, y: number, font: typeof helvetica, size: number, color: ReturnType<typeof rgb>) => {
      const w = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: cx - w / 2, y, font, size, color });
    };

    let cy = btY;
    txt("Approval For Attached Job For Film Output", margin, cy, helveticaBold, 8.5, black); cy -= 11;
    txt("Sign & Email Back This Proof", margin, cy, helveticaBoldOblique, 8.5, black); cy -= 11;
    txt("Review & carefully proofread Artwork.", margin, cy, helvetica, 7, red); cy -= 9;

    const p1 = wrap("Please check that artwork is set to the correct size, fonts (outlined), and PMS color(s) above and will fit (bottle, jar, gallon, ect.) properly and will be suitable to the Silkscreener's specifications. We will not be responsible for any artwork that is not set to size or does not meet the required specifications for printing.", leftW - 10, helvetica, 7);
    for (const l of p1) { txt(l, margin, cy, helvetica, 7, black); cy -= 8; }

    txt("Artwork that you send is what you will receive on film.", margin, cy, helvetica, 7, red); cy -= 9;

    const p2 = wrap("We will not accept liability for any errors overlooked at this stage of proofing. Any changes from your previously approved copy will be charged extra according to both time and materials. I understand that by signing this proof, I am authorizing to output film from the artwork above and agree to the terms stated up above.", leftW - 10, helvetica, 7);
    for (const l of p2) { txt(l, margin, cy, helvetica, 7, black); cy -= 8; }
    cy -= 3;

    const w1 = wrap("IF CREDIT ACCOUNT HAS NOT BEEN ESTABLISHED WITH BOTTLES & PRINT, PAYMENT IN FULL WILL BE REQUIRED BEFORE FILM AND/OR ARTWORK IS PRODUCED.", leftW - 10, helveticaBold, 7);
    for (const l of w1) { txt(l, margin, cy, helveticaBold, 7, red); cy -= 8; }

    txt("FILM WILL NOT BE PRODUCED WITHOUT A SIGNATURE BY THE CUSTOMER.", margin, cy, helveticaBold, 7, black); cy -= 14;

    page.drawLine({ start: { x: margin, y: cy }, end: { x: margin + 150, y: cy }, thickness: 0.4, color: black });
    page.drawLine({ start: { x: margin + 170, y: cy }, end: { x: margin + 230, y: cy }, thickness: 0.4, color: black });
    txt("Customer Signature", margin, cy - 8, helvetica, 6.5, black);
    txt("Date", margin + 170, cy - 8, helvetica, 6.5, black);

    // Right column
    const sizeStr = `Size: ${width || "—"} x ${height || "—"} inches`;
    const colorStr = `Color: ${colors || "—"}`;
    ctr(sizeStr, rightCX, btY - 12, timesItalic, 15, black);
    ctr(colorStr, rightCX, btY - 29, timesItalic, 15, black);
    ctr("DIELINE DOES NOT PRINT", rightCX, btY - 45, timesItalic, 12, red);
    ctr(`${numFilms || 1} FILMS`, rightCX, btY - 92, helveticaBold, 48, black);

    // Serialize
    const pdfBytes = await proofDoc.save();
    const pdfBase64 = btoa(String.fromCharCode(...pdfBytes));

    return new Response(
      JSON.stringify({ success: true, pdfBase64 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
