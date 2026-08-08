import { useState } from "react";
import { toast } from "sonner";
import { Box, Loader2, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppStore } from "@/store/useAppStore";
import {
  downloadObj,
  downloadZip,
  ensureExtension,
  replaceExtension,
  zipFilename,
} from "@/lib/download";
import { svgToObj } from "@/lib/obj/svgToObj";

export function ObjExportPanel() {
  const docs = useAppStore((s) => s.docs);
  const zipName = useAppStore((s) => s.zipName);
  const [depth, setDepth] = useState(10);
  const [curveSegments, setCurveSegments] = useState(12);
  const [precision, setPrecision] = useState(4);
  const [weld, setWeld] = useState(true);
  const [includeNormals, setIncludeNormals] = useState(true);
  const [busy, setBusy] = useState(false);

  const selectedDocs = docs.filter((d) => d.selected);
  const hasSelection = selectedDocs.length > 0;

  const buildOptions = () => ({
    depth,
    curveSegments,
    precision,
    weld,
    includeNormals,
  });

  const exportObj = async () => {
    if (selectedDocs.length === 0 || busy) return;
    setBusy(true);
    try {
      const options = buildOptions();
      if (selectedDocs.length === 1) {
        const obj = await svgToObj(selectedDocs[0].current, options);
        downloadObj(selectedDocs[0].name, obj);
      } else {
        const entries = await Promise.all(
          selectedDocs.map(async (d) => ({
            name: replaceExtension(d.name, ".obj"),
            content: await svgToObj(d.current, options),
          })),
        );
        await downloadZip(entries, zipFilename(zipName));
      }
      toast.success(
        `Exported ${selectedDocs.length} OBJ file${selectedDocs.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(`OBJ export failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const exportSvgAndObj = async () => {
    if (selectedDocs.length === 0 || busy) return;
    setBusy(true);
    try {
      const options = buildOptions();
      const entries = (
        await Promise.all(
          selectedDocs.map(async (d) => [
            { name: ensureExtension(d.name, ".svg"), content: d.current },
            {
              name: replaceExtension(d.name, ".obj"),
              content: await svgToObj(d.current, options),
            },
          ]),
        )
      ).flat();
      await downloadZip(entries, zipFilename(zipName));
      toast.success(
        `Exported SVG + OBJ for ${selectedDocs.length} file${selectedDocs.length === 1 ? "" : "s"}`,
      );
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2 font-medium">
        <Box className="size-4" /> Export OBJ (3D)
      </div>
      <p className="text-muted-foreground text-xs">
        Extrude each SVG flat on the ground (Y-up). Thickness controls height above
        the floor.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="obj-depth">Thickness</Label>
          <Input
            id="obj-depth"
            data-testid="obj-depth"
            type="number"
            min={1}
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="obj-curve">Curve quality</Label>
          <Input
            id="obj-curve"
            data-testid="obj-curve"
            type="number"
            min={1}
            max={24}
            value={curveSegments}
            onChange={(e) => setCurveSegments(Number(e.target.value))}
            className="w-20"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="obj-precision">Precision</Label>
          <Input
            id="obj-precision"
            data-testid="obj-precision"
            type="number"
            min={0}
            max={8}
            value={precision}
            onChange={(e) => setPrecision(Number(e.target.value))}
            className="w-20"
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={weld}
            onCheckedChange={setWeld}
            data-testid="obj-weld"
            aria-label="Weld duplicate vertices"
          />
          <Label className="font-normal">Weld duplicate vertices</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={includeNormals}
            onCheckedChange={setIncludeNormals}
            data-testid="obj-normals"
            aria-label="Include normals"
          />
          <Label className="font-normal">Include normals (vn)</Label>
        </div>
      </div>
      <Button
        type="button"
        onClick={exportObj}
        disabled={!hasSelection || busy}
        data-testid="export-obj"
        className="w-fit"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Box />}
        Export OBJ
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={exportSvgAndObj}
        disabled={!hasSelection || busy}
        data-testid="export-svg-obj-zip"
      >
        {busy ? <Loader2 className="animate-spin" /> : <Package />}
        Download SVG + OBJ (ZIP)
      </Button>
    </section>
  );
}
