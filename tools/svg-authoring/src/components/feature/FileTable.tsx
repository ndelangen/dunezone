import { Trash2, Eye, RotateCcw, FlipHorizontal, FlipVertical } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { formatViewBox, countPathCommands } from "@/lib/svg/meta";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

export function FileTable() {
  const docs = useAppStore((s) => s.docs);
  const previewId = useAppStore((s) => s.previewId);
  const toggleSelected = useAppStore((s) => s.toggleSelected);
  const setAllSelected = useAppStore((s) => s.setAllSelected);
  const removeDoc = useAppStore((s) => s.removeDoc);
  const setPreview = useAppStore((s) => s.setPreview);
  const toggleFlip = useAppStore((s) => s.toggleFlip);
  const resetDoc = useAppStore((s) => s.resetDoc);

  if (docs.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm" data-testid="empty-state">
        No files yet. Upload or paste an SVG to get started.
      </p>
    );
  }

  const allSelected = docs.every((d) => d.selected);

  return (
    <Table data-testid="file-table">
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">
            <input
              type="checkbox"
              aria-label="Select all"
              checked={allSelected}
              onChange={(e) => setAllSelected(e.target.checked)}
              data-testid="select-all"
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>viewBox</TableHead>
          <TableHead>Paths</TableHead>
          <TableHead>Flip</TableHead>
          <TableHead className="w-20 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {docs.map((doc) => {
          const origCount = countPathCommands(doc.original);
          const curCount = countPathCommands(doc.current);
          return (
            <TableRow
              key={doc.id}
              data-testid="file-row"
              data-name={doc.name}
              data-state={doc.id === previewId ? "selected" : undefined}
              className={cn(doc.id === previewId && "bg-muted/60")}
            >
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Select ${doc.name}`}
                  checked={doc.selected}
                  onChange={() => toggleSelected(doc.id)}
                  data-testid="row-select"
                />
              </TableCell>
              <TableCell className="max-w-36 truncate font-medium" title={doc.name}>
                {doc.name}
              </TableCell>
              <TableCell>
                <Badge variant="outline" data-testid="viewbox-badge">
                  {doc.meta.viewBox ? formatViewBox(doc.meta.viewBox) : "—"}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" data-testid="path-count">
                  {origCount === curCount ? curCount : `${origCount}→${curCount}`}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Toggle
                    size="sm"
                    variant="outline"
                    pressed={doc.flip.x}
                    onPressedChange={() => toggleFlip(doc.id, "x")}
                    aria-label={`Flip ${doc.name} horizontally`}
                    data-testid="flip-x"
                  >
                    <FlipHorizontal />
                  </Toggle>
                  <Toggle
                    size="sm"
                    variant="outline"
                    pressed={doc.flip.y}
                    onPressedChange={() => toggleFlip(doc.id, "y")}
                    aria-label={`Flip ${doc.name} vertically`}
                    data-testid="flip-y"
                  >
                    <FlipVertical />
                  </Toggle>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Preview ${doc.name}`}
                    onClick={() => setPreview(doc.id)}
                    data-testid="row-preview"
                  >
                    <Eye />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Reset ${doc.name}`}
                    onClick={() => resetDoc(doc.id)}
                    data-testid="row-reset"
                  >
                    <RotateCcw />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${doc.name}`}
                    onClick={() => removeDoc(doc.id)}
                    data-testid="row-remove"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
