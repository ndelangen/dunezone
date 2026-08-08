import { useMemo, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

function toDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const CHECKER =
  "bg-[repeating-conic-gradient(#f3f3f3_0%_25%,#fff_0%_50%)] bg-[length:20px_20px]";

function Frame({
  svg,
  alt,
  testid,
}: {
  svg: string;
  alt: string;
  testid: string;
}) {
  return (
    <div
      className={`${CHECKER} flex min-h-64 flex-1 items-center justify-center rounded-lg border p-4`}
    >
      <img
        src={toDataUri(svg)}
        alt={alt}
        data-testid={testid}
        className="max-h-[55vh] max-w-full object-contain"
      />
    </div>
  );
}

export function PreviewPanel() {
  const docs = useAppStore((s) => s.docs);
  const previewId = useAppStore((s) => s.previewId);
  const setPreview = useAppStore((s) => s.setPreview);
  const [view, setView] = useState<"single" | "all">("single");

  const doc = useMemo(
    () => docs.find((d) => d.id === previewId) ?? docs[0],
    [docs, previewId],
  );

  if (!doc) {
    return (
      <div className="text-muted-foreground flex h-full min-h-64 items-center justify-center text-sm">
        Upload or paste an SVG to preview it here
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Tabs value={view} onValueChange={(v) => setView(v as "single" | "all")}>
          <TabsList>
            <TabsTrigger value="single" data-testid="view-single">
              Selected
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="view-all">
              All ({docs.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {view === "single" && docs.length > 1 ? (
          <Select value={doc.id} onValueChange={(id) => setPreview(id)}>
            <SelectTrigger
              className="ml-auto w-44"
              data-testid="preview-select"
              aria-label="Choose file to preview"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {docs.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {view === "single" ? (
        <>
          <div
            className="text-muted-foreground text-xs font-medium"
            data-testid="preview-name"
          >
            {doc.name}
          </div>
          <Tabs defaultValue="after" className="flex-1">
            <TabsList>
              <TabsTrigger value="before" data-testid="tab-before">
                Before
              </TabsTrigger>
              <TabsTrigger value="after" data-testid="tab-after">
                After
              </TabsTrigger>
            </TabsList>
            <TabsContent value="before" className="flex">
              <Frame
                svg={doc.original}
                alt={`${doc.name} (before)`}
                testid="preview-before"
              />
            </TabsContent>
            <TabsContent value="after" className="flex">
              <Frame
                svg={doc.current}
                alt={`${doc.name} (after)`}
                testid="preview-image"
              />
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <div
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          data-testid="preview-gallery"
        >
          {docs.map((d) => (
            <button
              type="button"
              key={d.id}
              onClick={() => {
                setPreview(d.id);
                setView("single");
              }}
              data-testid="gallery-item"
              title={d.name}
              className={cn(
                "flex flex-col gap-1 rounded-lg border p-1 text-left transition hover:border-foreground/40",
                d.id === doc.id && "ring-primary border-primary ring-2",
              )}
            >
              <div
                className={`${CHECKER} flex h-24 items-center justify-center rounded`}
              >
                <img
                  src={toDataUri(d.current)}
                  alt={d.name}
                  className="max-h-full max-w-full object-contain p-1"
                />
              </div>
              <span className="text-muted-foreground truncate px-1 text-[11px]">
                {d.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
