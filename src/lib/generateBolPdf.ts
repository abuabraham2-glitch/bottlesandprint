import { jsPDF } from "jspdf";
import { formatDateShort } from "@/lib/constants";
import type { Order } from "@/lib/data";

interface BolOptions {
  bolNumber: string;
  carrier: string;
  order: Order;
  /** Additional orders to include in a combined BOL */
  combinedOrders?: Order[];
}

/** Extract number of cases from packing string like "2 cases @ 500/case" */
function parseCaseCount(packing: string | null): number {
  if (!packing) return 0;
  const match = packing.match(/(\d+)\s*cases?\b/i);
  return match ? parseInt(match[1], 10) : 0;
}

export function generateBolPdf({ bolNumber, carrier, order, combinedOrders }: BolOptions): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
  const pw = 612;
  const ph = 792;
  const mx = 28;
  const cw = pw - mx * 2; // content width

  const client = order.clients;
  const allOrders = combinedOrders && combinedOrders.length > 0 ? [order, ...combinedOrders] : [order];

  const rect = (x: number, yy: number, w: number, h: number) => {
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.75);
    pdf.rect(x, yy, w, h);
  };

  const bold = (text: string, x: number, yy: number, opts?: any) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(text, x, yy, opts);
    pdf.setFont("helvetica", "normal");
  };

  // Build description lines from all orders
  const descLines: { text: string; bold?: boolean }[] = [];
  if (client) descLines.push({ text: client.company.toUpperCase(), bold: true });

  // Track case counts per item
  const caseCounts: number[] = [];

  for (let oi = 0; oi < allOrders.length; oi++) {
    const o = allOrders[oi];
    if (oi > 0) descLines.push({ text: "" }); // blank separator

    descLines.push({ text: o.item_name.toUpperCase() });
    const containerParts = [o.bottle_size, o.material, o.bottle_type].filter(Boolean).map(s => s!.toUpperCase());
    if (o.num_colors) containerParts.push(`${o.num_colors} COLOR PRINT`);
    if (containerParts.length) descLines.push({ text: containerParts.join(" — ") });
    if (o.packing) descLines.push({ text: o.packing.toUpperCase() });

    caseCounts.push(parseCaseCount(o.packing));
  }

  if (order.client_po) descLines.push({ text: `PO# ${order.client_po}` });

  const totalCases = caseCounts.reduce((a, b) => a + b, 0);
  const firstCaseCount = caseCounts[0] || 0;

  // Calculate how many pages we need
  const lineH = 16;
  const maxDescLinesPerPage = 12;
  const maxDescLinesCont = 20;
  const totalDescPages = descLines.length <= maxDescLinesPerPage ? 1 :
    1 + Math.ceil((descLines.length - maxDescLinesPerPage) / maxDescLinesCont);

  for (let page = 0; page < totalDescPages; page++) {
    if (page > 0) pdf.addPage("letter");
    let y = 24;

    // ===== TOP HEADER =====
    const topHeaderH = 42;
    rect(mx, y, cw, topHeaderH);

    pdf.setFontSize(10);
    pdf.text(`Carrier: ${carrier}`, mx + 6, y + 16);

    pdf.setFontSize(14);
    bold("STRAIGHT BILL OF LADING — SHORT FORM", pw / 2, y + 16, { align: "center" });
    pdf.setFontSize(10);
    pdf.text("Original — Not Negotiable", pw / 2, y + 30, { align: "center" });

    pdf.setFontSize(14);
    bold(`BOL#: ${bolNumber}`, pw - mx - 6, y + 14, { align: "right" });
    const dateStr = formatDateShort(new Date().toISOString().split("T")[0]);
    bold(`Date: ${dateStr}`, pw - mx - 6, y + 30, { align: "right" });

    y += topHeaderH;

    if (page === 0) {
      // ===== LEGAL PARAGRAPH =====
      pdf.setFontSize(5.5);
      const legalText = "RECEIVED, subject to the classifications and tariffs in effect on the date of issue of this Original Bill of Lading, the property described below, in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as indicated below, which said carrier (the word carrier being understood throughout this contract as meaning any person or corporation in possession of the property under the contract) agrees to carry to its usual place of delivery as said destination, if on its route, otherwise to deliver to another carrier on the route to said destination. It is mutually agreed, as to each carrier of all or any of said property over all or any portion of said route to destination, and as to each party at any time interested in all or any of said property, that every service to be performed hereunder shall be subject to all the terms and conditions of the Uniform Domestic Straight Bill of Lading set forth (1) in the Uniform Freight Classification in effect on the date hereof, if this is a rail, or a rail-water shipment, or (2) in the applicable motor carrier classification or tariff if this is a motor carrier shipment. Shipper hereby certifies that he is familiar with all the terms and conditions of said bill of lading, including those on the attachment thereof, set forth in the classification or tariff which governs the transportation of this shipment, and the said terms and conditions are hereby agreed to by the shipper and accepted for himself and his assigns.";
      const legalLines = pdf.splitTextToSize(legalText, cw - 12);
      const legalH = legalLines.length * 7 + 8;
      rect(mx, y, cw, legalH);
      pdf.text(legalLines, mx + 6, y + 9);
      y += legalH;

      // ===== 2x2 GRID =====
      const halfW = cw / 2;
      const boxH = 82;

      // Top-Left: SHIPPER (FROM)
      rect(mx, y, halfW, boxH);
      pdf.setFontSize(8);
      bold("SHIPPER (FROM):", mx + 6, y + 14);
      pdf.setFontSize(11);
      bold("BOTTLES AND PRINT", mx + 6, y + 28);
      pdf.setFontSize(10);
      pdf.text("12970 BRANFORD ST.", mx + 6, y + 40);
      pdf.text("UNIT D", mx + 6, y + 52);
      pdf.text("PACOIMA, CA 91331", mx + 6, y + 64);

      // Top-Right: DELIVER TO (left blank for manual entry)
      rect(mx + halfW, y, halfW, boxH);
      pdf.setFontSize(8);
      bold("DELIVER TO:", mx + halfW + 6, y + 14);
      y += boxH;

      // Bottom-Left: CONSIGNEE (SOLD TO)
      rect(mx, y, halfW, boxH);
      pdf.setFontSize(8);
      bold("CONSIGNEE (SOLD TO):", mx + 6, y + 14);
      if (client) {
        pdf.setFontSize(11);
        bold(client.company.toUpperCase(), mx + 6, y + 28);
        pdf.setFontSize(10);
        let cy = y + 40;
        if (client.street_address) { pdf.text(client.street_address.toUpperCase(), mx + 6, cy); cy += 12; }
        const cityState = [client.city, client.state].filter(Boolean).join(", ");
        const cityStateZip = [cityState, client.zip].filter(Boolean).join(" ").toUpperCase();
        if (cityStateZip) { pdf.text(cityStateZip, mx + 6, cy); }
      }

      // Bottom-Right: PRO #
      rect(mx + halfW, y, halfW, boxH);
      pdf.setFontSize(8);
      bold("PRO #:", mx + halfW + 6, y + 14);
      y += boxH;
    }

    // ===== DESCRIPTION TABLE =====
    const col0 = 60;
    const col2 = 60;
    const col3 = 50;
    const col4 = 50;
    const col1 = cw - col0 - col2 - col3 - col4;
    const colWidths = [col0, col1, col2, col3, col4];
    const headers = ["NO. PKGS", "DESCRIPTION OF ARTICLES, KIND OF PACKAGE,\nSPECIAL MARKS AND EXCEPTIONS", "WEIGHT", "CLASS", "NMFC"];
    const headerH = 28;

    let cx = mx;
    pdf.setFontSize(7);
    for (let i = 0; i < headers.length; i++) {
      rect(cx, y, colWidths[i], headerH);
      const hLines = headers[i].split("\n");
      hLines.forEach((line, li) => {
        bold(line, cx + colWidths[i] / 2, y + 11 + li * 9, { align: "center" });
      });
      cx += colWidths[i];
    }
    y += headerH;

    // Determine which desc lines go on this page
    const startLine = page === 0 ? 0 : maxDescLinesPerPage + (page - 1) * maxDescLinesCont;
    const maxLines = page === 0 ? maxDescLinesPerPage : maxDescLinesCont;
    const pageDescLines = descLines.slice(startLine, startLine + maxLines);

    const isLastPage = page === totalDescPages - 1;

    // Calculate body height
    const sigH = isLastPage ? 120 : 0;
    const certH = isLastPage ? 90 : 0;
    const totalRowH = 36; // space reserved for TOTAL row
    const bottomReserved = sigH + certH + 20;
    const minBodyH = pageDescLines.length * lineH + 24 + (isLastPage ? totalRowH : 0);
    const bodyH = Math.max(minBodyH, ph - y - bottomReserved - mx);

    cx = mx;
    // NO. PKGS column
    rect(cx, y, colWidths[0], bodyH);
    if (page === 0) {
      pdf.setFontSize(11);
      // Show case counts for each order
      if (allOrders.length === 1) {
        if (firstCaseCount > 0) {
          pdf.text(String(firstCaseCount), cx + colWidths[0] / 2, y + 20, { align: "center" });
        }
      } else {
        let caseY = y + 20;
        for (const cc of caseCounts) {
          if (cc > 0) {
            pdf.text(String(cc), cx + colWidths[0] / 2, caseY, { align: "center" });
            caseY += lineH;
          }
        }
      }
    }
    // TOTAL at bottom of NO. PKGS column (last page only)
    if (isLastPage && totalCases > 0) {
      const totalLineY = y + bodyH - totalRowH;
      pdf.setDrawColor(0);
      pdf.setLineWidth(0.5);
      pdf.line(cx + 4, totalLineY, cx + colWidths[0] - 4, totalLineY);
      pdf.setFontSize(8);
      bold("TOTAL", cx + colWidths[0] / 2, totalLineY + 14, { align: "center" });
      pdf.setFontSize(11);
      pdf.text(String(totalCases), cx + colWidths[0] / 2, totalLineY + 28, { align: "center" });
    }
    cx += colWidths[0];

    // DESCRIPTION
    rect(cx, y, colWidths[1], bodyH);
    pdf.setFontSize(10);
    pageDescLines.forEach((line, i) => {
      if (line.bold) {
        bold(line.text, cx + 6, y + 18 + i * lineH);
      } else {
        pdf.text(line.text, cx + 6, y + 18 + i * lineH);
      }
    });
    cx += colWidths[1];

    // WEIGHT, CLASS, NMFC — empty
    for (let i = 2; i < 5; i++) {
      rect(cx, y, colWidths[i], bodyH);
      cx += colWidths[i];
    }
    y += bodyH;

    if (isLastPage) {
      const halfW = cw / 2;

      // ===== SHIPPER CERTIFICATION (left) + SPECIAL INSTRUCTIONS (right) =====
      rect(mx, y, halfW, certH);
      rect(mx + halfW, y, halfW, certH);

      pdf.setFontSize(9);
      bold("SHIPPER: BOTTLES AND PRINT", mx + 6, y + 14);
      pdf.text("Phone: 951-725-1786", mx + 6, y + 26);
      pdf.text("Email: info@bottlesandprint.com", mx + 6, y + 38);

      pdf.setFontSize(6);
      const certText = "SHIPPER'S CERTIFICATION: This is to certify that the above-named materials are properly classified, described, packaged, marked and labeled, and are in proper condition for transportation according to the applicable regulations of the Department of Transportation.";
      const certLines = pdf.splitTextToSize(certText, halfW - 14);
      pdf.text(certLines, mx + 6, y + 52);

      pdf.setFontSize(9);
      pdf.text("Per ___________________________________________", mx + 6, y + 82);

      // Right side: Special Instructions
      pdf.setFontSize(9);
      bold("Special Instructions:", mx + halfW + 6, y + 14);
      y += certH;

      // ===== SIGNATURE BLOCKS =====
      rect(mx, y, halfW, sigH);
      rect(mx + halfW, y, halfW, sigH);

      const lineLen = halfW - 14;
      const lineStartL = mx + 6;
      const lineEndL = mx + 6 + lineLen;
      const lineStartR = mx + halfW + 6;
      const lineEndR = mx + halfW + 6 + lineLen;

      pdf.setFontSize(10);
      bold(`Carrier/Driver: ${carrier.toUpperCase()}`, lineStartL, y + 14);

      pdf.setFontSize(9);
      const sigSpacing = 36;
      pdf.text("Signature:", lineStartL, y + 14 + sigSpacing);
      pdf.line(lineStartL + 50, y + 14 + sigSpacing, lineEndL, y + 14 + sigSpacing);

      pdf.text("Printed Name:", lineStartL, y + 14 + sigSpacing * 2);
      pdf.line(lineStartL + 65, y + 14 + sigSpacing * 2, lineEndL, y + 14 + sigSpacing * 2);

      pdf.text("Date:", lineStartL, y + 14 + sigSpacing * 3 - 4);
      pdf.line(lineStartL + 30, y + 14 + sigSpacing * 3 - 4, lineEndL, y + 14 + sigSpacing * 3 - 4);

      // Right — Received By
      pdf.setFontSize(10);
      bold("Received By:", lineStartR, y + 14);

      pdf.setFontSize(9);
      pdf.text("Signature:", lineStartR, y + 14 + sigSpacing);
      pdf.line(lineStartR + 50, y + 14 + sigSpacing, lineEndR, y + 14 + sigSpacing);

      pdf.text("Printed Name:", lineStartR, y + 14 + sigSpacing * 2);
      pdf.line(lineStartR + 65, y + 14 + sigSpacing * 2, lineEndR, y + 14 + sigSpacing * 2);

      pdf.text("Date:", lineStartR, y + 14 + sigSpacing * 3 - 4);
      pdf.line(lineStartR + 30, y + 14 + sigSpacing * 3 - 4, lineEndR, y + 14 + sigSpacing * 3 - 4);
    }

    // ===== PAGE NUMBER =====
    pdf.setFontSize(7);
    pdf.text(`Page: ${page + 1} of ${totalDescPages}`, pw - mx - 6, ph - 12, { align: "right" });
  }

  return pdf.output("blob");
}
