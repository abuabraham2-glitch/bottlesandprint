import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Loader2, Download, Send, FileText, X, Crop, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

// PDF.js is loaded from CDN in index.html — accessed via window.pdfjsLib
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pdfjsLib: any;
  }
}

const SPEC_EXTRACTOR_URL =
  "https://bottlesandprint.app.n8n.cloud/webhook/proof-extract-specs";
const SEND_PROOF_URL =
  "https://bottlesandprint.app.n8n.cloud/webhook/send-proof-email";

interface Specs {
  width: string;
  height: string;
  colors: string;
  numFilms: string;
  isVector: boolean | null;
}

// Crop selection in 0-1 normalised coordinates
interface CropRect {
  x: number; // left edge (0-1)
  y: number; // top edge (0-1)
  w: number; // width (0-1)
  h: number; // height (0-1)
}

type DragHandle =
  | "move"
  | "nw" | "n" | "ne"
  | "e" | "se" | "s"
  | "sw" | "w";

const HANDLE_SIZE = 10; // px

export default function Proofs() {
  // artworkImage: lower-res preview for the on-screen HTML display
  const [artworkImage, setArtworkImage] = useState<string | null>(null);
  // artworkDataUrl: high-res (scale 4) data URL used for crisp PDF export
  const [artworkDataUrl, setArtworkDataUrl] = useState<string | null>(null);
  // rawPreviewUrl / rawHiResUrl: uncroped originals kept so Reset Crop works
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  const [rawHiResUrl, setRawHiResUrl] = useState<string | null>(null);

  const [fileName, setFileName] = useState<string>("");
  const [analyzing, setAnalyzing] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [specs, setSpecs] = useState<Specs>({
    width: "",
    height: "",
    colors: "",
    numFilms: "1",
    isVector: null,
  });
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [subject, setSubject] = useState("Artwork Proof – Please Review & Sign");

  // PDF page size in inches (from PDF.js metadata)
  const [pdfPageInches, setPdfPageInches] = useState<{ w: number; h: number } | null>(null);

  // Crop state
  const [showCrop, setShowCrop] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
  const cropContainerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    handle: DragHandle;
    startMouseX: number;
    startMouseY: number;
    startRect: CropRect;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Crop mouse events ────────────────────────────────────────────────────
  const getContainerSize = () => {
    const el = cropContainerRef.current;
    if (!el) return { w: 1, h: 1 };
    return { w: el.clientWidth, h: el.clientHeight };
  };

  const startDrag = useCallback((handle: DragHandle, e: React.MouseEvent) => {
    e.preventDefault();
    dragState.current = {
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startRect: { ...cropRect },
    };
  }, [cropRect]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const { handle, startMouseX, startMouseY, startRect } = dragState.current;
      const { w: cW, h: cH } = getContainerSize();
      const dx = (e.clientX - startMouseX) / cW;
      const dy = (e.clientY - startMouseY) / cH;

      let { x, y, w, h } = startRect;
      const MIN = 0.05;

      if (handle === "move") {
        x = Math.max(0, Math.min(1 - w, x + dx));
        y = Math.max(0, Math.min(1 - h, y + dy));
      }
      // corners
      if (handle === "nw") { x = Math.max(0, Math.min(x + w - MIN, x + dx)); y = Math.max(0, Math.min(y + h - MIN, y + dy)); w = startRect.x + startRect.w - x; h = startRect.y + startRect.h - y; }
      if (handle === "ne") { w = Math.max(MIN, Math.min(1 - x, startRect.w + dx)); y = Math.max(0, Math.min(y + h - MIN, y + dy)); h = startRect.y + startRect.h - y; }
      if (handle === "sw") { x = Math.max(0, Math.min(x + w - MIN, x + dx)); w = startRect.x + startRect.w - x; h = Math.max(MIN, Math.min(1 - y, startRect.h + dy)); }
      if (handle === "se") { w = Math.max(MIN, Math.min(1 - x, startRect.w + dx)); h = Math.max(MIN, Math.min(1 - y, startRect.h + dy)); }
      // edges
      if (handle === "n") { y = Math.max(0, Math.min(y + h - MIN, y + dy)); h = startRect.y + startRect.h - y; }
      if (handle === "s") { h = Math.max(MIN, Math.min(1 - y, startRect.h + dy)); }
      if (handle === "w") { x = Math.max(0, Math.min(x + w - MIN, x + dx)); w = startRect.x + startRect.w - x; }
      if (handle === "e") { w = Math.max(MIN, Math.min(1 - x, startRect.w + dx)); }

      setCropRect({ x, y, w, h });
    };

    const onUp = () => { dragState.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Real-time crop dimensions in inches
  const cropDimensions = pdfPageInches
    ? {
        w: parseFloat((cropRect.w * pdfPageInches.w).toFixed(3)),
        h: parseFloat((cropRect.h * pdfPageInches.h).toFixed(3)),
      }
    : null;

  // ── Apply crop ───────────────────────────────────────────────────────────
  const applyCrop = useCallback(() => {
    if (!rawPreviewUrl || !rawHiResUrl) return;

    const cropImage = (src: string, scale: number): Promise<string> =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const srcW = img.naturalWidth;
          const srcH = img.naturalHeight;
          const cx = Math.round(cropRect.x * srcW);
          const cy = Math.round(cropRect.y * srcH);
          const cw = Math.round(cropRect.w * srcW);
          const ch = Math.round(cropRect.h * srcH);
          const canvas = document.createElement("canvas");
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);
          resolve(canvas.toDataURL("image/png"));
        };
        img.src = src;
      });

    Promise.all([cropImage(rawPreviewUrl, 2), cropImage(rawHiResUrl, 4)]).then(
      ([preview, hiRes]) => {
        setArtworkImage(preview);
        setArtworkDataUrl(hiRes);

        // Update dimensions from crop selection
        if (pdfPageInches) {
          const wIn = parseFloat((cropRect.w * pdfPageInches.w).toFixed(3));
          const hIn = parseFloat((cropRect.h * pdfPageInches.h).toFixed(3));
          setSpecs((s) => ({ ...s, width: String(wIn), height: String(hIn) }));
        }

        setShowCrop(false);
      }
    );
  }, [rawPreviewUrl, rawHiResUrl, cropRect, pdfPageInches]);

  const resetCrop = useCallback(() => {
    // Restore originals and reopen crop UI
    if (rawPreviewUrl) setArtworkImage(rawPreviewUrl);
    if (rawHiResUrl) setArtworkDataUrl(rawHiResUrl);
    // Reset dims to full PDF page
    if (pdfPageInches) {
      setSpecs((s) => ({
        ...s,
        width: String(pdfPageInches.w),
        height: String(pdfPageInches.h),
      }));
    }
    setCropRect({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
    setShowCrop(true);
  }, [rawPreviewUrl, rawHiResUrl, pdfPageInches]);

  // ── File processing ──────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    const isValidFile =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".ai") ||
      file.type === "application/illustrator" ||
      file.type === "application/postscript";

    if (!isValidFile) {
      toast({ title: "Please upload a PDF or AI file.", variant: "destructive" });
      return;
    }
    setFileName(file.name);
    setArtworkImage(null);
    setArtworkDataUrl(null);
    setRawPreviewUrl(null);
    setRawHiResUrl(null);
    setShowCrop(false);

    try {
      const buffer = await file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const lib = window.pdfjsLib;
      if (!lib) throw new Error("PDF.js not loaded");
      const loadingTask = lib.getDocument({ data: uint8 });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);

      // Read actual page dimensions from PDF metadata (stored in points, divide by 72 for inches)
      const defaultViewport = page.getViewport({ scale: 1.0 });
      const widthInches = parseFloat((defaultViewport.width / 72).toFixed(3));
      const heightInches = parseFloat((defaultViewport.height / 72).toFixed(3));
      setPdfPageInches({ w: widthInches, h: heightInches });
      setSpecs((s) => ({ ...s, width: String(widthInches), height: String(heightInches) }));

      // Scale 2 for on-screen preview
      const viewport2 = page.getViewport({ scale: 2 });
      const canvas2 = document.createElement("canvas");
      canvas2.width = viewport2.width;
      canvas2.height = viewport2.height;
      await page.render({ canvasContext: canvas2.getContext("2d"), viewport: viewport2 }).promise;
      const previewUrl = canvas2.toDataURL("image/png");

      // Scale 4 for crisp PDF export
      const viewport4 = page.getViewport({ scale: 4 });
      const canvas4 = document.createElement("canvas");
      canvas4.width = viewport4.width;
      canvas4.height = viewport4.height;
      await page.render({ canvasContext: canvas4.getContext("2d"), viewport: viewport4 }).promise;
      const hiResUrl = canvas4.toDataURL("image/png");

      // Keep originals for reset
      setRawPreviewUrl(previewUrl);
      setRawHiResUrl(hiResUrl);

      // Show crop UI before placing into proof
      setArtworkImage(previewUrl);
      setArtworkDataUrl(hiResUrl);
      setCropRect({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
      setShowCrop(true);

      // Strip prefix — send only raw base64 for AI spec extraction
      const rawBase64 = previewUrl.replace("data:image/png;base64,", "");

      setAnalyzing(true);
      try {
        const res = await fetch(SPEC_EXTRACTOR_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: rawBase64, mediaType: "image/png" }),
        });
        if (!res.ok) throw new Error("Bad response");
        const data = await res.json();
        // Only update colors/films from webhook — dimensions already set from PDF metadata
        setSpecs((s) => ({
          ...s,
          colors: Array.isArray(data.colors)
            ? data.colors.join(" & ")
            : String(data.colors ?? s.colors),
          numFilms: String(data.numColors ?? data.numFilms ?? s.numFilms),
          isVector: data.isVector ?? s.isVector,
        }));
      } catch {
        toast({
          title: "Could not auto-read colors. Please fill in manually.",
          variant: "destructive",
        });
      } finally {
        setAnalyzing(false);
      }
    } catch (err) {
      console.error("PDF error:", err);
      const isAi = file.name.toLowerCase().endsWith(".ai");
      toast({
        title: isAi
          ? "Could not read this AI file. Try saving it as PDF from Illustrator (File → Save As → PDF) and uploading that instead."
          : "Failed to read PDF. Make sure the file is a valid PDF and try again.",
        variant: "destructive",
      });
    }
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = () => setDragging(false);

  const handleRemove = () => {
    setArtworkImage(null);
    setArtworkDataUrl(null);
    setRawPreviewUrl(null);
    setRawHiResUrl(null);
    setFileName("");
    setShowCrop(false);
    setPdfPageInches(null);
    setSpecs({ width: "", height: "", colors: "", numFilms: "1", isVector: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // numFilms display: always show at least "1"
  const numFilmsDisplay = specs.numFilms && specs.numFilms !== "0" ? specs.numFilms : "1";

  /**
   * Build the entire proof PDF programmatically using jsPDF.
   * No html2canvas — artwork is drawn from the high-res canvas data URL.
   */
  const generateProofPdf = (): jsPDF => {
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
    const pageW = 792;
    const pageH = 612;
    const margin = 20;

    // ARTWORK BOX — takes up 68% of page height
    const boxX = margin;
    const boxY = margin;
    const boxW = pageW - margin * 2;
    const boxH = Math.floor(pageH * 0.68);

    // Draw artwork image directly from the high-res canvas
    if (artworkDataUrl) {
      const tempImg = new Image();
      tempImg.src = artworkDataUrl;
      const imgW = tempImg.naturalWidth || 800;
      const imgH = tempImg.naturalHeight || 600;
      const imgAspect = imgW / imgH;
      const boxAspect = boxW / boxH;
      let drawW: number, drawH: number;
      if (imgAspect > boxAspect) {
        drawW = boxW - 16;
        drawH = drawW / imgAspect;
      } else {
        drawH = boxH - 16;
        drawW = drawH * imgAspect;
      }
      const imgX = boxX + (boxW - drawW) / 2;
      const imgY = boxY + (boxH - drawH) / 2;
      doc.addImage(artworkDataUrl, "PNG", imgX, imgY, drawW, drawH, undefined, "NONE");
    }

    // Box border — draw AFTER image so it's on top
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.75);
    doc.rect(boxX, boxY, boxW, boxH);

    // Crop marks at corners
    const mk = 10;
    const gp = 5;
    doc.setLineWidth(0.5);
    // TL
    doc.line(boxX - gp - mk, boxY, boxX - gp, boxY);
    doc.line(boxX, boxY - gp - mk, boxX, boxY - gp);
    // TR
    doc.line(boxX + boxW + gp, boxY, boxX + boxW + gp + mk, boxY);
    doc.line(boxX + boxW, boxY - gp - mk, boxX + boxW, boxY - gp);
    // BL
    doc.line(boxX - gp - mk, boxY + boxH, boxX - gp, boxY + boxH);
    doc.line(boxX, boxY + boxH + gp, boxX, boxY + boxH + gp + mk);
    // BR
    doc.line(boxX + boxW + gp, boxY + boxH, boxX + boxW + gp + mk, boxY + boxH);
    doc.line(boxX + boxW, boxY + boxH + gp, boxX + boxW, boxY + boxH + gp + mk);

    // BOTTOM SECTION
    const btY = boxY + boxH + 16;
    const leftW = pageW * 0.57;
    const rightX = margin + leftW + 12;
    const rightW = pageW - margin - rightX;
    const rightCX = rightX + rightW / 2;

    // --- LEFT COLUMN ---
    let cy = btY;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text("Approval For Attached Job For Film Output", margin, cy);
    cy += 11;

    doc.setFont("helvetica", "bolditalic");
    doc.text("Sign & Email Back This Proof", margin, cy);
    cy += 10;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(220, 38, 38);
    doc.text("Review & carefully proofread Artwork.", margin, cy);
    cy += 9;

    doc.setTextColor(0, 0, 0);
    const p1 =
      "Please check that artwork is set to the correct size, fonts (outlined), and PMS color(s) above and will fit (bottle, jar, gallon, ect.) properly and will be suitable to the Silkscreener\u2019s specifications. We will not be responsible for any artwork that is not set to size or does not meet the required specifications for printing.";
    const l1 = doc.splitTextToSize(p1, leftW - 8);
    doc.text(l1, margin, cy);
    cy += l1.length * 7.5;

    doc.setTextColor(220, 38, 38);
    doc.text("Artwork that you send is what you will receive on film.", margin, cy);
    cy += 9;

    doc.setTextColor(0, 0, 0);
    const p2 =
      "We will not accept liability for any errors overlooked at this stage of proofing. Any changes from your previously approved copy will be charged extra according to both time and materials. I understand that by signing this proof, I am authorizing to output film from the artwork above and agree to the terms stated up above.";
    const l2 = doc.splitTextToSize(p2, leftW - 8);
    doc.text(l2, margin, cy);
    cy += l2.length * 7.5 + 4;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(220, 38, 38);
    const w1 = doc.splitTextToSize(
      "IF CREDIT ACCOUNT HAS NOT BEEN ESTABLISHED WITH BOTTLES & PRINT, PAYMENT IN FULL WILL BE REQUIRED BEFORE FILM AND/OR ARTWORK IS PRODUCED.",
      leftW - 8
    );
    doc.text(w1, margin, cy);
    cy += w1.length * 7.5 + 2;

    doc.setTextColor(0, 0, 0);
    doc.text("FILM WILL NOT BE PRODUCED WITHOUT A SIGNATURE BY THE CUSTOMER.", margin, cy);
    cy += 14;

    // Signature line
    doc.setLineWidth(0.4);
    doc.line(margin, cy, margin + 150, cy);
    doc.line(margin + 170, cy, margin + 230, cy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.text("Customer Signature", margin, cy + 7);
    doc.text("Date", margin + 170, cy + 7);

    // --- RIGHT COLUMN ---
    doc.setFont("times", "italic");
    doc.setFontSize(15);
    doc.setTextColor(0, 0, 0);
    const sizeText = `Size: ${specs.width || "\u2014"} x ${specs.height || "\u2014"} inches`;
    const colorText = `Color: ${specs.colors || "\u2014"}`;
    doc.text(sizeText, rightCX, btY + 14, { align: "center" });
    doc.text(colorText, rightCX, btY + 30, { align: "center" });

    doc.setFont("times", "italic");
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38);
    doc.text("DIELINE DOES NOT PRINT", rightCX, btY + 46, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(52);
    doc.setTextColor(0, 0, 0);
    doc.text(`${numFilmsDisplay} FILMS`, rightCX, btY + 95, { align: "center" });

    return doc;
  };

  const handleDownload = () => {
    try {
      const doc = generateProofPdf();
      const date = new Date().toISOString().slice(0, 10);
      const name = clientName.replace(/\s+/g, "_") || "proof";
      doc.save(`proof_${name}_${date}.pdf`);
    } catch {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const handleSend = async () => {
    if (!clientEmail) return;
    setSending(true);
    try {
      const doc = generateProofPdf();
      const pdfBase64 = doc.output("datauristring").split(",")[1];
      const res = await fetch(SEND_PROOF_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientEmail, clientName, subject, pdfBase64 }),
      });
      if (!res.ok) throw new Error("Send failed");
      toast({ title: `Proof sent to ${clientEmail}!` });
    } catch {
      toast({ title: "Failed to send proof", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // ── Crop UI helpers ──────────────────────────────────────────────────────
  // Render 8 resize handles + drag area as absolute positioned divs
  const handles: { id: DragHandle; style: React.CSSProperties }[] = [
    { id: "nw", style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: "nw-resize" } },
    { id: "n",  style: { top: -HANDLE_SIZE / 2, left: "calc(50% - 5px)", cursor: "n-resize" } },
    { id: "ne", style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: "ne-resize" } },
    { id: "e",  style: { top: "calc(50% - 5px)", right: -HANDLE_SIZE / 2, cursor: "e-resize" } },
    { id: "se", style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: "se-resize" } },
    { id: "s",  style: { bottom: -HANDLE_SIZE / 2, left: "calc(50% - 5px)", cursor: "s-resize" } },
    { id: "sw", style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: "sw-resize" } },
    { id: "w",  style: { top: "calc(50% - 5px)", left: -HANDLE_SIZE / 2, cursor: "w-resize" } },
  ];

  return (
    <div className="p-6 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-serif text-foreground">Proof Sheet Generator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Upload client artwork to generate a silk-screen printing proof.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* ── LEFT PANEL ── */}
        <div className="w-full lg:w-[40%] space-y-5">
          {/* Upload Zone */}
          <div className="floating-card space-y-4">
            <h2 className="font-semibold text-sm text-foreground">Upload Artwork</h2>

            {rawPreviewUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-border bg-muted/20">
                <img
                  src={rawPreviewUrl}
                  alt="Artwork thumbnail"
                  className="w-full h-48 object-contain bg-white"
                />
                <div className="px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground truncate">{fileName}</span>
                  <button
                    onClick={handleRemove}
                    className="flex items-center gap-1 text-xs text-destructive hover:opacity-80 shrink-0"
                  >
                    <X size={12} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                  dragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                <Upload size={28} className="text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Drop PDF or AI file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">PDF or AI files accepted</p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.ai,application/illustrator,application/postscript"
              className="hidden"
              onChange={handleFileInputChange}
            />

            {analyzing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={15} className="animate-spin" />
                Analyzing artwork…
              </div>
            )}
          </div>

          {/* ── CROP TOOL ── */}
          {showCrop && rawPreviewUrl && (
            <div className="floating-card space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                  <Crop size={14} /> Crop Artwork
                </h2>
              </div>

              {/* Crop container */}
              <div
                ref={cropContainerRef}
                className="relative rounded overflow-hidden select-none"
                style={{ userSelect: "none" }}
              >
                {/* Full artwork image */}
                <img
                  src={rawPreviewUrl}
                  alt="Crop preview"
                  className="w-full block"
                  draggable={false}
                />

                {/* Dark overlay — 4 strips around selection */}
                {/* Top strip */}
                <div
                  style={{
                    position: "absolute",
                    top: 0, left: 0, right: 0,
                    height: `${cropRect.y * 100}%`,
                    background: "rgba(0,0,0,0.5)",
                    pointerEvents: "none",
                  }}
                />
                {/* Bottom strip */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0, left: 0, right: 0,
                    height: `${(1 - cropRect.y - cropRect.h) * 100}%`,
                    background: "rgba(0,0,0,0.5)",
                    pointerEvents: "none",
                  }}
                />
                {/* Left strip */}
                <div
                  style={{
                    position: "absolute",
                    top: `${cropRect.y * 100}%`,
                    left: 0,
                    width: `${cropRect.x * 100}%`,
                    height: `${cropRect.h * 100}%`,
                    background: "rgba(0,0,0,0.5)",
                    pointerEvents: "none",
                  }}
                />
                {/* Right strip */}
                <div
                  style={{
                    position: "absolute",
                    top: `${cropRect.y * 100}%`,
                    right: 0,
                    width: `${(1 - cropRect.x - cropRect.w) * 100}%`,
                    height: `${cropRect.h * 100}%`,
                    background: "rgba(0,0,0,0.5)",
                    pointerEvents: "none",
                  }}
                />

                {/* Selection box */}
                <div
                  style={{
                    position: "absolute",
                    top: `${cropRect.y * 100}%`,
                    left: `${cropRect.x * 100}%`,
                    width: `${cropRect.w * 100}%`,
                    height: `${cropRect.h * 100}%`,
                    border: "2px solid hsl(var(--primary))",
                    boxSizing: "border-box",
                    cursor: "move",
                  }}
                  onMouseDown={(e) => startDrag("move", e)}
                >
                  {/* Rule-of-thirds grid lines */}
                  {[1, 2].map((i) => (
                    <div key={`v${i}`} style={{ position: "absolute", top: 0, bottom: 0, left: `${(i / 3) * 100}%`, width: "1px", background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
                  ))}
                  {[1, 2].map((i) => (
                    <div key={`h${i}`} style={{ position: "absolute", left: 0, right: 0, top: `${(i / 3) * 100}%`, height: "1px", background: "rgba(255,255,255,0.35)", pointerEvents: "none" }} />
                  ))}

                  {/* 8 resize handles */}
                  {handles.map(({ id, style }) => (
                    <div
                      key={id}
                      onMouseDown={(e) => { e.stopPropagation(); startDrag(id, e); }}
                      style={{
                        position: "absolute",
                        width: HANDLE_SIZE,
                        height: HANDLE_SIZE,
                        background: "white",
                        border: "2px solid hsl(var(--primary))",
                        borderRadius: 2,
                        boxSizing: "border-box",
                        ...style,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Real-time dimensions */}
              {cropDimensions && (
                <p className="text-xs text-muted-foreground text-center">
                  Selection: <strong>{cropDimensions.w}" × {cropDimensions.h}"</strong>
                </p>
              )}

              {/* Helper text */}
              <p className="text-xs text-muted-foreground/70 italic leading-snug">
                Drag the handles to select just the label artwork area. Exclude dieline marks, spec boxes, and any content outside the print area.
              </p>

              {/* Actions */}
              <Button onClick={applyCrop} className="w-full gap-2" size="sm">
                <Crop size={14} /> Apply Crop
              </Button>
            </div>
          )}

          {/* Reset Crop link — shown after crop has been applied */}
          {!showCrop && rawPreviewUrl && (
            <button
              onClick={resetCrop}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw size={12} /> Reset Crop
            </button>
          )}

          {/* Spec Fields */}
          <div className="floating-card space-y-4">
            <h2 className="font-semibold text-sm text-foreground">Specifications</h2>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Width (inches)</Label>
                <Input
                  type="number"
                  value={specs.width}
                  onChange={(e) => setSpecs((s) => ({ ...s, width: e.target.value }))}
                  placeholder="e.g. 7.5"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Height (inches)</Label>
                <Input
                  type="number"
                  value={specs.height}
                  onChange={(e) => setSpecs((s) => ({ ...s, height: e.target.value }))}
                  placeholder="e.g. 2.875"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {rawPreviewUrl && !analyzing && (!specs.width || !specs.height) && (
              <p className="text-xs" style={{ color: "#d97706" }}>
                Dimensions not found in file — please enter manually.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Colors</Label>
              <Input
                value={specs.colors}
                onChange={(e) => setSpecs((s) => ({ ...s, colors: e.target.value }))}
                placeholder="e.g. Black & PMS 9186"
                className="h-9 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Number of Films</Label>
              <Input
                type="number"
                value={specs.numFilms}
                onChange={(e) => setSpecs((s) => ({ ...s, numFilms: e.target.value }))}
                placeholder="1"
                className="h-9 text-sm"
              />
            </div>

            {specs.isVector !== null && (
              <div className="space-y-2">
                {specs.isVector ? (
                  <Badge className="bg-success text-success-foreground text-xs">
                    ✓ Vector Artwork
                  </Badge>
                ) : (
                  <>
                    <Badge variant="destructive" className="text-xs">
                      ⚠ Not Vector – Ask Client to Resubmit
                    </Badge>
                    <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs text-warning-foreground leading-relaxed">
                      This artwork may not be suitable for printing. Ask the client to provide a
                      vector-formatted AI or PDF file.
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Client Info */}
          <div className="floating-card space-y-4">
            <h2 className="font-semibold text-sm text-foreground">Client Info</h2>
            <div className="space-y-1.5">
              <Label className="text-xs">Client Name</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Jane Doe"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Client Email</Label>
              <Input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="client@example.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email Subject</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <Button onClick={handleDownload} variant="outline" className="w-full gap-2">
              <Download size={15} />
              Download Proof PDF
            </Button>
            <Button onClick={handleSend} disabled={!clientEmail || sending} className="w-full gap-2">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Send to Client
            </Button>
          </div>
        </div>

        {/* ── RIGHT PANEL — LIVE PROOF PREVIEW ── */}
        <div className="w-full lg:w-[60%]">
          <div className="floating-card p-0 overflow-hidden">
            <div className="p-3 border-b border-border flex items-center gap-2">
              <FileText size={14} className="text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Live Proof Preview</span>
            </div>
            <div className="p-4 bg-muted/30 flex justify-center overflow-x-auto">
              {/* Landscape letter-size proof sheet */}
              <div style={{ width: "100%", maxWidth: "900px" }}>
                <div
                  style={{
                    width: "900px",
                    height: "680px",
                    backgroundColor: "#ffffff",
                    boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
                    fontFamily: "Arial, Helvetica, sans-serif",
                    fontSize: "10px",
                    color: "#000000",
                    padding: "18px 24px 14px 24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0",
                    boxSizing: "border-box",
                  }}
                >
                  {/* ── SECTION 1: ARTWORK BOX (~68% of height) ── */}
                  <div style={{ position: "relative", height: "420px", flexShrink: 0 }}>
                    {/* Crop marks — TL */}
                    <div style={{ position: "absolute", top: "-8px", left: "-8px", width: "14px", height: "1px", backgroundColor: "#000" }} />
                    <div style={{ position: "absolute", top: "-8px", left: "-8px", width: "1px", height: "14px", backgroundColor: "#000" }} />
                    {/* TR */}
                    <div style={{ position: "absolute", top: "-8px", right: "-8px", width: "14px", height: "1px", backgroundColor: "#000" }} />
                    <div style={{ position: "absolute", top: "-8px", right: "-8px", width: "1px", height: "14px", backgroundColor: "#000" }} />
                    {/* BL */}
                    <div style={{ position: "absolute", bottom: "-8px", left: "-8px", width: "14px", height: "1px", backgroundColor: "#000" }} />
                    <div style={{ position: "absolute", bottom: "-8px", left: "-8px", width: "1px", height: "14px", backgroundColor: "#000" }} />
                    {/* BR */}
                    <div style={{ position: "absolute", bottom: "-8px", right: "-8px", width: "14px", height: "1px", backgroundColor: "#000" }} />
                    <div style={{ position: "absolute", bottom: "-8px", right: "-8px", width: "1px", height: "14px", backgroundColor: "#000" }} />

                    <div
                      style={{
                        border: "1px solid #000",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        backgroundColor: "#fff",
                      }}
                    >
                      {artworkImage ? (
                        <img
                          src={artworkImage}
                          alt="Artwork"
                          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                        />
                      ) : (
                        <span style={{ color: "#aaa", fontSize: "12px" }}>Artwork will appear here</span>
                      )}
                    </div>
                  </div>

                  {/* ── SECTION 2: BOTTOM TWO COLUMNS ── */}
                  <div style={{ display: "flex", gap: "0", flex: "1" }}>
                    {/* Bottom Left 60% */}
                    <div style={{ flex: "0 0 60%", fontSize: "7.5px", lineHeight: "1.45", paddingRight: "16px" }}>
                      <div style={{ fontWeight: "bold", fontSize: "11px", marginBottom: "1px", color: "#000" }}>
                        Approval For Attached Job For Film Output
                      </div>
                      <div style={{ fontWeight: "bold", fontStyle: "italic", fontSize: "11px", marginBottom: "6px", color: "#000" }}>
                        Sign &amp; Email Back This Proof
                      </div>

                      {/* Red first line */}
                      <div style={{ color: "#DC2626", fontWeight: "normal", marginBottom: "2px" }}>
                        Review &amp; carefully proofread Artwork.
                      </div>

                       {/* Black disclaimer body with red sentence */}
                       <div style={{ color: "#000", marginBottom: "4px" }}>
                         Please check that artwork is set to the correct size, fonts (outlined), and PMS color(s) above and will fit (bottle, jar, gallon, ect.) properly and will be suitable to the Silkscreener's specifications. We will not be responsible for any artwork that is not set to size or does not meet the required specifications for printing.{" "}
                         <span style={{ color: "#DC2626" }}>Artwork that you send is what you will receive on film.</span>{" "}
                         We will not accept liability for any errors overlooked at this stage of proofing. Any changes from your previously approved copy will be charged extra according to both time and materials. I understand that by signing this proof, I am authorizing to output film from the artwork above and agree to the terms stated up above.
                       </div>

                       {/* Bold warnings */}
                       <div style={{ fontWeight: "bold", color: "#DC2626", marginBottom: "2px" }}>
                         IF CREDIT ACCOUNT HAS NOT BEEN ESTABLISHED WITH BOTTLES &amp; PRINT, PAYMENT IN FULL WILL BE REQUIRED BEFORE FILM AND/OR ARTWORK IS PRODUCED.
                       </div>
                       <div style={{ fontWeight: "bold", color: "#000", marginBottom: "8px" }}>
                         FILM WILL NOT BE PRODUCED WITHOUT A SIGNATURE BY THE CUSTOMER.
                       </div>

                      {/* Horizontal rule */}
                      <div style={{ borderTop: "1px solid #000", marginBottom: "5px" }} />

                      {/* Signature line */}
                      <div style={{ color: "#000", fontSize: "8px" }}>
                        Customer Signature _________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date _______________
                      </div>
                    </div>

                    {/* Bottom Right 40% */}
                    <div
                      style={{
                        flex: "0 0 40%",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "2px",
                        paddingLeft: "16px",
                        borderLeft: "none",
                      }}
                    >
                      <div style={{ fontStyle: "italic", fontSize: "20px", fontFamily: "Georgia, serif", textAlign: "center", color: "#000", lineHeight: "1.2" }}>
                        Size: {specs.width || "—"} x {specs.height || "—"} inches
                      </div>
                      <div style={{ fontStyle: "italic", fontSize: "20px", fontFamily: "Georgia, serif", textAlign: "center", color: "#000", lineHeight: "1.2" }}>
                        Color: {specs.colors || "—"}
                      </div>
                      <div style={{ fontStyle: "italic", fontSize: "16px", fontFamily: "Georgia, serif", color: "#DC2626", textAlign: "center", lineHeight: "1.2" }}>
                        DIELINE DOES NOT PRINT
                      </div>
                      <div style={{ fontSize: "64px", fontWeight: "bold", color: "#000", textAlign: "center", lineHeight: "1", letterSpacing: "-1px", marginTop: "4px" }}>
                        {numFilmsDisplay} FILMS
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
