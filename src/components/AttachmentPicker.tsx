import { useRef, useState, useCallback } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface AttachedFile {
  filename: string;
  mimeType: string;
  data: string; // raw base64, no data-URI prefix
  size: number;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

/** Encode a File to raw base64 (chunked, no stack overflow). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:<mime>;base64," prefix
      const base64 = result.substring(result.indexOf(",") + 1);
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  files: AttachedFile[];
  onChange: (files: AttachedFile[]) => void;
}

export function AttachmentPicker({ files, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draggingOver, setDraggingOver] = useState(false);

  const addFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const incoming = Array.from(fileList);
    const valid: AttachedFile[] = [];

    for (const file of incoming) {
      if (file.size > MAX_SIZE) {
        toast.error(`"${file.name}" is too large. Max size is 10 MB per file.`);
        continue;
      }
      const base64 = await fileToBase64(file);
      valid.push({ filename: file.name, mimeType: file.type || "application/octet-stream", data: base64, size: file.size });
    }

    if (valid.length) onChange([...files, ...valid]);
  }, [files, onChange]);

  const remove = (idx: number) => {
    onChange(files.filter((_, i) => i !== idx));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDraggingOver(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={`rounded-xl border border-dashed transition-colors p-3 space-y-2 ${draggingOver ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
      onDragOver={e => { e.preventDefault(); setDraggingOver(true); }}
      onDragLeave={() => setDraggingOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={e => { addFiles(e.target.files); if (inputRef.current) inputRef.current.value = ""; }}
      />

      <Button
        type="button"
        size="sm"
        variant="outline"
        className="rounded-lg text-xs gap-1.5 h-7"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip size={12} /> Attach Files
      </Button>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-xs font-sans bg-background rounded-lg px-2 py-1.5 border">
              <span className="truncate max-w-[240px] text-foreground">{f.filename}</span>
              <span className="text-muted-foreground shrink-0">{formatSize(f.size)}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-destructive hover:text-destructive/80 shrink-0"
                aria-label="Remove attachment"
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {files.length === 0 && (
        <p className="text-[11px] text-muted-foreground font-sans">or drag &amp; drop files here · max 10 MB each</p>
      )}
    </div>
  );
}
