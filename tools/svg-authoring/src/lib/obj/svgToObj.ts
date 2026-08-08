/**
 * The OBJ chain now lives in the dunezone shared pipeline (one implementation for the
 * build generator and this tool, per the monorepo decision) — this module keeps the
 * tool-local import path and its historical async signature.
 */
import { svgToObj as sharedSvgToObj } from "@dunezone/shared/svgToObj";
import type { ObjExportOptions } from "@dunezone/shared/svgToObj";

export type { ObjExportOptions };

export async function preloadObjExporter(): Promise<void> {
  // three is bundled statically now; nothing to preload.
}

export async function svgToObj(
  svg: string,
  options?: Partial<ObjExportOptions>,
): Promise<string> {
  return sharedSvgToObj(svg, options);
}
