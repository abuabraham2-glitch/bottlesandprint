import { useState, useRef, useCallback } from "react";
import { Upload, Loader2, Download, Send, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import * as pdfjsLib from "pdfjs-dist";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

// Lock worker to a stable CDN build
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

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

const DISCLAIMER =
  "Review & carefully proofread Artwork. Please check that artwork is set to the correct size, fonts (outlined), and PMS color(s) above and will fit (bottle, jar, gallon, ect.) properly and will be suitable to the Silkscreener's specifications. We will not be responsible for any artwork that is not set to size or does not meet the required specifications for printing. Artwork that you send is what you will receive on film. We will not accept liability for any errors overlooked at this stage of proofing. Any changes from your previously approved copy will be charged extra according to both time and materials. I understand that by signing this proof, I am authorizing to output film from the artwork above and agree to the terms stated up above.";

export default function Proofs() {
  const [artworkImage, setArtworkImage] = useState<string | null>(null);
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
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      toast({ title: "Please upload a PDF file.", variant: "destructive" });
      return;
    }
    setFileName(file.name);

    try {
      const arrayBuffer = await file.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdf = await (pdfjsLib as any).getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.render({ canvasContext: ctx as any, viewport }).promise;

      const dataUrl = canvas.toDataURL("image/png");
      setArtworkImage(dataUrl);

      // Strip the data URI prefix — send only raw base64
      const rawBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");

      setAnalyzing(true);
      try {
        const res = await fetch(SPEC_EXTRACTOR_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: rawBase64, mediaType: "image/png" }),
        });
        if (!res.ok) throw new Error("Bad response");
        const data = await res.json();
        setSpecs({
          width: String(data.width ?? ""),
          height: String(data.height ?? ""),
          colors: Array.isArray(data.colors)
            ? data.colors.join(" & ")
            : String(data.colors ?? ""),
          numFilms: String(data.numColors ?? data.numFilms ?? "1"),
          isVector: data.isVector ?? null,
        });
      } catch {
        toast({
          title: "Could not auto-read specs. Please fill in manually.",
          variant: "destructive",
        });
      } finally {
        setAnalyzing(false);
      }
    } catch {
      toast({ title: "Failed to read PDF.", variant: "destructive" });
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
    setFileName("");
    setSpecs({ width: "", height: "", colors: "", numFilms: "1", isVector: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const captureProofBase64 = async (): Promise<string> => {
    if (!previewRef.current) throw new Error("No preview");
    const canvas = await html2canvas(previewRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    return canvas.toDataURL("image/png");
  };

  const handleDownload = async () => {
    try {
      const imgData = await captureProofBase64();
      const pdf = new jsPDF({ orientation: "landscape", unit: "in", format: "letter" });
      pdf.addImage(imgData, "PNG", 0, 0, 11, 8.5);
      const date = new Date().toISOString().slice(0, 10);
      const name = clientName.replace(/\s+/g, "_") || "proof";
      pdf.save(`proof_${name}_${date}.pdf`);
    } catch {
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    }
  };

  const handleSend = async () => {
    if (!clientEmail) return;
    setSending(true);
    try {
      const imgData = await captureProofBase64();
      const pdf = new jsPDF({ orientation: "landscape", unit: "in", format: "letter" });
      pdf.addImage(imgData, "PNG", 0, 0, 11, 8.5);
      const pdfBase64 = pdf.output("datauristring").split(",")[1];
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

  // numFilms display: always show at least "1"
  const numFilmsDisplay = specs.numFilms && specs.numFilms !== "0" ? specs.numFilms : "1";

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

            {artworkImage ? (
              /* Post-upload: thumbnail + filename + remove */
              <div className="relative rounded-xl overflow-hidden border border-border bg-muted/20">
                <img
                  src={artworkImage}
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
              /* Pre-upload: drag-and-drop zone */
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
                  <p className="text-sm text-muted-foreground">Drop PDF here or click to browse</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">PDF files only</p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
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
                  placeholder="0"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Height (inches)</Label>
                <Input
                  type="number"
                  value={specs.height}
                  onChange={(e) => setSpecs((s) => ({ ...s, height: e.target.value }))}
                  placeholder="0"
                  className="h-9 text-sm"
                />
              </div>
            </div>

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
              {/* Landscape letter-size proof sheet — scales to panel width */}
              <div style={{ width: "100%", maxWidth: "900px" }}>
              <div
                ref={previewRef}
                style={{
                  width: "900px",
                  height: "694px",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 4px 32px rgba(0,0,0,0.18)",
                  fontFamily: "Arial, Helvetica, sans-serif",
                  fontSize: "10px",
                  color: "#000000",
                  padding: "16px 22px 14px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  boxSizing: "border-box",
                }}
              >
                {/* ── SECTION 1: TOP HEADER LINE ── */}
                <div
                  style={{
                    fontSize: "10px",
                    display: "flex",
                    justifyContent: "space-between",
                    borderBottom: "1px solid #000",
                    paddingBottom: "5px",
                  }}
                >
                  <span>
                    Size: {specs.width || "—"} x {specs.height || "—"} inches&nbsp;&nbsp;&nbsp;&nbsp;
                    Color: {specs.colors || "—"}&nbsp;&nbsp;&nbsp;&nbsp;
                    DIELINE DOES NOT PRINT&nbsp;&nbsp;&nbsp;&nbsp;
                    Sign &amp; Fax Back This Proof
                  </span>
                </div>

                {/* ── SECTION 2: ARTWORK BOX ── */}
                <div style={{ position: "relative", flex: "1", margin: "6px 0" }}>
                  {/* Crop marks — TL */}
                  <div style={{ position: "absolute", top: "-8px", left: "-8px", width: "12px", height: "1px", backgroundColor: "#000" }} />
                  <div style={{ position: "absolute", top: "-8px", left: "-8px", width: "1px", height: "12px", backgroundColor: "#000" }} />
                  {/* TR */}
                  <div style={{ position: "absolute", top: "-8px", right: "-8px", width: "12px", height: "1px", backgroundColor: "#000" }} />
                  <div style={{ position: "absolute", top: "-8px", right: "-8px", width: "1px", height: "12px", backgroundColor: "#000" }} />
                  {/* BL */}
                  <div style={{ position: "absolute", bottom: "-8px", left: "-8px", width: "12px", height: "1px", backgroundColor: "#000" }} />
                  <div style={{ position: "absolute", bottom: "-8px", left: "-8px", width: "1px", height: "12px", backgroundColor: "#000" }} />
                  {/* BR */}
                  <div style={{ position: "absolute", bottom: "-8px", right: "-8px", width: "12px", height: "1px", backgroundColor: "#000" }} />
                  <div style={{ position: "absolute", bottom: "-8px", right: "-8px", width: "1px", height: "12px", backgroundColor: "#000" }} />

                  <div
                    style={{
                      border: "1px solid #000",
                      minHeight: "350px",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                    }}
                  >
                    {artworkImage ? (
                      <img
                        src={artworkImage}
                        alt="Artwork"
                        style={{ maxWidth: "100%", maxHeight: "350px", objectFit: "contain" }}
                      />
                    ) : (
                      <span style={{ color: "#999", fontSize: "12px" }}>Artwork will appear here</span>
                    )}
                  </div>
                </div>

                {/* ── SECTION 3: BOTTOM TWO COLUMNS ── */}
                <div style={{ display: "flex", gap: "12px", marginTop: "14px" }}>
                  {/* Bottom Left 60% */}
                  <div style={{ flex: "0 0 60%", fontSize: "8px", lineHeight: "1.4" }}>
                    <div style={{ fontWeight: "bold", fontSize: "11px", marginBottom: "2px" }}>
                      Approval For Attached Job For Film Output
                    </div>
                    <div style={{ fontWeight: "bold", fontStyle: "italic", fontSize: "11px", marginBottom: "6px" }}>
                      Sign &amp; Fax Back This Proof
                    </div>
                    <div style={{ color: "#555", marginBottom: "5px" }}>{DISCLAIMER}</div>
                    <div style={{ fontWeight: "bold", marginBottom: "3px" }}>
                      IF CREDIT ACCOUNT HAS NOT BEEN ESTABLISHED WITH BOTTLES &amp; PRINT, PAYMENT IN FULL WILL BE REQUIRED BEFORE FILM AND/OR ARTWORK IS PRODUCED.
                    </div>
                    <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
                      FILM WILL NOT BE PRODUCED WITHOUT A SIGNATURE BY THE CUSTOMER.
                    </div>
                    <div style={{ borderTop: "1px solid #000", paddingTop: "6px" }}>
                      Customer Signature _________________________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Date _______________
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
                      borderLeft: "1px solid #ddd",
                      paddingLeft: "12px",
                      gap: "4px",
                    }}
                  >
                    <div style={{ fontStyle: "italic", fontSize: "18px", fontFamily: "Georgia, serif", textAlign: "center" }}>
                      Size: {specs.width || "—"} x {specs.height || "—"} inches
                    </div>
                    <div style={{ fontStyle: "italic", fontSize: "18px", fontFamily: "Georgia, serif", textAlign: "center" }}>
                      Color: {specs.colors || "—"}
                    </div>
                    <div style={{ fontStyle: "italic", fontSize: "14px", fontFamily: "Georgia, serif", color: "#D97706", textAlign: "center" }}>
                      DIELINE DOES NOT PRINT
                    </div>
                    <div style={{ fontSize: "52px", fontWeight: "bold", color: "#000", textAlign: "center", lineHeight: "1", letterSpacing: "-1px" }}>
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
