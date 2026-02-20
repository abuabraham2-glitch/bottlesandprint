import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Loader2, Download, Send, FileText, X, Crop, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

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
  // artworkImage: canvas render for the on-screen HTML preview
  const [artworkImage, setArtworkImage] = useState<string | null>(null);
  // artworkDataUrl: same canvas render (kept for legacy compat — not used in PDF anymore)
  const [artworkDataUrl, setArtworkDataUrl] = useState<string | null>(null);
  // rawPreviewUrl: uncropped preview kept so Reset Crop works
  const [rawPreviewUrl, setRawPreviewUrl] = useState<string | null>(null);
  // highResCanvas: the raw scale-4 canvas element — kept so we can crop at full resolution for preview
  const highResCanvasRef = useRef<HTMLCanvasElement | null>(null);
  // originalPdfBytes: the raw ArrayBuffer of the uploaded file — used for vector PDF embedding
  const [originalPdfBytes, setOriginalPdfBytes] = useState<ArrayBuffer | null>(null);
  // cropRegion: normalised 0-1 region of the PDF page to embed. Full page = {x:0,y:0,w:1,h:1}
  const [cropRegion, setCropRegion] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 1, h: 1 });

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
    if (!highResCanvasRef.current) return;

    const hiResCanvas = highResCanvasRef.current;

    // Apply crop directly to the hi-res canvas in its own pixel space (for HTML preview)
    const hx = Math.floor(cropRect.x * hiResCanvas.width);
    const hy = Math.floor(cropRect.y * hiResCanvas.height);
    const hw = Math.floor(cropRect.w * hiResCanvas.width);
    const hh = Math.floor(cropRect.h * hiResCanvas.height);
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = hw;
    cropCanvas.height = hh;
    cropCanvas.getContext("2d")!.drawImage(hiResCanvas, hx, hy, hw, hh, 0, 0, hw, hh);
    const croppedDataUrl = cropCanvas.toDataURL("image/png");

    setArtworkImage(croppedDataUrl);
    setArtworkDataUrl(croppedDataUrl);

    // Store crop region as normalised 0-1 coords — used by pdf-lib to crop the embedded vector PDF
    setCropRegion({ x: cropRect.x, y: cropRect.y, w: cropRect.w, h: cropRect.h });

    // Update dimensions from crop selection
    if (pdfPageInches) {
      const wIn = parseFloat((cropRect.w * pdfPageInches.w).toFixed(3));
      const hIn = parseFloat((cropRect.h * pdfPageInches.h).toFixed(3));
      setSpecs((s) => ({ ...s, width: String(wIn), height: String(hIn) }));
    }

    setShowCrop(false);
  }, [cropRect, pdfPageInches]);

  const resetCrop = useCallback(() => {
    if (highResCanvasRef.current) {
      const fullDataUrl = highResCanvasRef.current.toDataURL("image/png");
      setArtworkImage(fullDataUrl);
      setArtworkDataUrl(fullDataUrl);
    } else if (rawPreviewUrl) {
      setArtworkImage(rawPreviewUrl);
    }
    // Reset crop region to full page
    setCropRegion({ x: 0, y: 0, w: 1, h: 1 });
    if (pdfPageInches) {
      setSpecs((s) => ({
        ...s,
        width: String(pdfPageInches.w),
        height: String(pdfPageInches.h),
      }));
    }
    setCropRect({ x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
    setShowCrop(true);
  }, [rawPreviewUrl, pdfPageInches]);

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
    highResCanvasRef.current = null;
    setOriginalPdfBytes(null);
    setCropRegion({ x: 0, y: 0, w: 1, h: 1 });
    setShowCrop(false);

    try {
      const buffer = await file.arrayBuffer();
      // Store raw bytes for vector PDF embedding via pdf-lib
      setOriginalPdfBytes(buffer);

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

      // Scale 2 for on-screen preview (used in crop UI)
      const viewport2 = page.getViewport({ scale: 2 });
      const canvas2 = document.createElement("canvas");
      canvas2.width = viewport2.width;
      canvas2.height = viewport2.height;
      await page.render({ canvasContext: canvas2.getContext("2d"), viewport: viewport2 }).promise;
      const previewUrl = canvas2.toDataURL("image/png");

      // Scale 4 — keep the raw canvas element so we can crop for the HTML preview
      const viewport4 = page.getViewport({ scale: 4 });
      const canvas4 = document.createElement("canvas");
      canvas4.width = viewport4.width;
      canvas4.height = viewport4.height;
      await page.render({ canvasContext: canvas4.getContext("2d"), viewport: viewport4 }).promise;
      highResCanvasRef.current = canvas4;

      // Keep preview original for reset
      setRawPreviewUrl(previewUrl);

      // Show crop UI with hi-res canvas render for display
      const hiResDataUrl = canvas4.toDataURL("image/png");
      setArtworkImage(hiResDataUrl);
      setArtworkDataUrl(hiResDataUrl);
      // Default crop region = full page (no crop)
      setCropRegion({ x: 0, y: 0, w: 1, h: 1 });
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
    highResCanvasRef.current = null;
    setOriginalPdfBytes(null);
    setCropRegion({ x: 0, y: 0, w: 1, h: 1 });
    setFileName("");
    setShowCrop(false);
    setPdfPageInches(null);
    setSpecs({ width: "", height: "", colors: "", numFilms: "1", isVector: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // numFilms display: always show at least "1"
  const numFilmsDisplay = specs.numFilms && specs.numFilms !== "0" ? specs.numFilms : "1";

  /**
   * Build proof PDF using pdf-lib — embeds the original client PDF as vector data.
   * The artwork is never rasterized; only the text/layout elements around it are drawn.
   */
  const generateProofPdf = async (): Promise<Uint8Array> => {
    const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");

    const pageW = 792;
    const pageH = 612;
    const margin = 20;

    // pdf-lib y-axis: 0 = bottom of page
    const proofDoc = await PDFDocument.create();
    const page = proofDoc.addPage([pageW, pageH]);

    // ARTWORK BOX — occupies top 68% of page
    // In pdf-lib coords (y from bottom): boxY is the bottom edge of the artwork box
    const boxW = pageW - margin * 2;
    const boxH = Math.floor(pageH * 0.68);
    const boxX = margin;
    const boxYBottom = pageH - margin - boxH; // bottom edge of box in pdf-lib coords

    // ── Embed client artwork PDF ──────────────────────────────────────────
    if (originalPdfBytes) {
      try {
        const clientDoc = await PDFDocument.load(originalPdfBytes);
        const srcPage = clientDoc.getPages()[0];
        const srcW = srcPage.getWidth();
        const srcH = srcPage.getHeight();

        // Convert normalised cropRegion → points on the source page
        // pdf-lib embedPages clip box: left/bottom/right/top in source page points (y from bottom)
        const clipLeft   = cropRegion.x * srcW;
        const clipBottom = (1 - cropRegion.y - cropRegion.h) * srcH;
        const clipRight  = (cropRegion.x + cropRegion.w) * srcW;
        const clipTop    = (1 - cropRegion.y) * srcH;

        const [embedded] = await proofDoc.embedPages([srcPage], [{
          left: clipLeft,
          bottom: clipBottom,
          right: clipRight,
          top: clipTop,
        }]);

        // Scale embedded art to fit inside box maintaining aspect ratio
        const artW = embedded.width;
        const artH = embedded.height;
        const artAspect = artW / artH;
        const boxAspect = boxW / boxH;
        let drawW: number, drawH: number;
        if (artAspect > boxAspect) {
          drawW = boxW - 16;
          drawH = drawW / artAspect;
        } else {
          drawH = boxH - 16;
          drawW = drawH * artAspect;
        }
        const artX = boxX + (boxW - drawW) / 2;
        const artY = boxYBottom + (boxH - drawH) / 2;

        page.drawPage(embedded, { x: artX, y: artY, width: drawW, height: drawH });
      } catch (e) {
        console.warn("pdf-lib embed failed, skipping artwork:", e);
      }
    }

    // Box border (drawn after art so it sits on top)
    page.drawRectangle({
      x: boxX, y: boxYBottom, width: boxW, height: boxH,
      borderColor: rgb(0, 0, 0), borderWidth: 0.75,
    });

    // Crop marks
    const mk = 10; const gp = 5;
    const dl = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: rgb(0, 0, 0) });

    // TL
    dl(boxX - gp - mk, boxYBottom + boxH, boxX - gp, boxYBottom + boxH);
    dl(boxX, boxYBottom + boxH + gp, boxX, boxYBottom + boxH + gp + mk);
    // TR
    dl(boxX + boxW + gp, boxYBottom + boxH, boxX + boxW + gp + mk, boxYBottom + boxH);
    dl(boxX + boxW, boxYBottom + boxH + gp, boxX + boxW, boxYBottom + boxH + gp + mk);
    // BL
    dl(boxX - gp - mk, boxYBottom, boxX - gp, boxYBottom);
    dl(boxX, boxYBottom - gp - mk, boxX, boxYBottom - gp);
    // BR
    dl(boxX + boxW + gp, boxYBottom, boxX + boxW + gp + mk, boxYBottom);
    dl(boxX + boxW, boxYBottom - gp - mk, boxX + boxW, boxYBottom - gp);

    // ── Fonts ──────────────────────────────────────────────────────────────
    const hv     = await proofDoc.embedFont(StandardFonts.Helvetica);
    const hvBold = await proofDoc.embedFont(StandardFonts.HelveticaBold);
    const hvBI   = await proofDoc.embedFont(StandardFonts.HelveticaBoldOblique);
    const tmI    = await proofDoc.embedFont(StandardFonts.TimesRomanItalic);

    const black = rgb(0, 0, 0);
    const red   = rgb(0.863, 0.149, 0.149);

    // ── BOTTOM SECTION ────────────────────────────────────────────────────
    // btTop = y coord (from bottom) of the top of the bottom section
    const btTop = boxYBottom - 16;
    const leftW = pageW * 0.57;
    const rightX = margin + leftW + 10;
    const rightCX = rightX + (pageW - margin - rightX) / 2;

    // Text helper (pdf-lib draws from baseline)
    const dt = (text: string, x: number, y: number, font: typeof hv, size: number, color: typeof black) =>
      page.drawText(text, { x, y, font, size, color });

    // Word-wrap helper
    const wrap = (text: string, maxW: number, font: typeof hv, size: number): string[] => {
      const words = text.split(" ");
      const lines: string[] = [];
      let cur = "";
      for (const word of words) {
        const test = cur ? cur + " " + word : word;
        if (font.widthOfTextAtSize(test, size) > maxW && cur) {
          lines.push(cur); cur = word;
        } else { cur = test; }
      }
      if (cur) lines.push(cur);
      return lines;
    };

    // Draw lines top-down; ty starts at btTop and decreases
    let ty = btTop - 10;
    dt("Approval For Attached Job For Film Output", margin, ty, hvBold, 8.5, black); ty -= 11;
    dt("Sign & Email Back This Proof", margin, ty, hvBI, 8.5, black); ty -= 11;
    dt("Review & carefully proofread Artwork.", margin, ty, hv, 7, red); ty -= 9;

    const p1 = "Please check that artwork is set to the correct size, fonts (outlined), and PMS color(s) above and will fit (bottle, jar, gallon, ect.) properly and will be suitable to the Silkscreener\u2019s specifications. We will not be responsible for any artwork that is not set to size or does not meet the required specifications for printing.";
    for (const ln of wrap(p1, leftW - 10, hv, 7)) { dt(ln, margin, ty, hv, 7, black); ty -= 8; }

    dt("Artwork that you send is what you will receive on film.", margin, ty, hv, 7, red); ty -= 9;

    const p2 = "We will not accept liability for any errors overlooked at this stage of proofing. Any changes from your previously approved copy will be charged extra according to both time and materials. I understand that by signing this proof, I am authorizing to output film from the artwork above and agree to the terms stated up above.";
    for (const ln of wrap(p2, leftW - 10, hv, 7)) { dt(ln, margin, ty, hv, 7, black); ty -= 8; }

    ty -= 3;
    const w1 = "IF CREDIT ACCOUNT HAS NOT BEEN ESTABLISHED WITH BOTTLES & PRINT, PAYMENT IN FULL WILL BE REQUIRED BEFORE FILM AND/OR ARTWORK IS PRODUCED.";
    for (const ln of wrap(w1, leftW - 10, hvBold, 7)) { dt(ln, margin, ty, hvBold, 7, red); ty -= 8; }

    dt("FILM WILL NOT BE PRODUCED WITHOUT A SIGNATURE BY THE CUSTOMER.", margin, ty, hvBold, 7, black); ty -= 14;

    page.drawLine({ start: { x: margin, y: ty }, end: { x: margin + 150, y: ty }, thickness: 0.4, color: black });
    page.drawLine({ start: { x: margin + 170, y: ty }, end: { x: margin + 230, y: ty }, thickness: 0.4, color: black });
    dt("Customer Signature", margin, ty - 8, hv, 6.5, black);
    dt("Date", margin + 170, ty - 8, hv, 6.5, black);

    // ── RIGHT COLUMN ──────────────────────────────────────────────────────
    const centerText = (text: string, cx: number, y: number, font: typeof hv, size: number, color: typeof black) => {
      const w = font.widthOfTextAtSize(text, size);
      page.drawText(text, { x: cx - w / 2, y, font, size, color });
    };

    const sizeStr  = `Size: ${specs.width || "\u2014"} x ${specs.height || "\u2014"} inches`;
    const colorStr = `Color: ${specs.colors || "\u2014"}`;
    centerText(sizeStr,  rightCX, btTop - 12, tmI, 15, black);
    centerText(colorStr, rightCX, btTop - 28, tmI, 15, black);
    centerText("DIELINE DOES NOT PRINT", rightCX, btTop - 44, tmI, 12, red);
    centerText(`${numFilmsDisplay} FILMS`, rightCX, btTop - 95, hvBold, 52, black);

    return proofDoc.save();
  };

  const handleDownload = async () => {
    try {
      const bytes = await generateProofPdf();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      const name = clientName.replace(/\s+/g, "_") || "proof";
      a.download = `proof_${name}_${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const handleSend = async () => {
    if (!clientEmail) return;
    setSending(true);
    try {
      const bytes = await generateProofPdf();
      // Convert Uint8Array → base64
      let binary = "";
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const pdfBase64 = btoa(binary);
      const res = await fetch(SEND_PROOF_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientEmail, clientName, subject, pdfBase64 }),
      });
      if (!res.ok) throw new Error("Send failed");
      toast({ title: `Proof sent to ${clientEmail}!` });
    } catch (e) {
      console.error(e);
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
