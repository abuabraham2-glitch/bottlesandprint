import { jsPDF } from "jspdf";
import { formatDateShort } from "@/lib/constants";
import type { Order } from "@/lib/data";

interface BolOptions {
  bolNumber: string;
  carrier: string;
  order: Order;
}

/** Extract number of cases from packing string like "2 cases @ 500/case" */
function parseCaseCount(packing: string | null): string {
  if (!packing) return "";
  const match = packing.match(/^(\d+)\s*cases?\b/i);
  return match ? match[1] : "";
}

export function generateBolPdf({ bolNumber, carrier, order }: BolOptions): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
  const pw = 612;
  const ph = 792;
  const mx = 32;
  const cw = pw - mx * 2; // content width
  let y = 28;

  const client = order.clients;

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

  // ===== TOP HEADER =====
  const topHeaderH = 38;
  rect(mx, y, cw, topHeaderH);

  pdf.setFontSize(10);
  pdf.text(`Carrier: ${carrier}`, mx + 6, y + 15);

  pdf.setFontSize(14);
  bold("STRAIGHT BILL OF LADING — SHORT FORM", pw / 2, y + 15, { align: "center" });
  pdf.setFontSize(10);
  pdf.text("Original — Not Negotiable", pw / 2, y + 28, { align: "center" });

  pdf.setFontSize(10);
  bold(`BOL#: ${bolNumber}`, pw - mx - 6, y + 12, { align: "right" });
  const dateStr = formatDateShort(new Date().toISOString().split("T")[0]);
  pdf.text(`Date: ${dateStr}`, pw - mx - 6, y + 25, { align: "right" });

  y += topHeaderH;

  // ===== LEGAL PARAGRAPH =====
  pdf.setFontSize(5.5);
  const legalText = "RECEIVED, subject to the classifications and tariffs in effect on the date of issue of this Original Bill of Lading, the property described below, in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as indicated below, which said carrier (the word carrier being understood throughout this contract as meaning any person or corporation in possession of the property under the contract) agrees to carry to its usual place of delivery as said destination, if on its route, otherwise to deliver to another carrier on the route to said destination. It is mutually agreed, as to each carrier of all or any of said property over all or any portion of said route to destination, and as to each party at any time interested in all or any of said property, that every service to be performed hereunder shall be subject to all the terms and conditions of the Uniform Domestic Straight Bill of Lading set forth (1) in the Uniform Freight Classification in effect on the date hereof, if this is a rail, or a rail-water shipment, or (2) in the applicable motor carrier classification or tariff if this is a motor carrier shipment. Shipper hereby certifies that he is familiar with all the terms and conditions of said bill of lading, including those on the attachment thereof, set forth in the classification or tariff which governs the transportation of this shipment, and the said terms and conditions are hereby agreed to by the shipper and accepted for himself and his assigns.";
  const legalLines = pdf.splitTextToSize(legalText, cw - 12);
  const legalH = legalLines.length * 7 + 8;
  rect(mx, y, cw, legalH);
  pdf.text(legalLines, mx + 6, y + 9);
  y += legalH;

  // ===== SHIPPER / CONSIGNEE =====
  const halfW = cw / 2;
  const shipH = 82;

  // Left — Shipper
  rect(mx, y, halfW, shipH);
  pdf.setFontSize(8);
  bold("SHIPPER (FROM):", mx + 6, y + 14);
  pdf.setFontSize(11);
  bold("BOTTLES AND PRINT", mx + 6, y + 28);
  pdf.setFontSize(10);
  pdf.text("12970 BRANFORD ST.", mx + 6, y + 40);
  pdf.text("UNIT D", mx + 6, y + 52);
  pdf.text("PACOIMA, CA 91331", mx + 6, y + 64);

  // Right — Consignee
  rect(mx + halfW, y, halfW, shipH);
  pdf.setFontSize(8);
  bold("CONSIGNEE (SOLD TO):", mx + halfW + 6, y + 14);
  pdf.setFontSize(11);
  if (client) {
    bold(client.company.toUpperCase(), mx + halfW + 6, y + 28);
    pdf.setFontSize(10);
    let cy = y + 40;
    if (client.street_address) { pdf.text(client.street_address.toUpperCase(), mx + halfW + 6, cy); cy += 12; }
    const cityLine = [client.city, client.state].filter(Boolean).join(", ");
    const fullLine = [cityLine, client.zip].filter(Boolean).join(" ").toUpperCase();
    if (fullLine) { pdf.text(fullLine, mx + halfW + 6, cy); }
  }
  y += shipH;

  // ===== DELIVER TO + PRO # =====
  const delH = 60;
  rect(mx, y, halfW, delH);
  pdf.setFontSize(8);
  bold("DELIVER TO (if different from Consignee):", mx + 6, y + 14);
  // blank lines for writing
  pdf.setFontSize(10);
  pdf.setDrawColor(180);
  pdf.setLineWidth(0.3);
  for (let i = 0; i < 3; i++) {
    const ly = y + 28 + i * 12;
    pdf.line(mx + 6, ly, mx + halfW - 6, ly);
  }
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.75);

  rect(mx + halfW, y, halfW, delH);
  pdf.setFontSize(8);
  bold("PRO #:", mx + halfW + 6, y + 14);
  y += delH;

  // ===== DESCRIPTION TABLE =====
  const col0 = 60;  // NO. PKGS
  const col2 = 60;  // WEIGHT
  const col3 = 50;  // CLASS
  const col4 = 50;  // NMFC
  const col1 = cw - col0 - col2 - col3 - col4; // DESC
  const colWidths = [col0, col1, col2, col3, col4];
  const headers = ["NO. PKGS", "DESCRIPTION OF ARTICLES, KIND OF PACKAGE,\nSPECIAL MARKS AND EXCEPTIONS", "WEIGHT", "CLASS", "NMFC"];
  const headerH = 28;

  // Header row
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

  // Build description lines
  const descLines: { text: string; bold?: boolean }[] = [];
  if (client) descLines.push({ text: client.company.toUpperCase(), bold: true });
  descLines.push({ text: order.item_name.toUpperCase() });

  const containerParts = [order.bottle_size, order.material, order.bottle_type].filter(Boolean).map(s => s!.toUpperCase());
  if (order.num_colors) containerParts.push(`${order.num_colors} COLOR PRINT`);
  if (containerParts.length) descLines.push({ text: containerParts.join(" — ") });

  if (order.packing) descLines.push({ text: order.packing.toUpperCase() });
  if (order.client_po) descLines.push({ text: `PO# ${order.client_po}` });

  const caseCount = parseCaseCount(order.packing);
  const bodyH = Math.max(100, descLines.length * 14 + 24);

  // Data row
  cx = mx;

  // NO. PKGS
  rect(cx, y, colWidths[0], bodyH);
  pdf.setFontSize(11);
  pdf.text(caseCount, cx + colWidths[0] / 2, y + 20, { align: "center" });
  cx += colWidths[0];

  // DESCRIPTION
  rect(cx, y, colWidths[1], bodyH);
  pdf.setFontSize(10);
  descLines.forEach((line, i) => {
    if (line.bold) {
      bold(line.text, cx + 6, y + 18 + i * 14);
    } else {
      pdf.text(line.text, cx + 6, y + 18 + i * 14);
    }
  });
  cx += colWidths[1];

  // WEIGHT, CLASS, NMFC — empty
  for (let i = 2; i < 5; i++) {
    rect(cx, y, colWidths[i], bodyH);
    cx += colWidths[i];
  }
  y += bodyH;

  // ===== SPECIAL INSTRUCTIONS =====
  const siH = 48;
  rect(mx, y, cw, siH);
  pdf.setFontSize(8);
  bold("Special Instructions:", mx + 6, y + 14);
  y += siH;

  // ===== SHIPPER CERTIFICATION + FREIGHT =====
  const certH = 90;
  rect(mx, y, halfW, certH);
  rect(mx + halfW, y, halfW, certH);

  // Left — shipper info + certification
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

  // Right — freight
  pdf.setFontSize(9);
  bold("Freight charges are: N/A", mx + halfW + 6, y + 14);
  y += certH;

  // ===== SIGNATURE BLOCKS =====
  const sigH = 110;
  rect(mx, y, halfW, sigH);
  rect(mx + halfW, y, halfW, sigH);

  const lineLen = halfW - 14;
  const lineStartL = mx + 6;
  const lineEndL = mx + 6 + lineLen;
  const lineStartR = mx + halfW + 6;
  const lineEndR = mx + halfW + 6 + lineLen;

  pdf.setFontSize(10);

  // Left — Shipper/Carrier
  bold(`Carrier/Driver: ${carrier.toUpperCase()}`, lineStartL, y + 16);

  pdf.setFontSize(9);
  pdf.text("Signature:", lineStartL, y + 38);
  pdf.line(lineStartL + 50, y + 38, lineEndL, y + 38);

  pdf.text("Printed Name:", lineStartL, y + 62);
  pdf.line(lineStartL + 65, y + 62, lineEndL, y + 62);

  pdf.text("Date:", lineStartL, y + 86);
  pdf.line(lineStartL + 30, y + 86, lineEndL, y + 86);

  // Right — Received By
  pdf.setFontSize(10);
  bold("Received By:", lineStartR, y + 16);

  pdf.setFontSize(9);
  pdf.text("Signature:", lineStartR, y + 38);
  pdf.line(lineStartR + 50, y + 38, lineEndR, y + 38);

  pdf.text("Printed Name:", lineStartR, y + 62);
  pdf.line(lineStartR + 65, y + 62, lineEndR, y + 62);

  pdf.text("Date:", lineStartR, y + 86);
  pdf.line(lineStartR + 30, y + 86, lineEndR, y + 86);

  // ===== PAGE NUMBER — bottom right =====
  pdf.setFontSize(7);
  pdf.text("Page: 1 of 1", pw - mx - 6, ph - 16, { align: "right" });

  return pdf.output("blob");
}
