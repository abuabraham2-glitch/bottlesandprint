import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, FileText, CheckCircle2, AlertCircle } from "lucide-react";

const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.docx,.txt";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function QuoteBuilder() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [notesText, setNotesText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      setStatus("error");
      return;
    }
    setFile(f);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }, []);

  const readFileAsBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]); // strip data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleSubmit = async () => {
    setEmailError("");
    setStatus("idle");

    if (!clientName.trim()) {
      setEmailError("Client name is required to generate a quote.");
      return;
    }

    setLoading(true);

    try {
      let fileData: string | null = null;
      let fileName: string | null = null;
      let fileType: string | null = null;

      if (file) {
        fileData = await readFileAsBase64(file);
        fileName = file.name;
        fileType = file.type;
      }

      const res = await fetch(
        "https://bottlesandprint.app.n8n.cloud/webhook/quote-builder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: clientName.trim(),
            client_email: clientEmail.trim(),
            notes_text: notesText.trim(),
            file_data: fileData,
            file_name: fileName,
            file_type: fileType,
          }),
        }
      );

      if (!res.ok) throw new Error("Webhook error");

      setStatus("success");
      setClientName("");
      setClientEmail("");
      setNotesText("");
      setFile(null);

      setTimeout(() => navigate("/inbox"), 2000);
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-[720px] mx-auto px-4 py-8 md:py-12 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Quote Builder</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Paste notes, type details, or drop a file to generate a quote.
          </p>
        </div>

        {/* Client Info */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Client Info</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="client-name" className="text-xs text-muted-foreground">Client Name <span className="text-destructive">*</span></Label>
              <Input
                id="client-name"
                placeholder="e.g. Maddy Smith"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="rounded-[9px] border-[1.5px] border-border-mid h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client-email" className="text-xs text-muted-foreground">
                Client Email
              </Label>
              <Input
                id="client-email"
                type="email"
                placeholder="e.g. maddy@example.com"
                value={clientEmail}
                onChange={(e) => { setClientEmail(e.target.value); setEmailError(""); }}
                className={`rounded-[9px] border-[1.5px] h-10 ${emailError ? "border-destructive" : "border-border-mid"}`}
              />
              {emailError && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertCircle size={12} /> {emailError}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="space-y-1.5">
          <Label htmlFor="notes" className="text-sm font-semibold text-foreground">
            Meeting Notes / Call Notes
          </Label>
          <Textarea
            id="notes"
            placeholder="Paste or type your notes here — quantities, colors, bottle types, SKUs, anything the client mentioned. AI will extract the relevant details."
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            className="rounded-[9px] border-[1.5px] border-border-mid min-h-[200px] resize-y"
          />
        </section>

        {/* File Upload */}
        <section className="space-y-1.5">
          <Label className="text-sm font-semibold text-foreground">Or drop a file (optional)</Label>
          <p className="text-xs text-muted-foreground mb-2">
            Supports PDF, JPG, PNG, Word (.docx), or plain text files. Max 10MB.
          </p>

          {file ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-[1.5px] border-border-mid bg-muted/40">
              <FileText size={18} className="text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground truncate flex-1">{file.name}</span>
              <button
                onClick={() => setFile(null)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-2 py-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border-mid hover:border-primary/40"
              }`}
            >
              <Upload size={24} className="text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click or drag & drop a file here
              </span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
        </section>

        {/* Status messages */}
        {status === "success" && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-sm font-medium">
            <CheckCircle2 size={16} />
            Quote draft created! Check your Needs My Reply inbox.
          </div>
        )}
        {status === "error" && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm font-medium">
            <AlertCircle size={16} />
            Something went wrong. Please try again.
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full h-11 rounded-[9px] font-bold text-sm shadow-[0_3px_12px_rgba(37,99,235,0.28)]"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Generating quote…
            </>
          ) : (
            "Generate Quote"
          )}
        </Button>
      </div>
    </div>
  );
}
