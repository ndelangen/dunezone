import { cropToContent } from "./steps/cropToContent";
import { mirrorFlip } from "./steps/mirrorFlip";
import { optimizePaths } from "./steps/optimizePaths";
import { overrideColor } from "./steps/overrideColor";
import { setRootId } from "./steps/setRootId";
import { stampAuthored } from "./steps/stampAuthored";
import { formatCode } from "./steps/formatCode";
import type { PipelineStep } from "./step";

/**
 * Ordered list of pipeline steps. The default execution order matches this array:
 * crop -> flip -> optimize -> color -> root id -> stamp -> format. Recolor/root-id run
 * after optimize so SVGO can't strip them; the provenance stamp lands after all content
 * edits; formatting runs last so its indentation survives.
 *
 * Scale/aspect normalization deliberately has no step here: the dunezone build generator
 * normalizes every source into the shared 0 0 100 100 space — the tool authors sources.
 */
export const PIPELINE_STEPS: PipelineStep<any>[] = [
  cropToContent,
  mirrorFlip,
  optimizePaths,
  overrideColor,
  setRootId,
  stampAuthored,
  formatCode,
];

export function getStep(id: string): PipelineStep<any> | undefined {
  return PIPELINE_STEPS.find((s) => s.id === id);
}
