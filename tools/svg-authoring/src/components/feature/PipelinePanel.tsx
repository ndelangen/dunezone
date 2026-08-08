import { toast } from "sonner";
import { Download, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/useAppStore";
import {
  downloadSvg,
  downloadZip,
  ensureExtension,
  zipFilename,
} from "@/lib/download";
import { ObjExportPanel } from "./ObjExportPanel";

function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  step,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        data-testid={id}
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          // Browser min/step are hints, not validation: never store NaN or
          // negatives in step configuration.
          if (Number.isFinite(n) && n >= min) onChange(n);
        }}
        className="w-24"
      />
    </div>
  );
}

function StepHeader({
  stepId,
  title,
}: {
  stepId: string;
  title: string;
}) {
  const enabled = useAppStore((s) => s.steps[stepId]?.enabled ?? false);
  const setStepEnabled = useAppStore((s) => s.setStepEnabled);
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={enabled}
        onCheckedChange={(v) => setStepEnabled(stepId, v)}
        data-testid={`toggle-${stepId}`}
        aria-label={`Enable ${title}`}
      />
      <AccordionTrigger className="py-3">{title}</AccordionTrigger>
    </div>
  );
}

export function PipelinePanel() {
  const docs = useAppStore((s) => s.docs);
  const steps = useAppStore((s) => s.steps);
  const setStepConfig = useAppStore((s) => s.setStepConfig);
  const runStepById = useAppStore((s) => s.runStepById);
  const runPipeline = useAppStore((s) => s.runPipeline);
  const zipName = useAppStore((s) => s.zipName);
  const setZipName = useAppStore((s) => s.setZipName);

  const selectedDocs = docs.filter((d) => d.selected);
  const hasDocs = docs.length > 0;
  const hasSelection = selectedDocs.length > 0;

  const handleRunPipeline = async () => {
    await runPipeline();
    toast.success(`Ran pipeline on ${selectedDocs.length} file${selectedDocs.length === 1 ? "" : "s"}`);
  };

  const cropCfg = steps.cropToContent.config as { marginRatio: number };
  const optimizeCfg = steps.optimizePaths.config as {
    level: string;
    decimalPrecision: number;
    removeMetadata: boolean;
  };
  const colorCfg = steps.overrideColor.config as {
    color: string;
    target: string;
  };
  const rootIdCfg = steps.setRootId.config as { id: string };

  const zipFile = zipFilename(zipName);

  const handleDownloadSelected = async () => {
    if (selectedDocs.length === 0) return;
    if (selectedDocs.length === 1) {
      downloadSvg(selectedDocs[0].name, selectedDocs[0].current);
      return;
    }
    await downloadZip(
      selectedDocs.map((d) => ({
        name: ensureExtension(d.name, ".svg"),
        content: d.current,
      })),
      zipFile,
    );
  };

  const handleDownloadAll = async () => {
    if (docs.length === 0) return;
    await downloadZip(
      docs.map((d) => ({
        name: ensureExtension(d.name, ".svg"),
        content: d.current,
      })),
      zipFile,
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Accordion
        type="multiple"
        defaultValue={["cropToContent"]}
        className="rounded-lg border px-3"
      >
        <AccordionItem value="cropToContent">
          <StepHeader stepId="cropToContent" title="Crop to content" />
          <AccordionContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              Trim each viewBox tightly to content, then pad by a safety margin.
            </p>
            <div className="flex items-end gap-3">
              <NumberField
                id="margin-input"
                label="Margin ratio"
                value={cropCfg.marginRatio}
                min={0}
                step={0.01}
                onChange={(n) => setStepConfig("cropToContent", { marginRatio: n })}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => runStepById("cropToContent")}
                disabled={!hasSelection}
                data-testid="run-crop"
              >
                Run crop
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="optimizePaths">
          <StepHeader stepId="optimizePaths" title="Optimize" />
          <AccordionContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              Clean dirty paths: simplify commands, drop redundant points, round
              coordinates, strip metadata.
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="optimize-level">Level</Label>
              <Select
                value={optimizeCfg.level}
                onValueChange={(v) =>
                  setStepConfig("optimizePaths", { level: v })
                }
              >
                <SelectTrigger
                  id="optimize-level"
                  data-testid="optimize-level"
                  className="w-44"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">Light (per-path)</SelectItem>
                  <SelectItem value="medium">Medium (document)</SelectItem>
                  <SelectItem value="heavy">Heavy (SVGO)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumberField
              id="optimize-precision"
              label="Decimal precision"
              value={optimizeCfg.decimalPrecision}
              onChange={(n) =>
                setStepConfig("optimizePaths", { decimalPrecision: n })
              }
            />
            <div className="flex items-center gap-2">
              <Switch
                checked={optimizeCfg.removeMetadata}
                onCheckedChange={(v) =>
                  setStepConfig("optimizePaths", { removeMetadata: v })
                }
                data-testid="optimize-remove-metadata"
                aria-label="Remove metadata"
              />
              <Label className="font-normal">Strip comments &amp; metadata</Label>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onClick={() => runStepById("optimizePaths")}
              disabled={!hasSelection}
              data-testid="run-step-optimizePaths"
            >
              Run optimize
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="overrideColor">
          <StepHeader stepId="overrideColor" title="Override color" />
          <AccordionContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              Recolor every shape to one color. Shapes set to <code>none</code>{" "}
              are left untouched.
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="color-value">Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Color picker"
                  value={/^#[0-9a-fA-F]{6}$/.test(colorCfg.color) ? colorCfg.color : "#000000"}
                  onChange={(e) =>
                    setStepConfig("overrideColor", { color: e.target.value })
                  }
                  data-testid="color-picker"
                  className="size-9 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <Input
                  id="color-value"
                  data-testid="color-value"
                  value={colorCfg.color}
                  onChange={(e) =>
                    setStepConfig("overrideColor", { color: e.target.value })
                  }
                  className="w-32"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="color-target">Apply to</Label>
              <Select
                value={colorCfg.target}
                onValueChange={(v) =>
                  setStepConfig("overrideColor", { target: v })
                }
              >
                <SelectTrigger id="color-target" data-testid="color-target" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fill">Fill</SelectItem>
                  <SelectItem value="stroke">Stroke</SelectItem>
                  <SelectItem value="both">Fill &amp; stroke</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onClick={() => runStepById("overrideColor")}
              disabled={!hasSelection}
              data-testid="run-step-overrideColor"
            >
              Run recolor
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="setRootId">
          <StepHeader stepId="setRootId" title="Set root id" />
          <AccordionContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              Add an <code>id</code> to the root <code>{"<svg>"}</code> so it can
              be referenced via <code>{'<use href="#root">'}</code>.
            </p>
            <div className="flex flex-col gap-1">
              <Label htmlFor="root-id">Id</Label>
              <Input
                id="root-id"
                data-testid="root-id"
                value={rootIdCfg.id}
                onChange={(e) => setStepConfig("setRootId", { id: e.target.value })}
                className="w-32"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onClick={() => runStepById("setRootId")}
              disabled={!hasSelection}
              data-testid="run-step-setRootId"
            >
              Set id
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="stampAuthored">
          <StepHeader stepId="stampAuthored" title="Stamp provenance" />
          <AccordionContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              Mark files as processed by this tool — the dunezone vector verifier requires
              the stamp on every source.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onClick={() => runStepById("stampAuthored")}
              disabled={!hasSelection}
              data-testid="run-step-stampAuthored"
            >
              Stamp
            </Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="formatCode">
          <StepHeader stepId="formatCode" title="Format SVG code" />
          <AccordionContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-xs">
              Pretty-print the markup with indentation instead of a single line.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              onClick={() => runStepById("formatCode")}
              disabled={!hasSelection}
              data-testid="run-step-formatCode"
            >
              Format code
            </Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Button
        type="button"
        onClick={handleRunPipeline}
        disabled={!hasSelection}
        data-testid="run-pipeline"
      >
        <Play /> Run pipeline (enabled steps)
      </Button>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Export</span>
          <Badge variant="secondary" data-testid="selected-count">
            {selectedDocs.length} selected
          </Badge>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="zip-name">Zip file name</Label>
          <div className="flex items-center gap-2">
            <Input
              id="zip-name"
              data-testid="zip-name"
              value={zipName}
              onChange={(e) => setZipName(e.target.value)}
              placeholder="svg-pipeline-export"
              className="flex-1"
            />
            <span className="text-muted-foreground text-xs">.zip</span>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadSelected}
            disabled={!hasSelection}
            data-testid="download-selected"
          >
            <Download /> Download selected
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDownloadAll}
            disabled={!hasDocs}
            data-testid="download-all"
          >
            <Download /> Download all (ZIP)
          </Button>
        </div>
      </section>

      <ObjExportPanel />
    </div>
  );
}
