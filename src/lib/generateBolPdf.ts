import { jsPDF } from "jspdf";
import { formatDateShort } from "@/lib/constants";
import type { Order } from "@/lib/data";

interface BolOptions {
  bolNumber: string;
  carrier: string;
  order: Order;
}

export function generateBolPdf({ bolNumber, carrier, order }: BolOptions): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "letter" }); // 612 x 792
  const pw = 612;
  const mx = 36; // margin
  const cw = pw - mx * 2; // content width
  let y = 36;

  const client = order.clients;

  // Helper: draw a rect
  const rect = (x: number, y: number, w: number, h: number) => {
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.5);
    pdf.rect(x, y, w, h);
  };

  // Helper: bold text
  const bold = (text: string, x: number, yy: number, opts?: any) => {
    pdf.setFont("helvetica", "bold");
    pdf.text(text, x, yy, opts);
    pdf.setFont("helvetica", "normal");
  };

  // ===== TOP HEADER =====
  pdf.setFontSize(9);
  pdf.text(`Carrier: ${carrier}`, mx + 4, y + 12);

  pdf.setFontSize(13);
  bold("STRAIGHT BILL OF LADING — SHORT FORM", pw / 2, y + 12, { align: "center" });
  pdf.setFontSize(9);
  pdf.text("Original — Not Negotiable", pw / 2, y + 24, { align: "center" });

  pdf.setFontSize(9);
  bold(`BOL#: ${bolNumber}`, pw - mx - 4, y + 8, { align: "right" });
  const dateStr = formatDateShort(new Date().toISOString().split("T")[0]);
  pdf.text(`Date: ${dateStr}`, pw - mx - 4, y + 20, { align: "right" });

  rect(mx, y, cw, 28);
  y += 28;

  // ===== LEGAL PARAGRAPH =====
  pdf.setFontSize(5.5);
  const legalText = "RECEIVED, subject to the classifications and tariffs in effect on the date of issue of this Original Bill of Lading, the property described below, in apparent good order, except as noted (contents and condition of contents of packages unknown), marked, consigned, and destined as indicated below, which said carrier (the word carrier being understood throughout this contract as meaning any person or corporation in possession of the property under the contract) agrees to carry to its usual place of delivery as said destination, if on its route, otherwise to deliver to another carrier on the route to said destination. It is mutually agreed, as to each carrier of all or any of said property over all or any portion of said route to destination, and as to each party at any time interested in all or any of said property, that every service to be performed hereunder shall be subject to all the terms and conditions of the Uniform Domestic Straight Bill of Lading set forth (1) in the Uniform Freight Classification in effect on the date hereof, if this is a rail, or a rail-water shipment, or (2) in the applicable motor carrier classification or tariff if this is a motor carrier shipment. Shipper hereby certifies that he is familiar with all the terms and conditions of said bill of lading, including those on the attachment thereof, set forth in the classification or tariff which governs the transportation of this shipment, and the said terms and conditions are hereby agreed to by the shipper and accepted for himself and his assigns.";
  const legalLines = pdf.splitTextToSize(legalText, cw - 8);
  const legalH = legalLines.length * 7 + 6;
  rect(mx, y, cw, legalH);
  pdf.text(legalLines, mx + 4, y + 8);
  y += legalH;

  // ===== SHIPPER / CONSIGNEE TWO COLUMN =====
  const halfW = cw / 2;
  const shipH = 72;

  // Left — Shipper
  rect(mx, y, halfW, shipH);
  pdf.setFontSize(7);
  bold("SHIPPER (FROM):", mx + 4, y + 10);
  pdf.setFontSize(8);
  bold("BOTTLES AND PRINT", mx + 4, y + 22);
  pdf.text("12970 BRANFORD ST.", mx + 4, y + 32);
  pdf.text("UNIT D", mx + 4, y + 42);
  pdf.text("PACOIMA, CA 91331", mx + 4, y + 52);

  // Right — Consignee
  rect(mx + halfW, y, halfW, shipH);
  pdf.setFontSize(7);
  bold("CONSIGNEE (SOLD TO):", mx + halfW + 4, y + 10);
  pdf.setFontSize(8);
  if (client) {
    bold(client.company.toUpperCase(), mx + halfW + 4, y + 22);
    let cy = y + 32;
    if (client.street_address) { pdf.text(client.street_address.toUpperCase(), mx + halfW + 4, cy); cy += 10; }
    const cityLine = [client.city, client.state].filter(Boolean).join(", ");
    const fullLine = [cityLine, client.zip].filter(Boolean).join(" ").toUpperCase();
    if (fullLine) { pdf.text(fullLine, mx + halfW + 4, cy); }
  }
  y += shipH;

  // Deliver to + PRO#
  const delH = 32;
  rect(mx, y, halfW, delH);
  pdf.setFontSize(7);
  bold("DELIVER TO (if different from Consignee):", mx + 4, y + 10);
  pdf.text("_______________________________________", mx + 4, y + 24);

  rect(mx + halfW, y, halfW, delH);
  bold("PRO #:", mx + halfW + 4, y + 10);
  pdf.text("_______________________________________", mx + halfW + 4, y + 24);
  y += delH;

  // ===== DESCRIPTION TABLE =====
  const colWidths = [60, cw - 60 - 60 - 50 - 50, 60, 50, 50]; // NO. PKGS, DESC, WEIGHT, CLASS, NMFC
  const headers = ["NO. PKGS", "DESCRIPTION OF ARTICLES, KIND OF PACKAGE,\nSPECIAL MARKS AND EXCEPTIONS", "WEIGHT", "CLASS", "NMFC"];
  const headerH = 24;

  // Header row
  let cx = mx;
  pdf.setFontSize(6.5);
  for (let i = 0; i < headers.length; i++) {
    rect(cx, y, colWidths[i], headerH);
    const hLines = headers[i].split("\n");
    hLines.forEach((line, li) => {
      bold(line, cx + colWidths[i] / 2, y + 9 + li * 8, { align: "center" });
    });
    cx += colWidths[i];
  }
  y += headerH;

  // Build description lines
  const descLines: string[] = [];
  if (client) descLines.push(client.company.toUpperCase());

  const pkgCount = order.quantity ? order.quantity.toLocaleString() : "___";
  descLines.push(`${pkgCount} CASE ${order.item_name.toUpperCase()}`);

  const containerParts = [order.bottle_size, order.material, order.bottle_type].filter(Boolean).map(s => s!.toUpperCase());
  if (order.num_colors) containerParts.push(`${order.num_colors} COLOR PRINT`);
  if (containerParts.length) descLines.push(containerParts.join(" "));

  if (order.packing) descLines.push(order.packing.toUpperCase());
  if (order.client_po) descLines.push(`PO# ${order.client_po}`);

  const bodyH = Math.max(80, descLines.length * 12 + 20);

  // Data row
  cx = mx;
  // NO. PKGS
  rect(cx, y, colWidths[0], bodyH);
  pdf.setFontSize(9);
  pdf.text(pkgCount, cx + colWidths[0] / 2, y + 16, { align: "center" });
  cx += colWidths[0];

  // DESCRIPTION
  rect(cx, y, colWidths[1], bodyH);
  pdf.setFontSize(8);
  descLines.forEach((line, i) => {
    pdf.text(line, cx + 4, y + 14 + i * 12);
  });
  cx += colWidths[1];

  // WEIGHT, CLASS, NMFC — empty
  for (let i = 2; i < 5; i++) {
    rect(cx, y, colWidths[i], bodyH);
    cx += colWidths[i];
  }
  y += bodyH;

  // ===== SPECIAL INSTRUCTIONS =====
  const siH = 36;
  rect(mx, y, cw, siH);
  pdf.setFontSize(7);
  bold("Special Instructions:", mx + 4, y + 10);
  y += siH;

  // ===== BOTTOM SECTION =====
  const botH = 100;
  rect(mx, y, halfW, botH);
  rect(mx + halfW, y, halfW, botH);

  // Left
  pdf.setFontSize(7);
  bold("SHIPPER: BOTTLES AND PRINT", mx + 4, y + 10);
  pdf.text("Phone: 951-725-1786", mx + 4, y + 20);
  pdf.text("Email: info@bottlesandprint.com", mx + 4, y + 30);

  pdf.setFontSize(5.5);
  const certText = "SHIPPER'S CERTIFICATION: This is to certify that the above-named materials are properly classified, described, packaged, marked and labeled, and are in proper condition for transportation according to the applicable regulations of the Department of Transportation.";
  const certLines = pdf.splitTextToSize(certText, halfW - 10);
  pdf.text(certLines, mx + 4, y + 44);

  pdf.setFontSize(7);
  pdf.text("Per ___________________________________", mx + 4, y + 90);

  // Right
  pdf.setFontSize(7);
  bold("Freight charges are: N/A", mx + halfW + 4, y + 10);

  pdf.setFontSize(5.5);
  const freightText = "Subject to Section 7 of conditions of applicable bill of lading, if this shipment is to be delivered to the consignee without recourse on the consignor, the consignor shall sign the following statement: The carrier shall not make delivery of this shipment without payment of freight and all other lawful charges.";
  const freightLines = pdf.splitTextToSize(freightText, halfW - 10);
  pdf.text(freightLines, mx + halfW + 4, y + 24);

  pdf.setFontSize(7);
  pdf.text("(Signature of Consignor)", mx + halfW + 4, y + 70);
  pdf.text("____________________________________", mx + halfW + 4, y + 80);

  y += botH;

  // ===== VERY BOTTOM SIGNATURE AREA =====
  const sigH = 48;
  rect(mx, y, halfW, sigH);
  rect(mx + halfW, y, halfW, sigH);

  pdf.setFontSize(7);
  bold(`Carrier/Driver: ${carrier.toUpperCase()}`, mx + 4, y + 12);
  pdf.text("Receiving & Carrier Signatures _________________ Date _______", mx + 4, y + 26);
  pdf.text("Received by: _________________", mx + 4, y + 38);

  pdf.text("PER: _________________", mx + halfW + 4, y + 12);
  pdf.text("Page: 1 of 1", mx + halfW + 4, y + 38);

  return pdf.output("blob");
}
