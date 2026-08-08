import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Upload, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { readSvgFiles, looksLikeSvg } from "@/lib/svg/ingest";
import { useAppStore } from "@/store/useAppStore";

export function UploadPanel() {
  const addDocs = useAppStore((s) => s.addDocs);
  const addPaste = useAppStore((s) => s.addPaste);
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const docs = await readSvgFiles(accepted);
      addDocs(docs);
      if (docs.length > 0) {
        toast.success(`Added ${docs.length} file${docs.length === 1 ? "" : "s"}`);
      } else if (accepted.length > 0) {
        toast.error("No valid SVG files found");
      }
    },
    [addDocs],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/svg+xml": [".svg"] },
    multiple: true,
  });

  const handleAddPaste = () => {
    if (!looksLikeSvg(paste)) {
      setPasteError("That doesn't look like SVG markup.");
      return;
    }
    setPasteError(null);
    addPaste(paste);
    setPaste("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps()}
        data-testid="file-dropzone"
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors",
          isDragActive ? "border-primary bg-accent" : "border-input hover:bg-accent/50",
        )}
      >
        <input {...getInputProps()} data-testid="file-input" />
        <Upload className="text-muted-foreground size-6" />
        <p className="text-sm font-medium">Drop SVG files here</p>
        <p className="text-muted-foreground text-xs">or click to browse (multiple allowed)</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="paste-area">Paste SVG code</Label>
        <Textarea
          id="paste-area"
          data-testid="paste-textarea"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="<svg ...>...</svg>"
          className="min-h-28 font-mono text-xs"
        />
        {pasteError ? (
          <p className="text-destructive text-xs" data-testid="paste-error">
            {pasteError}
          </p>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          onClick={handleAddPaste}
          disabled={paste.trim().length === 0}
          data-testid="add-paste"
        >
          <Plus /> Add pasted SVG
        </Button>
      </div>
    </div>
  );
}
