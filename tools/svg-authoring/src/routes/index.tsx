import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { UploadPanel } from "@/components/feature/UploadPanel";
import { FileTable } from "@/components/feature/FileTable";
import { PreviewPanel } from "@/components/feature/PreviewPanel";
import { PipelinePanel } from "@/components/feature/PipelinePanel";
import { PresetBar } from "@/components/feature/PresetBar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePersistence } from "@/hooks/usePersistence";
import { useAppStore } from "@/store/useAppStore";
import { clearSession } from "@/lib/persistence/session";

export const Route = createFileRoute("/")({
  component: Workspace,
});

function Workspace() {
  usePersistence();
  const docCount = useAppStore((s) => s.docs.length);
  const clearAll = useAppStore((s) => s.clearAll);

  const handleClearAll = () => {
    clearAll();
    void clearSession();
    toast.message("Cleared all files");
  };

  return (
    <div className="bg-background min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold">SVG Pipeline Tool</h1>
            <p className="text-muted-foreground text-xs">
              Browser-only batch SVG normalization. Nothing leaves your machine.
            </p>
          </div>
          <PresetBar />
        </div>
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 px-6 py-6 lg:grid-cols-[minmax(340px,1fr)_minmax(360px,1.2fr)_minmax(320px,1fr)]">
        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Files {docCount > 0 ? `(${docCount})` : ""}</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={docCount === 0}
              data-testid="clear-all"
            >
              <Trash2 /> Clear all
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <UploadPanel />
            <FileTable />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <PreviewPanel />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <PipelinePanel />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
